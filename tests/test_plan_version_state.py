import unittest
from datetime import timedelta

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from forkfit.db.models import MealPlanRow, MealPlanVersionRow, MealPlanMessageRow
from forkfit.stores.meal_plans import PostgresMealPlanStore, _snapshot
from forkfit.stores.base import utc_now
from test_meal_plan_conversation import _plan


class PlanVersionStateTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://")
        for model in (MealPlanRow, MealPlanVersionRow, MealPlanMessageRow):
            model.__table__.create(self.engine)
        self.sessions = sessionmaker(self.engine)
        self.store = PostgresMealPlanStore(self.sessions)
        self.result = _plan().result
        with self.sessions() as session:
            session.add(MealPlanRow(id="p", user_id="u", status="succeeded",
                                    request_payload={"request_text": "最初要求"}, locked_days=[]))
            session.commit()
        self.original = self.store.mark_succeeded("p", self.result)

    def tearDown(self):
        self.engine.dispose()

    def pending(self):
        message = self.store.create_message(plan_id="p", user_id="u", content="所有菜少盐", base_version_id=self.original.current_version_id, locale="zh")
        self.store.mark_message_needs_confirmation(message.id, intent="rebalance_plan", response={"message": "确认？"}, patch=None)
        return message

    def test_confirmation_is_persisted_and_claimed_once(self):
        message = self.pending()
        with self.assertRaises(KeyError):
            self.store.requeue_message(message.id, "other")
        self.assertTrue(self.store.requeue_message(message.id, "u").confirmed)
        with self.assertRaises(ValueError):
            self.store.requeue_message(message.id, "u")
        claimed = self.store.claim_next_message()
        self.assertTrue(claimed.confirmed)
        self.assertIsNone(self.store.claim_next_message())

    def test_cancel_keeps_version_and_unblocks_next_message(self):
        message = self.pending()
        with self.assertRaises(KeyError):
            self.store.cancel_message(message.id, "other")
        cancelled = self.store.cancel_message(message.id, "u")
        self.assertEqual(cancelled.status, "rejected")
        self.assertIsNone(self.store.get_plan("p").pending_message_id)
        self.assertEqual(self.store.get_plan("p").current_version_id, self.original.current_version_id)
        self.assertIsNone(self.store.claim_next_message())
        next_message = self.store.create_message(plan_id="p", user_id="u", content="第二天去掉香菜", base_version_id=self.original.current_version_id, locale="zh")
        with self.assertRaises(ValueError):
            self.store.cancel_message(next_message.id, "u")

    def test_confirm_stale_version_is_rejected(self):
        message = self.pending()
        with self.sessions() as session:
            session.get(MealPlanRow, "p").current_version_id = "new-version"
            session.commit()
        with self.assertRaises(ValueError):
            self.store.requeue_message(message.id, "u")

    def test_retry_failed_answer_keeps_scope_without_changing_menu(self):
        first = self.store.create_message(plan_id="p", user_id="u", content="第二天不要烤箱", base_version_id=self.original.current_version_id, locale="zh")
        self.store.mark_message_needs_clarification(first.id, intent="modify_day", response={"message": "用什么厨具？"})
        answer = self.store.create_message(plan_id="p", user_id="u", content="用炒锅", base_version_id=self.original.current_version_id, locale="zh")
        self.store.mark_message_failed(answer.id, "格式错误，请重试")
        # SQLite's server timestamp has second precision, unlike PostgreSQL.
        with self.sessions() as session:
            session.get(MealPlanMessageRow, first.id).created_at = utc_now() - timedelta(seconds=2)
            session.get(MealPlanMessageRow, answer.id).created_at = utc_now() - timedelta(seconds=1)
            session.commit()
        retry = self.store.create_message(plan_id="p", user_id="u", content="用炒锅", base_version_id=self.original.current_version_id, locale="zh")
        self.assertEqual(retry.patch_payload, answer.patch_payload)
        self.assertEqual(retry.patch_payload["clarification_context"], "第二天不要烤箱")
        unchanged = self.store.get_plan("p")
        self.assertEqual(unchanged.current_version_id, self.original.current_version_id)
        self.assertEqual(unchanged.result, self.original.result)
        self.store.mark_message_failed(retry.id, "重试失败")
        different = self.store.create_message(plan_id="p", user_id="u", content="第一天不要葱", base_version_id=self.original.current_version_id, locale="zh")
        self.assertIsNone(different.patch_payload)

    def test_retry_does_not_reuse_context_from_an_old_version(self):
        message = self.store.create_message(plan_id="p", user_id="u", content="用炒锅", base_version_id=self.original.current_version_id, locale="zh")
        with self.sessions() as session:
            session.get(MealPlanMessageRow, message.id).patch_payload = {"clarification_context": "第二天不要烤箱"}
            session.get(MealPlanRow, "p").current_version_id = "new-version"
            session.commit()
        self.store.mark_message_failed(message.id, "失败")
        retry = self.store.create_message(plan_id="p", user_id="u", content="用炒锅", base_version_id="new-version", locale="zh")
        self.assertIsNone(retry.patch_payload)

    def test_cancel_route_serializes_rejected_status(self):
        import asyncio
        from types import SimpleNamespace
        from forkfit.api.routes_meal_plans import cancel_conversation_message
        from forkfit.services.meal_plan_service import MealPlanService

        message = self.pending()
        service = SimpleNamespace(store=self.store)
        service.cancel_message = lambda **kwargs: MealPlanService.cancel_message(service, **kwargs)
        response = asyncio.run(cancel_conversation_message("p", message.id, SimpleNamespace(id="u"), service))
        self.assertEqual(response.model_dump()["status"], "rejected")

    def edit(self, text, *, intent="change_constraint", patch=None, requirements=None):
        plan = self.store.get_plan("p")
        with self.sessions() as session:
            session.add(MealPlanMessageRow(id=text, plan_id="p", user_id="u", role="user", content=text,
                                           status="processing", base_version_id=plan.current_version_id))
            session.commit()
        self.store.complete_message(text, result=self.result, intent=intent, response={"summary": text},
                                    patch=patch, request_text=text, created_by="u", locked_days=[1], effective_requirements=requirements)
        return self.store.get_plan("p")

    def test_initial_and_updated_snapshots_restore_together(self):
        edited = self.edit("增加限制")
        self.assertEqual(edited.locked_days, [1])
        self.assertIn("增加限制", edited.request_payload["conversation_context"])
        restored = self.store.restore_version("p", "u", self.original.current_version_id)
        self.assertEqual(restored.request_payload, self.original.request_payload)
        self.assertEqual(restored.locked_days, [])

    def test_initial_clarification_survives_refresh_and_creates_one_version(self):
        plan = self.store.create_plan(user_id="u", request_payload={"request_text": "不要花生"}, mode="team", workflow_version="meal-plan-v4.1")
        self.store.mark_needs_input(plan.id, "可以接受豆腐吗？", [])
        self.assertEqual(self.store.list_messages(plan.id, "u")[0].content, "可以接受豆腐吗？")
        with self.assertRaises(KeyError):
            self.store.create_message(plan_id=plan.id, user_id="other", content="可以", base_version_id=None, locale="zh")
        first = self.store.create_message(plan_id=plan.id, user_id="u", content="可以", base_version_id=None, locale="zh")
        with self.assertRaises(ValueError):
            self.store.create_message(plan_id=plan.id, user_id="u", content="重复点击", base_version_id=None, locale="zh")
        self.store.claim_next_message()
        self.store.mark_message_needs_clarification(first.id, intent="initial_planning", response={"message": "你有哪些厨具？"})
        self.assertIsNone(self.store.get_plan(plan.id).current_version_id)
        second = self.store.create_message(plan_id=plan.id, user_id="u", content="炒锅", base_version_id=None, locale="zh")
        context = self.store.get_plan(plan.id).request_payload["request_text"]
        self.assertIn("不要花生", context)
        self.assertIn("用户补充回答：可以", context)
        self.assertIn("用户补充回答：炒锅", context)
        self.store.claim_next_message()
        self.store.mark_succeeded(plan.id, self.result, message_id=second.id)
        completed = self.store.get_plan(plan.id)
        self.assertIsNotNone(completed.current_version_id)
        self.assertIsNone(completed.pending_message_id)
        self.assertEqual(self.store.get_message(second.id).status, "applied")
        with self.assertRaises(ValueError):
            self.store.mark_succeeded(plan.id, self.result, message_id=second.id)
        self.assertEqual(self.store.get_plan(plan.id).current_version_id, completed.current_version_id)
        self.store.mark_message_failed(second.id, "迟到的失败响应")
        self.assertEqual(self.store.get_message(second.id).status, "applied")

    def test_initial_message_worker_routes_clarification_then_success(self):
        from unittest.mock import patch
        from forkfit.meal_planner_v3 import MealPlanNeedsInput
        from forkfit.workers.meal_plan_runner import run_meal_plan_message_job
        plan = self.store.create_plan(user_id="u", request_payload={"request_text": "少盐"}, mode="team", workflow_version="meal-plan-v4.1")
        self.store.mark_needs_input(plan.id, "有哪些厨具？", [])
        with patch("forkfit.workers.meal_plan_runner.make_session_factory", return_value=self.sessions), patch("forkfit.workers.meal_plan_runner._get_workflow") as workflow:
            first = self.store.create_message(plan_id=plan.id, user_id="u", content="炒锅", base_version_id=None, locale="zh")
            self.store.claim_next_message()
            workflow.return_value.run.side_effect = MealPlanNeedsInput("能接受清炒吗？")
            run_meal_plan_message_job(first.id, plan.id, first.content)
            self.assertEqual(self.store.get_message(first.id).status, "needs_clarification")
            self.assertIsNone(self.store.get_plan(plan.id).result)
            second = self.store.create_message(plan_id=plan.id, user_id="u", content="可以", base_version_id=None, locale="zh")
            self.store.claim_next_message()
            workflow.return_value.run.side_effect = None
            workflow.return_value.run.return_value = self.result
            run_meal_plan_message_job(second.id, plan.id, second.content)
            self.assertEqual(self.store.get_plan(plan.id).status, "succeeded")
            self.assertIn("少盐", workflow.return_value.run.call_args.args[0]["request_text"])

    def test_clarification_is_a_chat_reply_and_keeps_context_without_new_version(self):
        first = self.store.create_message(plan_id="p", user_id="u", content="第二天不要烤箱", base_version_id=self.original.current_version_id, locale="zh")
        self.store.mark_message_needs_clarification(first.id, intent="modify_day", response={"message": "你可以使用哪些厨具？"})
        messages = self.store.list_messages("p", "u")
        self.assertEqual(messages[-1].role, "assistant")
        self.assertEqual(messages[-1].content, "你可以使用哪些厨具？")
        self.assertEqual(self.store.get_plan("p").pending_message_id, first.id)
        second = self.store.create_message(plan_id="p", user_id="u", content="只有炒锅", base_version_id=self.original.current_version_id, locale="zh")
        self.assertEqual(second.patch_payload["clarification_context"], "第二天不要烤箱")
        self.store.mark_message_needs_clarification(second.id, intent="modify_day", response={"message": "需要换做法，能接受清炒吗？"})
        self.assertEqual(self.store.get_message(second.id).patch_payload, second.patch_payload)
        self.assertEqual(self.store.get_plan("p").current_version_id, self.original.current_version_id)

    def test_requirement_only_version_is_persisted_and_undoable(self):
        old_state = {"global": "少盐", "days": {"2": "不要鱼"}}
        before = self.edit("禁鱼", requirements=old_state)
        changed = self.edit("取消禁鱼", requirements={"global": "少盐", "days": {"2": ""}})
        self.assertEqual(changed.result, before.result)
        self.assertNotEqual(changed.current_version_id, before.current_version_id)
        self.assertEqual(changed.request_payload["effective_requirements"]["days"]["2"], "")
        restored = self.edit("撤销取消", intent="undo", patch={"restore_version_id": before.current_version_id})
        self.assertEqual(restored.request_payload["effective_requirements"], old_state)

    def test_conversation_undo_restores_state_not_undo_text(self):
        self.edit("增加限制")
        restored = self.edit("撤销", intent="undo", patch={"restore_version_id": self.original.current_version_id})
        self.assertEqual(restored.request_payload, self.original.request_payload)
        self.assertEqual(restored.locked_days, [])
        self.assertNotEqual(restored.current_version_id, self.original.current_version_id)

    def test_legacy_snapshot_failure_does_not_change_current_plan(self):
        edited = self.edit("增加限制")
        with self.sessions() as session:
            session.get(MealPlanVersionRow, self.original.current_version_id).state_snapshot = None
            session.commit()
        with self.assertRaisesRegex(ValueError, "旧版本"):
            self.store.restore_version("p", "u", self.original.current_version_id)
        self.assertEqual(self.store.get_plan("p").current_version_id, edited.current_version_id)

    def test_snapshot_does_not_alias_live_request(self):
        payload = {"user_profile": {"allergies": ["花生"]}}
        snapshot = _snapshot(payload, [1])
        payload["user_profile"]["allergies"].clear()
        self.assertEqual(snapshot["request_payload"]["user_profile"]["allergies"], ["花生"])

    def test_restore_while_message_is_processing_is_rejected(self):
        with self.sessions() as session:
            session.add(MealPlanMessageRow(id="pending", plan_id="p", user_id="u", role="user",
                                           content="修改", status="processing", base_version_id=self.original.current_version_id))
            session.commit()
        with self.assertRaisesRegex(ValueError, "正在修改"):
            self.store.restore_version("p", "u", self.original.current_version_id)

    def test_restore_conflict_is_not_an_internal_server_error(self):
        from types import SimpleNamespace
        from unittest.mock import Mock
        from fastapi import HTTPException
        from forkfit.services.meal_plan_service import MealPlanService
        service = SimpleNamespace(store=Mock())
        service.store.restore_version.side_effect = ValueError("无法恢复旧版本")
        with self.assertRaises(HTTPException) as error:
            MealPlanService.restore_version(service, user_id="u", plan_id="p", version_id="v")
        self.assertEqual(error.exception.status_code, 409)


if __name__ == "__main__":
    unittest.main()
