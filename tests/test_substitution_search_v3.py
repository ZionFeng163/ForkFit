import unittest

import numpy as np

from forkfit.knowledge.store import SubstitutionStore


class Embeddings:
    def embed_single(self, _query): return [1.0, 0.0]


class SubstitutionSearchV3Tests(unittest.TestCase):
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
