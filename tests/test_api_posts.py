import unittest

from dataclasses import asdict

from fastapi.testclient import TestClient

from forkfit.api.app import create_app
from forkfit.config import get_settings
from forkfit.db.models import PostRow
from forkfit.db.session import make_session_factory
from forkfit.fixtures import demo_meal_pack


class PostApiTests(unittest.TestCase):
    def tearDown(self) -> None:
        session_factory = make_session_factory(get_settings().database_url)
        with session_factory() as session:
            (
                session.query(PostRow)
                .filter(PostRow.id.like("test-tomato-rice-%"))
                .delete(synchronize_session=False)
            )
            session.commit()

    def test_list_posts_includes_presets(self):
        client = TestClient(create_app())

        response = client.get("/posts")

        self.assertEqual(response.status_code, 200)
        post_ids = {post["id"] for post in response.json()}
        self.assertIn("budget-family-hotpot", post_ids)
        self.assertIn("berry-yogurt-jar", post_ids)

    def test_create_list_and_get_post(self):
        client = TestClient(create_app())
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
        self.assertEqual(len(post["image_urls"]), 1)

        list_response = client.get("/posts")
        self.assertEqual(list_response.status_code, 200)
        self.assertTrue(
            any(item["id"] == post["id"] for item in list_response.json())
        )

        get_response = client.get(f"/posts/{post['id']}")
        self.assertEqual(get_response.status_code, 200)
        self.assertEqual(get_response.json()["title"], "Test Tomato Rice")


if __name__ == "__main__":
    unittest.main()
