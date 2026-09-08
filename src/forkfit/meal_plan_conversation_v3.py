from __future__ import annotations

from copy import deepcopy
from dataclasses import asdict, replace

from forkfit.langgraph_workflow_v3 import ForkFitLangGraphWorkflow
from forkfit.meal_planner import MealPlanResult, MealPlanWorkflow
from forkfit.models import MealPack
from forkfit.serialization import meal_from_dict, user_profile_from_dict
from forkfit.stores.meal_plans import MealPlanRecord
from forkfit.plan_requirements import scoped_request, prepare_requirement_update


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
        intent = self.parse_intent(text, plan)
        if intent.kind in {"clarification", "explain", "lock_day", "unlock_day", "undo"} or (intent.requires_confirmation and not confirmed):
            return self._process(plan, text, confirmed=confirmed)
        if plan.result is None or not plan.workflow_version.startswith(("meal-plan-v3", "meal-plan-v4")):
            return self._process(plan, text, confirmed=confirmed)
        if intent.day_index is not None:
            day = next((day for day in plan.result.days if day.day_index == intent.day_index), None)
            if day is None or self._target_dish(day.dishes, text) is None:
                return self._process(plan, text, confirmed=confirmed)
        state, relax_only = prepare_requirement_update(self.llm or self.legacy.llm, plan.request_payload, text, intent.day_index)
        prepared = replace(plan, request_payload={**plan.request_payload, "effective_requirements": state})
        previous = plan.request_payload.get("effective_requirements") or {"global": str(plan.request_payload.get("request_text", "")), "days": {}}
        outcome = self._process(prepared, text, confirmed=confirmed, requirements_changed=relax_only and state != previous)
        return replace(outcome, effective_requirements=state) if outcome.status == "applied" else outcome

    def _process(self, plan: MealPlanRecord, text: str, *, confirmed: bool = False, requirements_changed: bool = False):
        from forkfit.meal_plan_conversation import ConversationResult

        if plan.result is None:
            raise ValueError("这份菜单还没有生成完成。")
        intent = self.parse_intent(text, plan)
        if intent.kind in {"clarification", "explain", "lock_day", "unlock_day", "undo"}:
            return self.legacy.process(plan, text, confirmed=confirmed)
        if not plan.workflow_version.startswith(("meal-plan-v3", "meal-plan-v4")):
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
            adapted = self._adapt_recipe(plan, replacement, text, day.day_index)
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
            adapted = self._adapt_meal(plan, target.meal, text, day.day_index, require_change=not requirements_changed)
            day_data["dishes"][position]["meal"] = asdict(adapted)
            day_data["dishes"][position]["source_post_id"] = selected["post_id"]

        updated = day_data["dishes"][position]
        if updated["source_post_id"] == target.source_post_id and updated["meal"] == asdict(target.meal):
            if requirements_changed:
                return ConversationResult(
                    status="applied", intent=intent, result=plan.result,
                    message="已更新你的要求，当前菜谱未作修改；后续调整会使用新的要求。",
                    summary="已更新要求，菜谱保持不变。",
                )
            return ConversationResult(
                status="needs_clarification", intent=intent,
                message="这次没有产生实际修改，原菜单保持不变。你希望具体改变食材、用量还是做法？",
                summary="未产生修改，需要确认调整目标。",
            )
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
        if plan.result is not None:
            for day in plan.result.days:
                if day.day_index not in plan.locked_days:
                    continue
                for dish in day.dishes:
                    try:
                        self._validate_locked_meal(plan, dish.meal, day.day_index)
                    except ValueError as exc:
                        raise ValueError(f"第 {day.day_index} 天已锁定，无法确认它满足新要求。请先解锁该日期或缩小修改范围。") from exc
        payload = deepcopy(plan.request_payload)
        payload["request_text"] = scoped_request(payload)
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
        state = plan.request_payload.get("effective_requirements", {})
        data = result.model_dump(mode="json")
        for day in data["days"]:
            if day["day_index"] in plan.locked_days or not state.get("days", {}).get(str(day["day_index"])):
                continue
            for dish in day["dishes"]:
                dish["meal"] = asdict(self._adapt_meal(plan, meal_from_dict(dish["meal"]), "", day["day_index"], require_change=False))
        result = MealPlanResult.model_validate(data)
        result.shopping_list = MealPlanWorkflow._shopping_list(result.days)
        return result

    @staticmethod
    def _target_dish(dishes, text: str):
        if len(dishes) == 1:
            return dishes[0]
        matches = [dish for dish in dishes if dish.meal.name in text]
        return matches[0] if len(matches) == 1 else None

    def _validate_locked_meal(self, plan, meal, day_index):
        workflow = ForkFitLangGraphWorkflow(llm_client=self.llm) if self.llm else ForkFitLangGraphWorkflow()
        profile = user_profile_from_dict(plan.request_payload["user_profile"])
        pack = MealPack("locked-dish", meal.name, "review", [meal.clone()])
        request = scoped_request(plan.request_payload, day_index)
        locale = str(plan.request_payload.get("locale", "zh"))
        spec, _ = workflow.reviewer.understand_and_review(profile, request, pack, locale=locale)
        if spec.clarification:
            raise ValueError(spec.clarification.question)
        report = workflow.reviewer.review_adjusted(pack, pack, spec, locale=locale, request_text=request)
        safety = workflow.safety_guard.review(pack, spec, locale)
        if report.status == "block" or any(f.severity == "high" for f in safety.findings):
            raise ValueError("锁定菜谱与新要求存在冲突。")

    @staticmethod
    def _replacement_from_pool(plan: MealPlanRecord, text: str):
        for item in plan.request_payload.get("selected_recipes", []):
            names = [str(item.get("title", "")), str(item["recipe"].get("name", ""))]
            if any(name and name in text for name in names):
                return item
        return None

    def _adapt_recipe(self, plan: MealPlanRecord, item: dict, text: str, day_index: int):
        return self._adapt_meal(plan, meal_from_dict(item["recipe"]), text, day_index)

    def _adapt_meal(self, plan: MealPlanRecord, meal, text: str, day_index: int | None = None, *, require_change: bool = True):
        profile = user_profile_from_dict(plan.request_payload["user_profile"])
        workflow = ForkFitLangGraphWorkflow(llm_client=self.llm) if self.llm else ForkFitLangGraphWorkflow()
        result = workflow.run(
            profile,
            MealPack(id="conversation-dish", title=meal.name, theme="edit", meals=[meal]),
            locale=str(plan.request_payload.get("locale", "zh")),
            request_text="\n".join(filter(None, [scoped_request(plan.request_payload, day_index), text])),
            require_change=require_change,
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
