from __future__ import annotations

import unittest
from unittest.mock import patch, MagicMock

# Preempt MongoClient / GridFS connections before db import
patch("pymongo.MongoClient").start()
patch("gridfs.GridFSBucket").start()

from students import readiness, _public_student, student_readiness


class AptitudeAndCommunicationScoresTests(unittest.TestCase):
    def setUp(self) -> None:
        self.base_master = {
            "id": "s_100",
            "registration_number": "REG100",
            "name": "Alex Student",
            "branch": "CSE",
            "cgpa": 8.0,
            "backlogs": 0,
            "passing_year": 2026,
            "email": "alex@example.com",
            "mock_interview": 70.0,
        }
        self.base_profile = {
            "student_id": "s_100",
            "parsed_skills": ["Python", "SQL"],
            "projects": [{"title": "Portal", "verified": True}],
            "certificates": [],
        }

    def test_missing_scores_not_awarded_and_flagged_as_unassessed(self) -> None:
        # Master record with unassessed aptitude and communication (None)
        master = {
            **self.base_master,
            "aptitude": None,
            "communication": None,
        }

        # 1. Readiness calculation does not award points for missing values
        score, level, gaps = readiness(master, self.base_profile)
        # Expected: academic (80*0.20=16) + tech (30*0.30=9) + proj (35*0.15=5.25) + mock (70*0.05=3.5) = 33.75 -> 33.8
        # Aptitude (0 pts) + Communication (0 pts)
        self.assertAlmostEqual(score, 33.8, delta=0.2)

        # 2. _public_student preserves None in breakdown rather than coercing to 0
        public = _public_student(master, self.base_profile)
        breakdown = public["breakdown"]
        self.assertIsNone(breakdown["aptitude"])
        self.assertIsNone(breakdown["communication"])
        self.assertIn("aptitude", public["unassessed_categories"])
        self.assertIn("communication", public["unassessed_categories"])

        # 3. student_readiness recommendations indicate assessment is pending
        with patch("students._student_records", return_value=(master, self.base_profile)), \
             patch("students.find_many", return_value=[]):
            user = {"role": "student", "registration_number": "REG100"}
            readiness_data = student_readiness(user=user)

        self.assertIn("Aptitude", readiness_data["unassessed_categories"])
        self.assertIn("Communication", readiness_data["unassessed_categories"])
        self.assertTrue(any("Aptitude assessment is pending" in r for r in readiness_data["recommendations"]))
        self.assertFalse(any("Aptitude score is 0/100" in r for r in readiness_data["recommendations"]))

    def test_genuine_score_of_zero_preserved_and_not_treated_as_missing(self) -> None:
        # Master record with an assessed genuine score of 0
        master = {
            **self.base_master,
            "aptitude": 0.0,
            "communication": 0.0,
        }

        # 1. Readiness calculation gives same score contribution (0 points)
        score, level, gaps = readiness(master, self.base_profile)
        self.assertAlmostEqual(score, 33.8, delta=0.2)

        # 2. _public_student preserves 0 (not None) in breakdown
        public = _public_student(master, self.base_profile)
        breakdown = public["breakdown"]
        self.assertEqual(breakdown["aptitude"], 0)
        self.assertEqual(breakdown["communication"], 0)
        self.assertIsNotNone(breakdown["aptitude"])
        self.assertIsNotNone(breakdown["communication"])
        # Not flagged as unassessed
        self.assertEqual(public["unassessed_categories"], [])

        # 3. student_readiness recommendations treat 0 as an assessed score
        with patch("students._student_records", return_value=(master, self.base_profile)), \
             patch("students.find_many", return_value=[]):
            user = {"role": "student", "registration_number": "REG100"}
            readiness_data = student_readiness(user=user)

        self.assertEqual(readiness_data["unassessed_categories"], [])
        self.assertTrue(any("Aptitude score is 0/100" in r for r in readiness_data["recommendations"]))
        self.assertFalse(any("assessment is pending" in r for r in readiness_data["recommendations"]))

    def test_present_nonzero_scores_award_points_and_display_correctly(self) -> None:
        # Master record with present assessed scores
        master = {
            **self.base_master,
            "aptitude": 80.0,
            "communication": 90.0,
        }

        # 1. Readiness calculation adds 80*0.10=8.0 and 90*0.10=9.0 points (17.0 additional pts)
        score, level, gaps = readiness(master, self.base_profile)
        # 33.75 + 17.0 = 50.75 -> 50.8
        self.assertAlmostEqual(score, 50.8, delta=0.2)

        # 2. _public_student returns integer/float scores in breakdown
        public = _public_student(master, self.base_profile)
        breakdown = public["breakdown"]
        self.assertEqual(breakdown["aptitude"], 80)
        self.assertEqual(breakdown["communication"], 90)
        self.assertEqual(public["unassessed_categories"], [])

        # 3. student_readiness recommendations
        with patch("students._student_records", return_value=(master, self.base_profile)), \
             patch("students.find_many", return_value=[]):
            user = {"role": "student", "registration_number": "REG100"}
            readiness_data = student_readiness(user=user)

        self.assertEqual(readiness_data["unassessed_categories"], [])
        # Both scores >= 65, so no low score recommendation
        self.assertFalse(any("Aptitude" in r for r in readiness_data["recommendations"]))


if __name__ == "__main__":
    unittest.main()
