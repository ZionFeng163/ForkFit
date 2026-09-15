import unittest

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from forkfit.db.models import MealPlanRow, MealPlanVersionRow, MealPlanMessageRow
from forkfit.stores.meal_plans import PostgresMealPlanStore, _snapshot
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
