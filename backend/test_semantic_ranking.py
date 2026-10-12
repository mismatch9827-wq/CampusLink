from __future__ import annotations

import os
import unittest
from unittest.mock import MagicMock, patch

# Mock Mongo before importing modules that connect on load
patch("pymongo.MongoClient").start()
patch("gridfs.GridFSBucket").start()

from ai_tools import (
    compute_cosine_similarity,
    embed_texts,
    semantic_match_skills,
    get_semantic_similarity,
    clear_embedding_cache,
    get_embedding_cache_size,
)
from ranking import score_application, ranked


class SemanticRankingEmbeddingTests(unittest.TestCase):
    def setUp(self) -> None:
        clear_embedding_cache()

    def tearDown(self) -> None:
        clear_embedding_cache()

    # ---------------- 1. Cosine Similarity Math ----------------
    def test_compute_cosine_similarity(self) -> None:
        # Exact match
        self.assertAlmostEqual(compute_cosine_similarity([1.0, 0.0, 0.0], [1.0, 0.0, 0.0]), 1.0)
        # Scaled identical direction
        self.assertAlmostEqual(compute_cosine_similarity([1.0, 2.0, 3.0], [2.0, 4.0, 6.0]), 1.0)
        # Orthogonal
        self.assertAlmostEqual(compute_cosine_similarity([1.0, 0.0], [0.0, 1.0]), 0.0)
        # Opposite direction
        self.assertAlmostEqual(compute_cosine_similarity([1.0, 0.0], [-1.0, 0.0]), -1.0)
        # Zero vector handling
        self.assertEqual(compute_cosine_similarity([0.0, 0.0], [1.0, 2.0]), 0.0)

    # ---------------- 2. Close vs Unrelated Concepts ----------------
    @patch("ai_tools.GoogleGenerativeAIEmbeddings")
    @patch("ai_tools._get_api_keys", return_value=["test-key-123"])
    def test_close_semantic_match_vs_unrelated_skill(self, mock_keys, mock_emb_cls) -> None:
        """
        Requirement 1 & 2: Compares close semantic match (REST APIs vs FastAPI -> ~0.88)
        against an unrelated skill (Kubernetes vs Graphic Design -> ~0.20).
        """
        # Vector representations:
        # Let Dim 0 be Backend/API, Dim 1 be Cloud/Infra, Dim 2 be Creative/Design
        # FastAPI: [0.95, 0.1, 0.0]
        # REST APIs: [0.90, 0.2, 0.0]  -> Cosine sim with FastAPI ~ 0.98 (> 0.72 threshold)
        # Graphic Design: [0.0, 0.0, 1.0]
        # Kubernetes: [0.1, 0.95, 0.0] -> Cosine sim with Graphic Design = 0.0 (< 0.72)
        vector_map = {
            "fastapi": [0.95, 0.10, 0.0],
            "rest apis": [0.90, 0.20, 0.0],
            "graphic design": [0.0, 0.0, 1.0],
            "kubernetes": [0.10, 0.95, 0.0],
        }

        mock_instance = MagicMock()
        def fake_embed(texts):
            return [vector_map.get(t.lower().strip(), [0.1, 0.1, 0.1]) for t in texts]
        mock_instance.embed_documents.side_effect = fake_embed
        mock_emb_cls.return_value = mock_instance

        # Student with FastAPI and Graphic Design
        student_skills = ["FastAPI", "Graphic Design"]
        required_skills = ["REST APIs", "Kubernetes"]

        res = semantic_match_skills(student_skills, required_skills, threshold=0.72)

        # Provider must be identified as gemini_embedding
        self.assertEqual(res["match_provider"], "gemini_embedding")

        # REST APIs matches FastAPI (cosine sim > 0.72)
        self.assertIn("REST APIs", res["matched_skills"])
        self.assertNotIn("REST APIs", res["missing_skills"])

        # Kubernetes does not match Graphic Design or FastAPI (cosine sim < 0.72)
        self.assertIn("Kubernetes", res["missing_skills"])
        self.assertNotIn("Kubernetes", res["matched_skills"])

        # Similarity score: 1 out of 2 matched = 0.50
        self.assertEqual(res["similarity"], 0.50)

    # ---------------- 3. Conjunction Handling in Embeddings ----------------
    @patch("ai_tools.GoogleGenerativeAIEmbeddings")
    @patch("ai_tools._get_api_keys", return_value=["test-key-123"])
    def test_semantic_conjunction_or_and_and(self, mock_keys, mock_emb_cls) -> None:
        """
        Requirement 2: 'Python or Java' matches if either is close.
        'HTML & CSS' requires both to be close.
        """
        vector_map = {
            "python": [1.0, 0.0, 0.0, 0.0],
            "java": [0.0, 1.0, 0.0, 0.0],
            "python or java": [0.7, 0.7, 0.0, 0.0],
            "html": [0.0, 0.0, 1.0, 0.0],
            "css": [0.0, 0.0, 0.0, 1.0],
            "html & css": [0.0, 0.0, 0.7, 0.7],
        }

        mock_instance = MagicMock()
        mock_instance.embed_documents.side_effect = lambda texts: [
            vector_map.get(t.lower().strip(), [0.1, 0.1, 0.1, 0.1]) for t in texts
        ]
        mock_emb_cls.return_value = mock_instance

        # Case A: Student has Python only
        res_or = semantic_match_skills(["Python"], ["Python or Java"], threshold=0.72)
        self.assertIn("Python or Java", res_or["matched_skills"])
        self.assertEqual(res_or["similarity"], 1.0)

        # Case B: Student has HTML only -> 'HTML & CSS' requires both -> MUST FAIL
        res_and_partial = semantic_match_skills(["HTML"], ["HTML & CSS"], threshold=0.72)
        self.assertIn("HTML & CSS", res_and_partial["missing_skills"])
        self.assertNotIn("HTML & CSS", res_and_partial["matched_skills"])
        self.assertEqual(res_and_partial["similarity"], 0.0)

        # Case C: Student has both HTML and CSS -> MATCHES
        clear_embedding_cache()
        res_and_both = semantic_match_skills(["HTML", "CSS"], ["HTML & CSS"], threshold=0.72)
        self.assertIn("HTML & CSS", res_and_both["matched_skills"])
        self.assertEqual(res_and_both["similarity"], 1.0)

    # ---------------- 4. Fallback Behavior ----------------
    @patch("ai_tools._get_api_keys", return_value=[])
    def test_fallback_when_gemini_unconfigured(self, mock_keys) -> None:
        """Requirement 5: If Gemini is unconfigured, falls back to deterministic matcher with clear provider attribution."""
        res = semantic_match_skills(["Python", "SQL"], ["Python or Java", "SQL / MongoDB", "Docker"])
        self.assertEqual(res["match_provider"], "deterministic_fallback")
        self.assertIn("Python or Java", res["matched_skills"])
        self.assertIn("SQL / MongoDB", res["matched_skills"])
        self.assertIn("Docker", res["missing_skills"])
        self.assertEqual(res["similarity"], 0.67)

    @patch("ai_tools.GoogleGenerativeAIEmbeddings")
    @patch("ai_tools._get_api_keys", return_value=["test-key-123"])
    def test_fallback_when_embedding_call_raises_exception(self, mock_keys, mock_emb_cls) -> None:
        """Requirement 5: If embedding provider errors or times out, falls back to deterministic matcher."""
        mock_instance = MagicMock()
        mock_instance.embed_documents.side_effect = TimeoutError("Gemini embedding endpoint timed out")
        mock_emb_cls.return_value = mock_instance

        res = semantic_match_skills(["Python"], ["Python or Java", "Docker"])
        self.assertEqual(res["match_provider"], "deterministic_fallback")
        self.assertIn("Python or Java", res["matched_skills"])
        self.assertIn("Docker", res["missing_skills"])

    @patch("ai_tools.GoogleGenerativeAIEmbeddings")
    @patch("ai_tools._get_api_keys", return_value=["test-key-123"])
    def test_fallback_when_provider_returns_invalid_vectors(self, mock_keys, mock_emb_cls) -> None:
        """Requirement 5: If embedding provider returns NaN, Inf, or empty vectors, falls back."""
        mock_instance = MagicMock()
        mock_instance.embed_documents.return_value = [[float("nan"), 0.0, 0.0]]
        mock_emb_cls.return_value = mock_instance

        res = semantic_match_skills(["Python"], ["Python"])
        self.assertEqual(res["match_provider"], "deterministic_fallback")
        self.assertIn("Python", res["matched_skills"])

    # ---------------- 5. Caching Strategy ----------------
    @patch("ai_tools.GoogleGenerativeAIEmbeddings")
    @patch("ai_tools._get_api_keys", return_value=["test-key-123"])
    def test_cache_avoids_repeated_embedding_calls(self, mock_keys, mock_emb_cls) -> None:
        """Requirement 6: Unchanged text is read from LRU cache without repeated provider calls."""
        mock_instance = MagicMock()
        mock_instance.embed_documents.return_value = [[0.5, 0.5], [0.8, 0.2]]
        mock_emb_cls.return_value = mock_instance

        texts = ["FastAPI", "React"]

        # Call 1: Cache miss
        vecs1 = embed_texts(texts)
        self.assertEqual(mock_instance.embed_documents.call_count, 1)
        self.assertEqual(get_embedding_cache_size(), 2)

        # Call 2: Identical texts -> Must be a cache hit (provider not called again)
        vecs2 = embed_texts(texts)
        self.assertEqual(mock_instance.embed_documents.call_count, 1)
        self.assertEqual(vecs1, vecs2)

        # Invalidation via clear_embedding_cache
        clear_embedding_cache()
        self.assertEqual(get_embedding_cache_size(), 0)

        # Call 3: Now calls provider again
        vecs3 = embed_texts(texts)
        self.assertEqual(mock_instance.embed_documents.call_count, 2)

    # ---------------- 6. score_application & Weights Agreement ----------------
    @patch("ranking.semantic_match_skills")
    @patch("ranking.generate_explanation", return_value=["Candidate matches key skills."])
    @patch("ranking.find_one")
    def test_score_application_preserves_weights_and_records_provider(
        self, mock_find_one, mock_gen_exp, mock_match
    ) -> None:
        """
        Requirement 3 & 4: Derives fit score, matched skills, and missing skills
        from the same results, preserving 40/20/25/15 weights and recording match_provider.
        """
        mock_match.return_value = {
            "similarity": 0.75,
            "matched_skills": ["Python", "FastAPI", "SQL"],
            "missing_skills": ["Docker"],
            "match_provider": "gemini_embedding",
            "match_details": [],
        }

        drive = {
            "id": "d_test",
            "role": "Backend Engineer",
            "required_skills": ["Python", "FastAPI", "SQL", "Docker"],
        }
        master = {
            "id": "s_test",
            "cgpa": 8.5,
            "mock_interview": 80,
            "aptitude": 80,
        }
        profile = {
            "student_id": "s_test",
            "parsed_skills": ["Python", "FastAPI", "SQL"],
            "projects": [{"title": "Web App", "verified": True}],  # 1 project = 28 evidence pts
            "certificates": [],
        }

        def mock_lookup(collection, query):
            if collection == "drives":
                return drive
            if collection == "master_students":
                return master
            if collection == "students":
                return profile
            return None

        mock_find_one.side_effect = mock_lookup

        app = {"id": "app_test", "drive_id": "d_test", "student_id": "s_test"}
        result = score_application(app)

        # 1. Match provider clearly identified
        self.assertEqual(result["match_provider"], "gemini_embedding")

        # 2. Matched & missing skills agreed
        self.assertEqual(result["matched_skills"], ["Python", "FastAPI", "SQL"])
        self.assertEqual(result["missing_skills"], ["Docker"])

        # 3. Exact 40/20/25/15 weights verification:
        # skill_score = 0.75 * 100 = 75.0
        # evidence = 1 * 28 = 28
        # assessment = (80 + 80) / 2 = 80.0
        # cgpa = 8.5 * 10 = 85.0
        # fit = 75.0 * 0.40 (30.0) + 28 * 0.20 (5.6) + 80 * 0.25 (20.0) + 85.0 * 0.15 (12.75) = 68.35 -> 68.4
        expected_fit = round(75.0 * 0.40 + 28 * 0.20 + 80.0 * 0.25 + 85.0 * 0.15, 1)
        self.assertEqual(result["fit_score"], expected_fit)

    # ---------------- 7. Active Recruiter Route Integration ----------------
    @patch("ranking.score_application")
    @patch("ranking.update_one")
    @patch("ranking.find_many")
    @patch("ranking.find_one")
    def test_recruiter_ranked_route_stores_match_provider(
        self, mock_find_one, mock_find_many, mock_update, mock_score
    ) -> None:
        """
        Verifies that /recruiter/drives/{drive_id}/ranked invokes score_application,
        stores match_provider in the database, and attaches it to the response object.
        """
        recruiter = {"id": "rec_1"}
        drive = {"id": "d_1", "recruiter_id": "rec_1", "role": "SDE"}
        apps = [
            {"id": "a_1", "drive_id": "d_1", "student_id": "s_1", "status": "verified", "fit_score": None}
        ]

        mock_find_one.return_value = drive
        mock_find_many.return_value = apps

        mock_score.return_value = {
            "fit_score": 82.5,
            "reasons": ["Strong skill match"],
            "matched_skills": ["Python", "FastAPI"],
            "missing_skills": [],
            "match_provider": "gemini_embedding",
        }

        ranked_list = ranked("d_1", recruiter=recruiter)

        # score_application was called
        mock_score.assert_called_once()

        # Database updated with match_provider
        mock_update.assert_called_once()
        update_args = mock_update.call_args[0]
        self.assertEqual(update_args[2]["match_provider"], "gemini_embedding")
        self.assertEqual(update_args[2]["fit_score"], 82.5)

        # Output contains match_provider
        self.assertEqual(len(ranked_list), 1)
        self.assertEqual(ranked_list[0]["match_provider"], "gemini_embedding")
        self.assertEqual(ranked_list[0]["fit_score"], 82.5)


if __name__ == "__main__":
    unittest.main()
