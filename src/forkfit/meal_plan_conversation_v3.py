from __future__ import annotations

from copy import deepcopy
from dataclasses import asdict

from forkfit.langgraph_workflow import ForkFitLangGraphWorkflow
from forkfit.meal_planner import MealPlanResult, MealPlanWorkflow
from forkfit.models import MealPack
from forkfit.serialization import meal_from_dict, user_profile_from_dict
from forkfit.stores.meal_plans import MealPlanRecord


class MealPlanConversationWorkflowV3:
    """Edits v3 multi-dish plans without leaving the original recipe pool."""

    def __init__(self, llm=None) -> None:
        from forkfit.meal_plan_conversation import _LegacyMealPlanConversationWorkflow

        self.llm = llm
        self.legacy = _LegacyMealPlanConversationWorkflow(llm=llm)

    @classmethod
    def parse_intent(cls, text: str, plan: MealPlanRecord):
        from forkfit.meal_plan_conversation import _LegacyMealPlanConversationWorkflow

        return _LegacyMealPlanConversationWorkflow.parse_intent(text, plan)

    def process(self, plan: MealPlanRecord, text: str, *, confirmed: bool = False):
        from forkfit.meal_plan_conversation import ConversationResult

        if plan.result is None:
            raise ValueError("这份菜单还没有生成完成。")
        intent = self.parse_intent(text, plan)
        if intent.kind in {"clarification", "explain", "lock_day", "undo"}:
            return self.legacy.process(plan, text, confirmed=confirmed)
        if not plan.workflow_version.startswith("meal-plan-v3"):
            raise ValueError("旧版菜单可以查看和撤销；如需重新规划，请重新选择菜谱创建新版菜单。")
        if intent.requires_confirmation and not confirmed:
            return self.legacy.process(plan, text, confirmed=confirmed)
        if intent.kind in {"rebalance_plan", "change_constraint", "regenerate_remaining"}:
            result = self._replan(plan, text)
            return ConversationResult(
                status="applied",
                intent=intent,
                message="已在原候选菜谱内重新安排菜单，锁定日期保持不变。",
                summary="已重新组合原候选菜谱。",
                result=result,
            )

        day = next(
            (item for item in plan.result.days if item.day_index == (intent.day_index or 1)),
            None,
        )
        if day is None:
            raise ValueError("找不到要修改的日期。")
        target = self._target_dish(day.dishes, text)
        if target is None:
            names = "、".join(dish.meal.name for dish in day.dishes)
            return ConversationResult(
                status="needs_clarification",
                intent=intent,
                message=f"第 {day.day_index} 天有 {names}，请说明要修改哪一道菜。",
                summary="需要确认具体菜品。",
            )

        data = plan.result.model_dump(mode="json")
        day_data = next(item for item in data["days"] if item["day_index"] == day.day_index)
        position = next(
            index
            for index, dish in enumerate(day_data["dishes"])
            if dish["source_post_id"] == target.source_post_id
        )
        if intent.kind == "replace_recipe":
            replacement = self._replacement_from_pool(plan, text)
            if replacement is None:
                return ConversationResult(
                    status="needs_clarification",
                    intent=intent,
                    message="请说出要换成的候选菜名；换菜只能使用创建计划时选入的菜谱。",
                    summary="需要确认替换菜谱。",
                )
            used = {
                dish.source_post_id
                for current_day in plan.result.days
                for dish in current_day.dishes
                if dish.source_post_id != target.source_post_id
            }
            if replacement["post_id"] in used:
                raise ValueError("这道候选菜已经安排在其他日期，不能重复使用。")
            adapted = self._adapt_recipe(plan, replacement, text)
            day_data["dishes"][position] = {
                "source_post_id": replacement["post_id"],
                "meal": asdict(adapted),
                "reason": "按本轮要求从原候选池替换。",
            }
        else:
            selected = next(
                item
                for item in plan.request_payload["selected_recipes"]
                if item["post_id"] == target.source_post_id
            )
            adapted = self._adapt_meal(plan, target.meal, text)
            day_data["dishes"][position]["meal"] = asdict(adapted)
            day_data["dishes"][position]["source_post_id"] = selected["post_id"]

        result = MealPlanResult.model_validate(data)
        result.shopping_list = MealPlanWorkflow._shopping_list(result.days)
        self._validate_sources(plan, result)
        return ConversationResult(
            status="applied",
            intent=intent,
            message="已按要求调整这道菜，并保留其他日期和菜谱。",
            summary=f"已调整第 {day.day_index} 天的{target.meal.name}。",
            result=result,
        )

    def _replan(self, plan: MealPlanRecord, text: str) -> MealPlanResult:
        payload = deepcopy(plan.request_payload)
        payload["request_text"] = (
            f"{payload.get('request_text', '')}\n本轮追加要求：{text}"
        ).strip()
        result = MealPlanWorkflow(llm=self.llm).run(payload)
        if plan.locked_days and plan.result is not None:
            data = result.model_dump(mode="json")
            locked = {
                day.day_index: day.model_dump(mode="json")
                for day in plan.result.days
                if day.day_index in plan.locked_days
            }
            for day_index, day in locked.items():
                data["days"][day_index - 1] = day
            result = MealPlanResult.model_validate(data)
            result.shopping_list = MealPlanWorkflow._shopping_list(result.days)
            self._validate_sources(plan, result)
        return result

    @staticmethod
    def _target_dish(dishes, text: str):
        if len(dishes) == 1:
            return dishes[0]
        matches = [dish for dish in dishes if dish.meal.name in text]
        return matches[0] if len(matches) == 1 else None

    @staticmethod
    def _replacement_from_pool(plan: MealPlanRecord, text: str):
        for item in plan.request_payload.get("selected_recipes", []):
            names = [str(item.get("title", "")), str(item["recipe"].get("name", ""))]
            if any(name and name in text for name in names):
                return item
        return None

    def _adapt_recipe(self, plan: MealPlanRecord, item: dict, text: str):
        return self._adapt_meal(plan, meal_from_dict(item["recipe"]), text)

    def _adapt_meal(self, plan: MealPlanRecord, meal, text: str):
        profile = user_profile_from_dict(plan.request_payload["user_profile"])
        workflow = ForkFitLangGraphWorkflow(llm_client=self.llm) if self.llm else ForkFitLangGraphWorkflow()
        result = workflow.run(
            profile,
            MealPack(id="conversation-dish", title=meal.name, theme="edit", meals=[meal]),
            locale=str(plan.request_payload.get("locale", "zh")),
            request_text=text,
        )
        if not result.success:
            message = result.adapter_output.unresolved_items[0].message if result.adapter_output.unresolved_items else "这道菜无法按当前要求安全调整。"
            raise ValueError(message)
        return result.adapter_output.forked_meal_pack.meals[0]

    @staticmethod
    def _validate_sources(plan: MealPlanRecord, result: MealPlanResult) -> None:
        allowed = {
            str(item["post_id"])
            for item in plan.request_payload.get("selected_recipes", [])
        }
        used: list[str] = []
        for day in result.days:
            if not 1 <= len(day.dishes) <= 3:
                raise ValueError("每天必须保留 1 至 3 道菜。")
            for dish in day.dishes:
                if dish.source_post_id not in allowed:
                    raise ValueError("修改结果包含候选池之外的菜谱。")
                used.append(dish.source_post_id)
        if len(used) != len(set(used)):
            raise ValueError("同一道候选菜不能跨天重复。")
