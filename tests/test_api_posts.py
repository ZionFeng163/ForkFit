import unittest

from dataclasses import asdict

from fastapi.testclient import TestClient

from forkfit.api.app import create_app
from forkfit.api.deps import current_user, get_post_extraction_llm, optional_current_user
from forkfit.auth.models import CurrentUser
from forkfit.config import get_settings
from forkfit.db.models import PostRow
from forkfit.db.session import make_session_factory
from forkfit.fixtures import demo_meal_pack


class FakePostExtractionLLM:
    model = "deepseek-v4-flash"

    def __init__(self, *, should_fail: bool = False) -> None:
        self.should_fail = should_fail

    def complete_json(self, **kwargs):
        if self.should_fail:
            raise RuntimeError("LLM unavailable")
        return {
            "theme": "甜口早餐",
            "location": "上海",
            "recipe_name": "酸甜番茄饭",
            "ingredients": ["番茄", "米饭", "蜂蜜"],
            "equipment": ["炉灶"],
            "cook_time_minutes": 18,
            "estimated_cost": 8,
            "tags": ["酸甜", "快手"],
            "notes": "适合喜欢甜口的人。",
        }


class PostApiTests(unittest.TestCase):
    def tearDown(self) -> None:
        get_post_extraction_llm.cache_clear()
        session_factory = make_session_factory(get_settings().database_url)
        with session_factory() as session:
            (
                session.query(PostRow)
                .filter(PostRow.id.like("test-tomato-rice-%"))
                .delete(synchronize_session=False)
            )
            session.commit()

    def _client(self, *, llm=None) -> TestClient:
        app = create_app()
        user = CurrentUser(
            id="demo_user",
            username="demo",
            display_name="Demo User",
            avatar_url=None,
            role="user",
        )
        app.dependency_overrides[get_post_extraction_llm] = (
            lambda: llm or FakePostExtractionLLM()
        )
        app.dependency_overrides[current_user] = lambda: user
        app.dependency_overrides[optional_current_user] = lambda: user
        return TestClient(app)

    def test_list_posts_includes_presets(self):
        client = self._client()

        response = client.get("/posts?limit=100")

        self.assertEqual(response.status_code, 200)
        post_ids = {post["id"] for post in response.json()}
        self.assertIn("budget-family-hotpot", post_ids)
        self.assertIn("berry-yogurt-jar", post_ids)

    def test_create_list_and_get_post(self):
        client = self._client()
        recipe = asdict(demo_meal_pack().meals[0])
        recipe["id"] = "main"

        response = client.post(
            "/posts",
            json={
                "title": "Test Tomato Rice",
                "theme": "quick dinner",
                "location": "Shanghai",
                "image_urls": [
                    "https://images.unsplash.com/photo-1546069901-ba9599a7e63c"
                ],
                "description": "A simple test recipe post.",
                "recipe": recipe,
            },
        )

        self.assertEqual(response.status_code, 200)
        post = response.json()
        self.assertTrue(post["id"].startswith("test-tomato-rice-"))
        self.assertEqual(post["author"], "Demo User")
        self.assertEqual(post["recipe"]["id"], "main")
        self.assertEqual(post["theme"], "甜口早餐")
        self.assertEqual(post["location"], "上海")
        self.assertEqual(post["recipe"]["name"], recipe["name"])
        self.assertEqual(post["recipe"]["ingredients"], ["番茄", "米饭", "蜂蜜"])
        self.assertEqual(len(post["image_urls"]), 1)

        list_response = client.get("/posts")
        self.assertEqual(list_response.status_code, 200)
        self.assertTrue(
            any(item["id"] == post["id"] for item in list_response.json())
        )

        get_response = client.get(f"/posts/{post['id']}")
        self.assertEqual(get_response.status_code, 200)
        self.assertEqual(get_response.json()["title"], "Test Tomato Rice")

    def test_create_post_falls_back_when_extraction_fails(self):
        client = self._client(llm=FakePostExtractionLLM(should_fail=True))
        recipe = asdict(demo_meal_pack().meals[0])
        recipe["id"] = "main"

        response = client.post(
            "/posts",
            json={
                "title": "Test Tomato Rice",
                "theme": "community recipe",
                "location": "unknown",
                "image_urls": [
                    "https://images.unsplash.com/photo-1546069901-ba9599a7e63c"
                ],
                "description": "A simple test recipe post.",
                "recipe": recipe,
            },
        )

        self.assertEqual(response.status_code, 200)
        post = response.json()
        self.assertEqual(post["theme"], "community recipe")
        self.assertEqual(post["recipe"]["name"], recipe["name"])

    def test_update_post_and_extract_existing_post(self):
        client = self._client(llm=FakePostExtractionLLM(should_fail=True))
        recipe = asdict(demo_meal_pack().meals[0])
        recipe["id"] = "main"
        create_response = client.post(
            "/posts",
            json={
                "title": "Test Tomato Rice",
                "theme": "community recipe",
                "location": "unknown",
                "image_urls": [
                    "https://images.unsplash.com/photo-1546069901-ba9599a7e63c"
                ],
                "description": "A simple test recipe post.",
                "recipe": recipe,
            },
        )
        post = create_response.json()

        recipe["name"] = "Updated Tomato Rice"
        update_response = client.patch(
            f"/posts/{post['id']}",
            json={
                "title": "Test Tomato Rice Updated",
                "theme": "quick dinner",
                "location": "Shanghai",
                "image_urls": [
                    "https://images.unsplash.com/photo-1546069901-ba9599a7e63c"
                ],
                "description": "Updated post.",
                "recipe": recipe,
            },
        )

        self.assertEqual(update_response.status_code, 200)
        self.assertEqual(update_response.json()["title"], "Test Tomato Rice Updated")
        self.assertEqual(update_response.json()["recipe"]["name"], "Updated Tomato Rice")

        client = self._client()
        extract_response = client.post(f"/posts/{post['id']}/extract")
        self.assertEqual(extract_response.status_code, 200)
        self.assertEqual(extract_response.json()["recipe"]["name"], "Updated Tomato Rice")
        self.assertEqual(extract_response.json()["recipe"]["ingredients"], ["番茄", "米饭", "蜂蜜"])

    def test_cannot_update_preset_post(self):
        client = self._client()
        recipe = asdict(demo_meal_pack().meals[0])
        recipe["id"] = "main"

        response = client.patch(
            "/posts/budget-family-hotpot",
            json={
                "title": "Nope",
                "theme": "quick dinner",
                "location": "Shanghai",
                "image_urls": [
                    "https://images.unsplash.com/photo-1546069901-ba9599a7e63c"
                ],
                "description": "Should not update.",
                "recipe": recipe,
            },
        )

        self.assertEqual(response.status_code, 403)


if __name__ == "__main__":
    unittest.main()
