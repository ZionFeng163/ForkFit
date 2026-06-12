import base64
import os
import tempfile
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from forkfit.api.app import create_app
from forkfit.api.deps import current_user
from forkfit.auth.models import CurrentUser


PNG_1X1 = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk"
    "+A8AAQUBAScY42YAAAAASUVORK5CYII="
)


class UploadApiTests(unittest.TestCase):
    def _client(self) -> TestClient:
        app = create_app()
        app.dependency_overrides[current_user] = lambda: CurrentUser(
            id="demo_user",
            username="demo",
            display_name="Demo User",
            avatar_url=None,
            role="user",
        )
        return TestClient(app)

    def test_rejects_fake_image_content(self):
        with tempfile.TemporaryDirectory() as upload_dir, patch.dict(
            os.environ, {"UPLOAD_DIR": upload_dir}
        ):
            response = self._client().post(
                "/upload/image",
                files={"file": ("fake.jpg", b"fake", "image/jpeg")},
            )

            self.assertEqual(response.status_code, 400)
            self.assertEqual(os.listdir(upload_dir), [])

    def test_stores_valid_image_with_detected_extension(self):
        with tempfile.TemporaryDirectory() as upload_dir, patch.dict(
            os.environ, {"UPLOAD_DIR": upload_dir}
        ):
            response = self._client().post(
                "/upload/image",
                files={"file": ("avatar.png", PNG_1X1, "image/png")},
            )

            self.assertEqual(response.status_code, 200)
            filename = response.json()["url"].rsplit("/", 1)[-1]
            self.assertTrue(filename.endswith(".png"))
            self.assertEqual(os.listdir(upload_dir), [filename])


if __name__ == "__main__":
    unittest.main()
