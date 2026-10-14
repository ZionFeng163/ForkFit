import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import Mock, patch

import numpy as np

from forkfit.knowledge.store import SubstitutionStore
from forkfit.tools.substitution import SubstitutionTool, _chinese_names


class Embeddings:
    def embed_single(self, _query): return [1.0, 0.0]


class SubstitutionSearchV3Tests(unittest.TestCase):
    def test_loading_and_exact_lookup_do_not_request_embeddings(self):
        with patch("forkfit.knowledge.store.EmbeddingClient", side_effect=AssertionError("unexpected network dependency")):
            store = SubstitutionStore()
            store.load()
            first = len(store._candidates)
            store.load()
            self.assertEqual(len(store._candidates), first)
            result = SubstitutionTool(store).lookup("花生酱", ["花生"], locale="zh")
        self.assertGreater(len(result), 0)
        self.assertTrue(all(item["original"] == "peanut butter" for item in result))
        self.assertIn("葵花籽酱", [item["substitute"] for item in result])
        self.assertIsNone(store._embeddings)

    def test_exact_lookup_does_not_fill_with_unrelated_candidates(self):
        store = SubstitutionStore()
        store.load()
        result = store.search("peanut butter", ingredient="peanut butter", top_k=5)
        self.assertTrue(result)
        self.assertTrue(all(item["original"] == "peanut butter" for item in result))

    def test_no_eligible_exact_candidate_returns_empty_without_fuzzy_fallback(self):
        store = SubstitutionStore()
        store.load()
        with patch.object(store, "_ensure_embeddings", side_effect=AssertionError("unexpected fallback")):
            self.assertEqual(store.search("peanut butter", ["unverified-allergen"], ingredient="peanut butter"), [])

    def test_translation_catalog_covers_every_substitute(self):
        store = SubstitutionStore()
        store.load()
        names = _chinese_names()
        for candidate in store._candidates:
            self.assertIn(candidate["substitute"], names)
            self.assertRegex(names[candidate["substitute"]], r"[\u4e00-\u9fff]")

    def test_localization_preserves_candidate_identity_and_english_cache(self):
        store = SubstitutionStore()
        cache = Mock()
        cache.get.return_value = None
        tool = SubstitutionTool(store, cache)
        chinese = tool.lookup("花生酱", ["花生"], locale="zh-CN")
        cached = cache.set.call_args.args[2]
        cache.get.return_value = cached
        english = tool.lookup("花生酱", ["花生"], locale="en")
        self.assertEqual(len(chinese), len(english))
        for zh, en in zip(chinese, english, strict=True):
            self.assertEqual(zh["canonical_substitute"], en["substitute"])
            self.assertEqual(zh["source_entry"], en["source_entry"])
            self.assertEqual(zh["ratio"], en["ratio"])
        self.assertNotIn("canonical_substitute", cached[0])
        self.assertEqual(cache.set.call_count, 1)

    def test_cache_key_includes_context_and_cannot_collide_on_separators(self):
        cache = Mock()
        cache.get.return_value = None
        store = Mock()
        store.search.return_value = [{"substitute": "oat milk"}]
        tool = SubstitutionTool(store, cache)
        tool.lookup("milk", context="for baking")
        tool.lookup("milk", context="for curry")
        tool.lookup("milk", desired_taste="mild:sweet", desired_texture="smooth")
        tool.lookup("milk", desired_taste="mild", desired_texture="sweet:smooth")
        self.assertEqual(len({call.args[1] for call in cache.get.call_args_list}), 4)

    def test_unknown_localized_name_keeps_original_without_guessing(self):
        store = Mock()
        store.search.return_value = [{"substitute": "untranslated ingredient"}]
        result = SubstitutionTool(store).lookup("milk", locale="zh")
        self.assertEqual(result[0]["substitute"], "untranslated ingredient")

    def test_localized_tool_candidates_remain_required_by_patch_applier(self):
        from forkfit.recipe_agent_v3 import AdaptationAgent, PatchApplier, PatchSafetyError, patch_from_dict
        from test_agent_workflow_v3 import pack

        agent = AdaptationAgent(Mock(), SubstitutionTool(SubstitutionStore()))
        arguments = {"ingredient": "花生酱", "excluded_allergens": ["花生"]}
        result = agent._tool("zh").handler(arguments)
        allowed = agent._allowed([{"arguments": arguments, "result": result}])
        self.assertIn("葵花籽酱", allowed["花生酱"])
        original = pack()
        for replacement in ("葵花籽酱", "虚构酱料"):
            recipe_patch = patch_from_dict({"operations": [
                {"op": "replace_ingredient", "meal_id": "m1", "target": "花生酱", "value": replacement}
            ]})
            if replacement == "葵花籽酱":
                output, _ = PatchApplier().apply(original, recipe_patch, safety_targets={"花生酱"}, allowed_replacements=allowed)
                self.assertIn(replacement, output.meals[0].ingredients)
            else:
                with self.assertRaises(PatchSafetyError):
                    PatchApplier().apply(original, recipe_patch, safety_targets={"花生酱"}, allowed_replacements=allowed)
        self.assertIn("花生酱", original.meals[0].ingredients)

    def test_tool_language_is_taken_from_workflow_not_model_arguments(self):
        from forkfit.recipe_agent_v3 import AdaptationAgent
        tool = Mock()
        tool.lookup.return_value = []
        AdaptationAgent(Mock(), tool)._tool("zh").handler({"ingredient": "milk", "locale": "en"})
        self.assertEqual(tool.lookup.call_args.kwargs["locale"], "zh")

    def test_fuzzy_lookup_still_uses_vectors_and_filters_allergens(self):
        with TemporaryDirectory() as temporary, patch("forkfit.knowledge.store._CACHE_DIR", Path(temporary)):
            client = Mock(model="test")
            store = SubstitutionStore()
            store.load(client)
            client.embed.return_value = [[1.0, 0.0] for _ in store._candidates]
            client.embed_single.return_value = [1.0, 0.0]
            result = store.search("creamy paste", ["peanuts"], ingredient="unknown paste")
            self.assertTrue(result)
            client.embed.assert_called_once()
            client.embed_single.assert_called_once()
            allowed = {(c["source_entry"], c["substitute"]) for c in store._candidates if "peanuts" in c["allergens_free"]}
            self.assertTrue(all((item["source_entry"], item["substitute"]) in allowed for item in result))
            store.search("creamy paste", ["peanuts"], ingredient="unknown paste")
            client.embed.assert_called_once()

    def test_read_only_embedding_cache_does_not_break_fuzzy_lookup(self):
        client = Mock(model="test")
        store = SubstitutionStore()
        store.load(client)
        client.embed.return_value = [[1.0, 0.0] for _ in store._candidates]
        client.embed_single.return_value = [1.0, 0.0]
        with TemporaryDirectory() as temporary, patch("forkfit.knowledge.store._CACHE_DIR", Path(temporary)), \
                patch("forkfit.knowledge.store.np.save", side_effect=PermissionError("read-only")):
            self.assertTrue(store.search("creamy paste", ["peanuts"], ingredient="unknown paste"))

    def test_candidate_level_rrf_and_allergen_filter(self):
        store = SubstitutionStore()
        store._loaded = True
        store._client = Embeddings()
        store._embeddings = np.array([[1.0, 0.0], [0.9, 0.1]])
        store._candidates = [
            {"original": "花生酱", "aliases": ["花生"], "tags": ["酱"], "substitute": "葵花籽酱", "reason": "顺滑", "ratio": "1:1", "taste_profile": "香浓", "category": "种子酱", "allergens_free": ["peanuts"], "source_entry": "a", "searchable_text": "花生酱 花生 顺滑 香浓 拌面"},
            {"original": "花生酱", "aliases": [], "tags": [], "substitute": "花生碎", "reason": "", "ratio": "1:1", "taste_profile": "", "category": "", "allergens_free": [], "source_entry": "b", "searchable_text": "花生酱 花生碎"},
        ]
        result = store.search("花生酱 香浓 顺滑 拌面", ["peanuts"], ingredient="花生酱", desired_taste="香浓", desired_texture="顺滑", cooking_use="拌面", top_k=5)
        self.assertEqual([item["substitute"] for item in result], ["葵花籽酱"])


if __name__ == "__main__": unittest.main()
