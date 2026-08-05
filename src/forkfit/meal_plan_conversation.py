from __future__ import annotations

import json
import re
from copy import deepcopy
from dataclasses import asdict, dataclass
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from forkfit.constraints import ConstraintGuard, ConstraintNormalizer
from forkfit.llm import BailianLLMClient, LLMClient
from forkfit.meal_planner import MealPlanResult, MealPlanWorkflow
from forkfit.models import Meal, MealPack
from forkfit.serialization import user_profile_from_dict
from forkfit.stores.meal_plans import MealPlanRecord


ConversationIntentKind = Literal[
    "modify_day",
    "replace_recipe",
    "change_ingredient",
    "change_constraint",
    "rebalance_plan",
    "regenerate_remaining",
    "explain",
    "undo",
    "lock_day",
    "clarification",
]


class ConversationIntent(BaseModel):
    kind: ConversationIntentKind
    day_index: int | None = Field(default=None, ge=1, le=7)
    raw_text: str
    requires_confirmation: bool = False
    question: str = ""


class ConversationPatchOperation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    op: Literal[
        "replace_recipe",
        "replace_ingredient",
        "add_ingredient",
        "remove_ingredient",
        "replace_equipment",
        "set_cook_time",
        "replace_steps",
        "update_tags",
        "set_notes",
    ]
    meal_id: str
    target: str = ""
    value: Any
    reason: str = ""


class ConversationPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    operations: list[ConversationPatchOperation] = Field(default_factory=list, max_length=20)
    summary: str = Field(default="菜单已更新", max_length=300)
    message: str = Field(default="菜单已按你的要求更新。", max_length=600)


@dataclass(frozen=True, slots=True)
class ConversationResult:
    status: Literal["applied", "needs_clarification", "needs_confirmation"]
    intent: ConversationIntent
    message: str
    summary: str
    result: MealPlanResult | None = None
    patch: ConversationPatch | None = None
    locked_days: list[int] | None = None


