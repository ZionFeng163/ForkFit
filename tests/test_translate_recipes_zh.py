from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from scripts import translate_recipes_zh


class TranslateRecipesZhTests(unittest.TestCase):
    def test_default_output_does_not_overwrite_source(self) -> None:
        with patch("sys.argv", ["translate_recipes_zh.py"]):
            args = translate_recipes_zh.parse_args()

        self.assertNotEqual(args.source, args.output)

    def test_refuses_in_place_output_without_explicit_flag(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "recipes.json"
            path.write_text(json.dumps({"recipes": []}), encoding="utf-8")

            with patch(
                "sys.argv",
                [
                    "translate_recipes_zh.py",
                    "--source",
                    str(path),
                    "--output",
                    str(path),
                ],
            ):
                self.assertEqual(translate_recipes_zh.main(), 2)


if __name__ == "__main__":
    unittest.main()
