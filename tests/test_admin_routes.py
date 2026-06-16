import unittest
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from fastapi import HTTPException
from pydantic import ValidationError

from forkfit.api.routes_admin import (
    UpdateUserRequest,
    UpdatePostStatusRequest,
    admin_activity,
    admin_delete_post,
    admin_delete_user,
    admin_list_posts,
    admin_list_users,
    admin_update_post_status,
    admin_update_user,
)
from forkfit.auth.models import CurrentUser
from forkfit.stores.user import UserStore


ADMIN = CurrentUser(
    id="admin-1",
    username="admin",
    display_name="Admin",
    role="admin",
)


class AdminRouteTests(unittest.TestCase):
    def test_user_list_forwards_database_search(self):
        store = MagicMock()
        store.list_users.return_value = ([], 0)

        with patch("forkfit.api.routes_admin.get_user_store", return_value=store):
            response = admin_list_users(
                limit=10,
                offset=20,
                q="min",
                _admin=ADMIN,
            )

        self.assertEqual(response, {"users": [], "total": 0})
        store.list_users.assert_called_once_with(
            limit=10,
            offset=20,
            search="min",
        )

    def test_admin_cannot_remove_own_role(self):
        with self.assertRaises(HTTPException) as error:
            admin_update_user(
                "admin-1",
                UpdateUserRequest(role="user"),
                _admin=ADMIN,
            )

        self.assertEqual(error.exception.status_code, 400)

    def test_admin_cannot_delete_self(self):
        with self.assertRaises(HTTPException) as error:
            admin_delete_user("admin-1", _admin=ADMIN)

        self.assertEqual(error.exception.status_code, 400)

    def test_role_validation_rejects_unknown_values(self):
        with self.assertRaises(ValidationError):
            UpdateUserRequest(role="owner")

    def test_missing_post_returns_404(self):
        store = MagicMock()
        store.delete_post.side_effect = KeyError("missing")

        with (
            patch("forkfit.api.routes_admin.get_post_store", return_value=store),
            self.assertRaises(HTTPException) as error,
        ):
            admin_delete_post("missing", _admin=ADMIN)

        self.assertEqual(error.exception.status_code, 404)

    def test_post_list_forwards_content_filters(self):
        store = MagicMock()
        store.list_admin_posts.return_value = ([], 0)

        with patch("forkfit.api.routes_admin.get_post_store", return_value=store):
            response = admin_list_posts(
                limit=10,
                offset=0,
                q="番茄",
                status="hidden",
                tag="家常",
                quality="missing_image",
                _admin=ADMIN,
            )

        self.assertEqual(response, {"posts": [], "total": 0})
        store.list_admin_posts.assert_called_once_with(
            limit=10,
            offset=0,
            search="番茄",
            tag="家常",
            status="hidden",
            quality="missing_image",
        )

    def test_post_status_update_returns_quality_fields(self):
        now = datetime.now(timezone.utc)
        post = SimpleNamespace(
            id="post-1",
            title="测试菜谱",
            author="Chef",
            user_id="user-1",
            status="hidden",
            source_name="ForkFit",
            source_url="internal://post-1",
            quality="complete",
            has_image=True,
            has_steps=True,
            created_at=now,
        )
        store = MagicMock()
        store.update_post_status.return_value = post

        with (
            patch("forkfit.api.routes_admin.get_post_store", return_value=store),
            patch("forkfit.api.routes_admin._audit"),
        ):
            response = admin_update_post_status(
                "post-1",
                UpdatePostStatusRequest(status="hidden"),
                _admin=ADMIN,
            )

        self.assertEqual(response.status, "hidden")
        self.assertEqual(response.quality, "complete")
        store.update_post_status.assert_called_once_with("post-1", "hidden")

    def test_activity_is_sorted_across_posts_and_runs(self):
        now = datetime.now(timezone.utc)
        post_store = MagicMock()
        post_store.list_posts.return_value = (
            [
                SimpleNamespace(
                    author="Chef",
                    title="Older post",
                    created_at=now - timedelta(hours=2),
                )
            ],
            1,
        )
        run_store = MagicMock()
        run_store.list_all_runs.return_value = [
            SimpleNamespace(
                id="run_newest_123456789",
                status="succeeded",
                created_at=now - timedelta(minutes=5),
            )
        ]

        with (
            patch("forkfit.api.routes_admin.get_post_store", return_value=post_store),
            patch("forkfit.api.routes_admin.get_run_store", return_value=run_store),
        ):
            response = admin_activity(_admin=ADMIN)

        self.assertEqual(response.activities[0].type, "run")
        self.assertEqual(response.activities[1].type, "post")


class UserStoreTests(unittest.TestCase):
    def test_list_users_populates_profile_fields(self):
        row = SimpleNamespace(
            id="user-1",
            username="tester",
            display_name="Tester",
            avatar_url=None,
            bio="Hello",
            location="Shanghai",
            role="user",
            created_at=datetime.now(timezone.utc),
        )
        session = MagicMock()
        session.scalar.return_value = 1
        session.execute.return_value.scalars.return_value.all.return_value = [row]
        session_factory = MagicMock()
        session_factory.return_value.__enter__.return_value = session

        users, total = UserStore(session_factory).list_users(search="test")

        self.assertEqual(total, 1)
        self.assertEqual(users[0].bio, "Hello")
        self.assertEqual(users[0].location, "Shanghai")


if __name__ == "__main__":
    unittest.main()