class MealPlanConversationWorkflow:
    """Stateful conversation layer that edits a plan instead of recreating it blindly."""

    def __init__(self, llm: LLMClient | None = None) -> None:
        self.llm = llm or BailianLLMClient()
        self.guard = ConstraintGuard()
        self.normalizer = ConstraintNormalizer()

    def process(
        self,
        plan: MealPlanRecord,
        text: str,
        *,
        confirmed: bool = False,
    ) -> ConversationResult:
        if plan.result is None:
            raise ValueError("这份菜单还没有生成完成。")
        intent = self.parse_intent(text, plan)
        if intent.kind == "clarification":
            return ConversationResult(
                status="needs_clarification",
                intent=intent,
                message=intent.question,
                summary="需要确认你想修改的方向。",
            )
        if intent.requires_confirmation and not confirmed:
            return ConversationResult(
                status="needs_confirmation",
                intent=intent,
                message=self._confirmation_message(intent),
                summary="这次修改会影响多天菜单或已有硬约束。",
            )
        if intent.kind == "explain":
            return ConversationResult(
                status="applied",
                intent=intent,
                message=self._explain(plan, intent.day_index),
                summary="已解释当前安排。",
                result=plan.result,
            )
        if intent.kind == "lock_day":
            if intent.day_index is None:
                raise ValueError("请说明要锁定哪一天。")
            locked = sorted(set(plan.locked_days) | {intent.day_index})
            return ConversationResult(
                status="applied",
                intent=intent,
                message=f"已锁定第 {intent.day_index} 天，后续整体调整不会修改这一天。",
                summary=f"已锁定第 {intent.day_index} 天。",
                result=plan.result,
                locked_days=locked,
            )
        if intent.kind == "undo":
            raise ValueError("撤销由版本服务处理。")
        if intent.kind in {"rebalance_plan", "change_constraint", "regenerate_remaining"}:
            result = self._replan(plan, text)
            self._validate_result(plan, result, text)
            return ConversationResult(
                status="applied",
                intent=intent,
                message="已根据你的新要求重新安排菜单，锁定的日期保持不变。",
                summary="已重新平衡整份菜单。",
                result=result,
            )
        patch = self._make_patch(plan, intent, text)
        result = self._apply_patch(plan.result, patch)
        self._validate_result(plan, result, text)
        return ConversationResult(
            status="applied",
            intent=intent,
            message=patch.message,
            summary=patch.summary,
            result=result,
            patch=patch,
        )

    @classmethod
    def parse_intent(cls, text: str, plan: MealPlanRecord) -> ConversationIntent:
        value = text.strip()
        if not value:
            return ConversationIntent(
                kind="clarification",
                raw_text=text,
                question="你想调整哪一天、哪道菜，还是整份菜单？",
            )
        if re.search(r"撤销|恢复上一版|回到上一次", value):
            return ConversationIntent(kind="undo", raw_text=value)
        if re.search(r"为什么|解释|理由", value):
            return ConversationIntent(
                kind="explain", day_index=cls._day_index(value), raw_text=value
            )
        day_index = cls._day_index(value)
        if re.search(r"锁定|固定下来", value):
            return ConversationIntent(
                kind="lock_day", day_index=day_index, raw_text=value
            )
        global_request = bool(
            re.search(r"三天|几天|所有|整体|菜单|每一天|蔬菜多|高蛋白|清淡|口味|饮食", value)
        )
        if global_request and day_index is None:
            kind: ConversationIntentKind = (
                "change_constraint"
                if re.search(r"人数|人吃|分钟|厨具|烤箱|电饭煲|过敏|不吃", value)
                else "rebalance_plan"
            )
            return ConversationIntent(
                kind=kind,
                raw_text=value,
                requires_confirmation=True,
            )
        if re.search(r"换成|换为|换一道|替换|改成", value):
            if day_index is None:
                return ConversationIntent(
                    kind="clarification",
                    raw_text=value,
                    question="你想替换第几天的菜？",
                )
            return ConversationIntent(
                kind="replace_recipe",
                day_index=day_index,
                raw_text=value,
                requires_confirmation=day_index in plan.locked_days,
            )
        if re.search(r"不要|不吃|过敏|去掉|少放|多放|加一点|减少", value):
            if day_index is None and global_request:
                return ConversationIntent(
                    kind="change_constraint",
                    raw_text=value,
                    requires_confirmation=True,
                )
            return ConversationIntent(
                kind="change_ingredient",
                day_index=day_index,
                raw_text=value,
                requires_confirmation=day_index in plan.locked_days if day_index else False,
            )
        if day_index is not None:
            return ConversationIntent(
                kind="modify_day",
                day_index=day_index,
                raw_text=value,
                requires_confirmation=day_index in plan.locked_days,
            )
        return ConversationIntent(
            kind="clarification",
            raw_text=value,
            question="你是想调整口味、耗时、食材，还是菜品类型？也可以直接说第几天要怎么改。",
        )

    def _make_patch(
        self, plan: MealPlanRecord, intent: ConversationIntent, text: str
    ) -> ConversationPatch:
        assert plan.result is not None
        day_index = intent.day_index or 1
        day = next((item for item in plan.result.days if item.day_index == day_index), None)
        if day is None:
            raise ValueError(f"找不到第 {day_index} 天。")
        payload = self.llm.complete_json(
            agent="meal_plan_conversation_patch",
            system=self._patch_prompt(intent),
            user=self._patch_input(plan, intent, text),
            max_tokens=2600,
        )
        try:
            patch = ConversationPatch.model_validate(payload)
        except (TypeError, ValidationError) as exc:
            raise ValueError(
                "我没能把这次修改整理成可执行操作，请具体说明要换成什么菜或食材。"
            ) from exc
        for operation in patch.operations:
            if operation.meal_id not in {day.meal.id, f"day-{day_index}"}:
                raise ValueError("修改目标不是当前菜单中的日期。")
            if operation.meal_id == day.meal.id:
                operation.meal_id = f"day-{day_index}"
        if not patch.operations:
            raise ValueError("没有识别出可执行的修改。")
        return patch

    def _replan(self, plan: MealPlanRecord, text: str) -> MealPlanResult:
        payload = deepcopy(plan.request_payload)
        old_request = str(payload.get("request_text", "")).strip()
        context = str(payload.get("conversation_context", "")).strip()
        context_block = f"\n历史菜单调整：\n{context}" if context else ""
        payload["request_text"] = (
            f"{old_request}{context_block}\n本轮追加要求：{text}"
        ).strip()
        result = MealPlanWorkflow(llm=self.llm).run(payload)
        if plan.locked_days and plan.result is not None:
            locked = {day.day_index: day for day in plan.result.days if day.day_index in plan.locked_days}
            result_data = result.model_dump(mode="json")
            for index, day in locked.items():
                result_data["days"][index - 1] = day.model_dump(mode="json")
            result = MealPlanResult.model_validate(result_data)
        return result

    @staticmethod
    def _apply_patch(result: MealPlanResult, patch: ConversationPatch) -> MealPlanResult:
        data = result.model_dump(mode="json")
        for operation in patch.operations:
            day_index = _day_index_from_meal_id(operation.meal_id)
            if day_index is None:
                raise ValueError("修改补丁缺少有效日期。")
            position = next(
                (index for index, day in enumerate(data["days"]) if day["day_index"] == day_index),
                None,
            )
            if position is None:
                raise ValueError(f"补丁引用了不存在的第 {day_index} 天。")
            meal = data["days"][position]["meal"]
            if operation.op == "replace_recipe":
                if not isinstance(operation.value, dict):
                    raise ValueError("替换菜谱必须包含完整的菜谱结构。")
                meal_fields = {
                    "id",
                    "day",
                    "name",
                    "ingredients",
                    "equipment",
                    "cook_time_minutes",
                    "tags",
                    "notes",
                    "steps",
                    "difficulty",
                }
                replacement_payload = {
                    key: value
                    for key, value in operation.value.items()
                    if key in meal_fields
                }
                replacement_payload.setdefault("id", meal["id"])
                replacement_payload.setdefault("day", meal["day"])
                try:
                    replacement = asdict(Meal(**replacement_payload))
                except (TypeError, ValueError) as exc:
                    raise ValueError("替换菜谱缺少可执行的食材、步骤或时间。") from exc
                replacement["id"] = meal["id"]
                replacement["day"] = meal["day"]
                data["days"][position]["meal"] = replacement
                data["days"][position]["source_post_id"] = None
            elif operation.op == "replace_ingredient":
                source = str(operation.value.get("from", operation.target))
                target = str(operation.value.get("to", ""))
                meal["ingredients"] = [item.replace(source, target) for item in meal["ingredients"]]
                meal["steps"] = [step.replace(source, target) for step in meal["steps"]]
            elif operation.op == "add_ingredient":
                meal["ingredients"].append(str(operation.value))
            elif operation.op == "remove_ingredient":
                target = str(operation.value or operation.target)
                meal["ingredients"] = [item for item in meal["ingredients"] if target not in item]
                meal["steps"] = [step for step in meal["steps"] if target not in step]
            elif operation.op == "replace_equipment":
                meal["equipment"] = [str(item) for item in operation.value]
            elif operation.op == "set_cook_time":
                meal["cook_time_minutes"] = int(operation.value)
            elif operation.op == "replace_steps":
                meal["steps"] = [str(item) for item in operation.value]
            elif operation.op == "update_tags":
                meal["tags"] = [str(item) for item in operation.value]
            elif operation.op == "set_notes":
                meal["notes"] = str(operation.value)
        data["shopping_list"] = _shopping_list(data["days"])
        return MealPlanResult.model_validate(data)

    def _validate_result(self, plan: MealPlanRecord, result: MealPlanResult, text: str) -> None:
        if len(result.days) != len(plan.result.days if plan.result else result.days):
            raise ValueError("修改不能改变菜单天数。")
        indexes = [day.day_index for day in result.days]
        if indexes != list(range(1, len(result.days) + 1)):
            raise ValueError("菜单日期不连续。")
        names: set[str] = set()
        for day in result.days:
            if not day.meal.ingredients or not day.meal.steps:
                raise ValueError(f"第 {day.day_index} 天的食材或步骤不完整。")
            name = day.meal.name.strip().lower()
            if name in names:
                raise ValueError("菜单中不能重复安排同一道菜。")
            names.add(name)
        payload = plan.request_payload
        profile = user_profile_from_dict(payload["user_profile"])
        constraints = self.normalizer.normalize(profile, f"{payload.get('request_text', '')}\n{text}")
        review = self.guard.review(
            MealPack(
                id="conversation-validation",
                title=result.title,
                theme="meal-plan",
                meals=[day.meal for day in result.days],
            ),
            constraints,
            locale=str(payload.get("locale", "zh")),
        )
        if review.findings:
            raise ValueError(review.findings[0].message)

    @staticmethod
    def _day_index(text: str) -> int | None:
        match = re.search(r"第\s*([1-7一二三四五六七])\s*天", text)
        if not match:
            return None
        raw = match.group(1)
        return int(raw) if raw.isdigit() else "一二三四五六七".index(raw) + 1

    @staticmethod
    def _patch_prompt(intent: ConversationIntent) -> str:
        return f"""
你是 ForkFit 的菜谱修改 Agent。当前请求类型是 {intent.kind}，目标日期是第 {intent.day_index or 1} 天。
只返回 JSON，不要 Markdown，不要解释推理过程。输出：
{{
  "operations": [{{
    "op": "replace_recipe | replace_ingredient | add_ingredient | remove_ingredient | replace_equipment | set_cook_time | replace_steps | update_tags | set_notes",
    "meal_id": "day-{intent.day_index or 1}",
    "target": "目标字段或食材",
    "value": "操作值；replace_recipe 时必须是完整 Meal 对象",
    "reason": "简短原因"
  }}],
  "summary": "一句话变化摘要",
  "message": "给用户看的自然中文回复"
}}
规则：只修改用户要求的范围；保留没有被要求改变的内容；不能加入用户明确禁止的食材；replace_recipe 必须包含完整且可执行的 ingredients、steps、equipment、cook_time_minutes；使用中文。
""".strip()

    @staticmethod
    def _patch_input(plan: MealPlanRecord, intent: ConversationIntent, text: str) -> str:
        assert plan.result is not None
        day = next(item for item in plan.result.days if item.day_index == (intent.day_index or 1))
        return json.dumps(
            {
                "request": text,
                "intent": intent.model_dump(),
                "current_day": day.model_dump(mode="json"),
                "locked_days": plan.locked_days,
            },
            ensure_ascii=False,
        )

    @staticmethod
    def _confirmation_message(intent: ConversationIntent) -> str:
        if intent.kind == "change_constraint":
            return "这会影响整份菜单的硬约束，需要重新检查所有日期。确认要按这个要求重新规划吗？"
        return "这会重新安排多天菜单，当前结果会保留为历史版本。确认继续吗？"

    @staticmethod
    def _explain(plan: MealPlanRecord, day_index: int | None) -> str:
        if plan.result is None:
            return "这份菜单还没有生成完成。"
        if day_index is None:
            return plan.result.decision_summary or "这份菜单综合考虑了你的时间、口味和已选菜谱。"
        day = next((item for item in plan.result.days if item.day_index == day_index), None)
        return day.reason if day and day.reason else f"第 {day_index} 天安排了这道菜，以平衡当天的时间和口味。"


