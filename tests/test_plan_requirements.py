import unittest
from unittest.mock import Mock

from forkfit.plan_requirements import scoped_request, update_requirements


class PlanRequirementTests(unittest.TestCase):
    def test_day_update_preserves_other_days_and_global(self):
        payload = {"effective_requirements": {"global": "不要香菜", "days": {"1": "少油", "2": "不要鱼"}}}
        llm = Mock()
        llm.complete_json.return_value = {"text": "不要鱼，少盐"}
        state = update_requirements(llm, payload, "第二天少盐", 2)
        self.assertEqual(state["global"], "不要香菜")
        self.assertEqual(state["days"]["1"], "少油")
        self.assertEqual(scoped_request({"effective_requirements": state}, 1), "不要香菜\n少油")
        self.assertNotIn("少盐", scoped_request({"effective_requirements": state}, 3))
        self.assertEqual(payload["effective_requirements"]["days"]["2"], "不要鱼")

    def test_cancelled_requirement_does_not_remain_in_active_text(self):
        payload = {"effective_requirements": {"global": "不要香菜", "days": {"2": "不要鱼，少盐"}}}
        llm = Mock()
        llm.complete_json.return_value = {"text": "少盐"}
        state = update_requirements(llm, payload, "第二天可以吃鱼了，保留少盐", 2)
        self.assertEqual(scoped_request({"effective_requirements": state}, 2), "不要香菜\n少盐")

    def test_uncertainty_does_not_mutate_state(self):
        payload = {"request_text": "不要香菜"}
        llm = Mock()
        llm.complete_json.return_value = {"text": "", "clarification": "是取消全局要求吗？"}
        with self.assertRaises(ValueError):
            update_requirements(llm, payload, "这次随便", 2)
        self.assertEqual(payload, {"request_text": "不要香菜"})
