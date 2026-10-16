import unittest
from uuid import uuid4
from unittest.mock import patch

from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import select

from forkfit.api.app import create_app
from forkfit.api.deps import current_user
from forkfit.auth.models import CurrentUser
from forkfit.config import get_settings
from forkfit.db.models import AdminAuditLogRow, FeedbackRow
from forkfit.db.session import make_session_factory


class SiteFeedbackTests(unittest.TestCase):
    def setUp(self):
        self.user = CurrentUser(id=f"feedback_test_{uuid4().hex}", display_name="Test")
        self.app = create_app()
        self.app.dependency_overrides[current_user] = lambda: self.user
        self.client = TestClient(self.app)
        self.sessions = make_session_factory(get_settings().database_url)
        self.limiter = patch("forkfit.api.routes_feedback.enforce_rate_limit")
        self.limit = self.limiter.start()
        self.addCleanup(self.limiter.stop)
        self.addCleanup(self.client.close)

    def tearDown(self):
        with self.sessions() as session:
            ids = select(FeedbackRow.id).where(FeedbackRow.user_id.like("feedback_test_%"))
            session.query(AdminAuditLogRow).filter(AdminAuditLogRow.target_id.in_(ids)).delete(synchronize_session=False)
            session.query(FeedbackRow).filter(FeedbackRow.user_id.like("feedback_test_%")).delete(synchronize_session=False)
            session.commit()

    def body(self, **overrides):
        return {"request_id": str(uuid4()), "category": "data_request", "content": "请导出我的菜单", **overrides}

    def test_private_feedback_admin_reply_and_audit(self):
        response = self.client.post("/feedback", json=self.body())
        self.assertEqual(response.status_code, 200, response.text)
        item = response.json()
        self.limit.assert_called_once()
        self.assertEqual(self.client.get("/feedback").json()["total"], 1)
        self.assertEqual(self.client.get("/admin/feedback").status_code, 403)
        self.assertEqual(self.client.patch(f"/admin/feedback/{item['id']}", json={"status": "resolved", "reply": "done"}).status_code, 403)
        owner = self.user
        self.user = CurrentUser(id="other_user", display_name="Other")
        self.assertEqual(self.client.get(f"/feedback?user_id={owner.id}").json()["total"], 0)
        self.user = CurrentUser(id="test_admin", display_name="Admin", role="admin")
        self.assertIn(item["id"], [row["id"] for row in self.client.get("/admin/feedback?status=open&limit=50").json()["items"]])
        result = self.client.patch(f"/admin/feedback/{item['id']}", json={"status": "resolved", "reply": "请在本站确认导出范围。"})
        self.assertEqual(result.status_code, 200, result.text)
        with self.sessions() as session:
            audit = session.scalar(select(AdminAuditLogRow).where(AdminAuditLogRow.target_id == item["id"]))
            self.assertEqual(audit.action, "update_feedback")
            self.assertNotIn("reply", audit.payload)
        self.user = owner
        self.assertEqual(self.client.get("/feedback").json()["items"][0]["reply"], "请在本站确认导出范围。")

    def test_submission_retry_is_idempotent(self):
        body = self.body()
        first = self.client.post("/feedback", json=body).json()
        second = self.client.post("/feedback", json=body).json()
        self.assertEqual(first["id"], second["id"])
        self.assertEqual(self.client.get("/feedback").json()["total"], 1)
        self.assertEqual(self.client.post("/feedback", json={**body, "content": "different"}).status_code, 409)

    def test_validation_authentication_csrf_and_limits(self):
        for body in (self.body(content="   "), self.body(content="x" * 2001), self.body(category="unknown"), self.body(user_id="other")):
            self.assertEqual(self.client.post("/feedback", json=body).status_code, 422)
        self.assertEqual(self.client.get("/feedback?limit=1000").status_code, 422)
        self.assertEqual(self.client.get("/feedback?offset=-1").status_code, 422)
        self.limit.side_effect = HTTPException(429, "Too many requests")
        self.assertEqual(self.client.post("/feedback", json=self.body()).status_code, 429)
        self.client.cookies.set("access_token", "test")
        self.assertEqual(self.client.post("/feedback", json=self.body()).status_code, 403)
        self.client.cookies.clear()
        self.app.dependency_overrides.clear()
        self.assertEqual(self.client.get("/feedback").status_code, 401)
        self.assertEqual(self.client.post("/feedback", json=self.body()).status_code, 401)