def _day_index_from_meal_id(value: str) -> int | None:
    match = re.search(r"(?:day[-_]|第\s*)([1-7])", value)
    return int(match.group(1)) if match else None


def _shopping_list(days: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[str, dict[str, Any]] = {}
    for day in days:
        for raw in day["meal"]["ingredients"]:
            amount, name = _split_ingredient(str(raw))
            item = grouped.setdefault(name, {"name": name, "amounts": [], "used_on": []})
            if amount and amount not in item["amounts"]:
                item["amounts"].append(amount)
            if day["day_index"] not in item["used_on"]:
                item["used_on"].append(day["day_index"])
    return [
        {"name": item["name"], "amount": " + ".join(item["amounts"]) or "适量", "used_on": item["used_on"]}
        for item in grouped.values()
    ]


def _split_ingredient(value: str) -> tuple[str, str]:
    units = r"克|千克|个|杯|茶匙|汤匙|包|片|块|根|张|盎司|毫升|ml|g"
    prefix = re.match(
        rf"^\s*(适量|少许|[\d./]+\s*(?:{units})?)\s*(.*)$",
        value,
        re.I,
    )
    if prefix and prefix.group(2).strip():
        return prefix.group(1).strip(), prefix.group(2).strip()
    suffix = re.match(
        rf"^\s*(.*?)\s+(适量|少许|[\d./]+\s*(?:{units})?)\s*$",
        value,
        re.I,
    )
    if suffix and suffix.group(1).strip():
        return suffix.group(2).strip(), suffix.group(1).strip()
    return "", value.strip()
