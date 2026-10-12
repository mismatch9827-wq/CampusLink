from __future__ import annotations

import os
import unittest
from unittest.mock import MagicMock, patch

# Mock MongoDB client and GridFS before importing modules that connect on load
patch("pymongo.MongoClient").start()
patch("gridfs.GridFSBucket").start()

from students import is_eligible, match_required_skill, compute_company_skill_gap
from ai_tools import get_semantic_similarity
from ranking import score_application


class EligibilityAndSkillMatchingTests(unittest.TestCase):
    def test_unrestricted_branches_empty_list(self) -> None:
        """Requirement 1: An empty eligible-branches list behaves as 'all branches'."""
        master_cse = {"cgpa": 8.0, "branch": "CSE", "backlogs": 0}
        master_mech = {"cgpa": 8.5, "branch": "Mechanical", "backlogs": 0}
        master_ece = {"cgpa": 7.8, "branch": "ECE", "backlogs": 0}

        drive_empty_branches = {
            "id": "drive_open",
            "company": "OpenCorp",
            "role": "General Engineer",
            "min_cgpa": 7.0,
            "branches": [],
            "max_backlogs": 0,
        }

        # All branches should be eligible when branches is empty
        ok_cse, reason_cse = is_eligible(master_cse, drive_empty_branches)
        self.assertTrue(ok_cse, f"CSE student was rejected: {reason_cse}")
        self.assertIn("satisfied", reason_cse)

        ok_mech, reason_mech = is_eligible(master_mech, drive_empty_branches)
        self.assertTrue(ok_mech, f"Mechanical student was rejected: {reason_mech}")
        self.assertIn("satisfied", reason_mech)

        ok_ece, reason_ece = is_eligible(master_ece, drive_empty_branches)
        self.assertTrue(ok_ece, f"ECE student was rejected: {reason_ece}")
        self.assertIn("satisfied", reason_ece)

    def test_unrestricted_branches_missing_field(self) -> None:
        """When branches key is None or omitted, eligibility allows all branches."""
        master = {"cgpa": 8.0, "branch": "Civil", "backlogs": 0}
        drive = {
            "min_cgpa": 6.5,
            "max_backlogs": 0,
        }
        ok, reason = is_eligible(master, drive)
        self.assertTrue(ok)

    def test_restricted_branches_enforcement(self) -> None:
        """When branches list is explicitly provided, non-matching branches are rejected."""
        master_cse = {"cgpa": 8.0, "branch": "CSE", "backlogs": 0}
        master_mech = {"cgpa": 8.0, "branch": "Mechanical", "backlogs": 0}
        drive = {
            "min_cgpa": 7.0,
            "branches": ["CSE", "IT"],
            "max_backlogs": 0,
        }
        ok_cse, _ = is_eligible(master_cse, drive)
        self.assertTrue(ok_cse)

        ok_mech, reason_mech = is_eligible(master_mech, drive)
        self.assertFalse(ok_mech)
        self.assertIn("Branch Mechanical is not eligible", reason_mech)

    def test_case_insensitive_branch_matching(self) -> None:
        """Branch comparison should work even if case differs."""
        master_lower = {"cgpa": 8.0, "branch": "cse", "backlogs": 0}
        drive_upper = {
            "min_cgpa": 7.0,
            "branches": ["CSE"],
            "max_backlogs": 0,
        }
        ok, _ = is_eligible(master_lower, drive_upper)
        self.assertTrue(ok)

    def test_or_conjunction_handling(self) -> None:
        """Requirement 2: 'Python or Java' matches when either skill is present."""
        # Only Python present
        ok1, matched1 = match_required_skill("Python or Java", ["Python"])
        self.assertTrue(ok1)
        self.assertIn("Python", matched1)

        # Only Java present
        ok2, matched2 = match_required_skill("Python or Java", ["Java"])
        self.assertTrue(ok2)
        self.assertIn("Java", matched2)

        # Both present
        ok3, matched3 = match_required_skill("Python or Java", ["Python", "Java"])
        self.assertTrue(ok3)
        self.assertIn("Python", matched3)
        self.assertIn("Java", matched3)

        # Neither present
        ok4, matched4 = match_required_skill("Python or Java", ["Ruby", "Go"])
        self.assertFalse(ok4)
        self.assertEqual(matched4, [])

        # Slash-delimited OR: "SQL / MongoDB"
        ok_sql, matched_sql = match_required_skill("SQL / MongoDB", ["SQL"])
        self.assertTrue(ok_sql)
        self.assertIn("SQL", matched_sql)

        ok_mongo, matched_mongo = match_required_skill("SQL / MongoDB", ["MongoDB"])
        self.assertTrue(ok_mongo)
        self.assertIn("MongoDB", matched_mongo)

    def test_and_conjunction_requires_both(self) -> None:
        """Requirement 2: 'HTML & CSS' requires both skills."""
        # Only HTML present -> must NOT match
        ok_html_only, matched_html_only = match_required_skill("HTML & CSS", ["HTML"])
        self.assertFalse(ok_html_only, "HTML & CSS matched with only HTML present")
        self.assertEqual(matched_html_only, [])

        # Only CSS present -> must NOT match
        ok_css_only, matched_css_only = match_required_skill("HTML & CSS", ["CSS"])
        self.assertFalse(ok_css_only, "HTML & CSS matched with only CSS present")
        self.assertEqual(matched_css_only, [])

        # Both present -> matches
        ok_both, matched_both = match_required_skill("HTML & CSS", ["HTML", "CSS"])
        self.assertTrue(ok_both)
        self.assertEqual(len(matched_both), 2)

        # 'and' word delimiter: "Docker and Kubernetes"
        ok_docker_only, _ = match_required_skill("Docker and Kubernetes", ["Docker"])
        self.assertFalse(ok_docker_only)

        ok_docker_k8s, matched_dk = match_required_skill("Docker and Kubernetes", ["Docker", "Kubernetes"])
        self.assertTrue(ok_docker_k8s)
        self.assertEqual(len(matched_dk), 2)

    def test_aliases_and_combined_phrases(self) -> None:
        """Aliases for atomic and whole skills work correctly."""
        # HTML5 + CSS3 satisfies "HTML & CSS"
        ok_ver, matched_ver = match_required_skill("HTML & CSS", ["HTML5", "CSS3"])
        self.assertTrue(ok_ver)
        self.assertIn("html5", matched_ver)
        self.assertIn("css3", matched_ver)

        # "DSA" satisfies "Data Structures & Algorithms"
        ok_dsa, matched_dsa = match_required_skill("Data Structures & Algorithms", ["DSA"])
        self.assertTrue(ok_dsa)
        self.assertIn("dsa", matched_dsa)

        # "FastAPI" in resume satisfies "REST APIs"
        ok_rest, _ = match_required_skill("REST APIs", [], resume_text="Extensive experience building FastAPI services.")
        self.assertTrue(ok_rest)

        # Single atomic skill keeps intended behavior
        ok_sql_alias, matched_sql_alias = match_required_skill("SQL", ["PostgreSQL"])
        self.assertTrue(ok_sql_alias)

    def test_company_skill_gap_score_and_skills_agreement(self) -> None:
        """Requirement 3: compute_company_skill_gap score matches displayed matched/missing skills."""
        master = {"cgpa": 8.0, "branch": "CSE", "backlogs": 0}
        profile = {
            "parsed_skills": ["Python", "HTML"],
            "resume_text": "Backend developer with PostgreSQL experience",
            "projects": [],
        }
        drive = {
            "id": "drive_agree_1",
            "company": "Tech Corp",
            "role": "Junior Engineer",
            "min_cgpa": 7.0,
            "branches": [],  # unrestricted branches
            "max_backlogs": 0,
            "required_skills": [
                "Python or Java",         # Matches (has Python)
                "SQL / MongoDB",          # Matches (resume has PostgreSQL)
                "HTML & CSS",             # Missing (only HTML, missing CSS)
                "Docker & Kubernetes",    # Missing (neither)
            ],
        }

        res = compute_company_skill_gap(master, profile, drive)

        matched_skills_names = [m["skill"] for m in res["matched_skills"]]
        missing_skills_names = [g["skill"] for g in res["missing_skills"]]

        # 1. No requirement should be in both matched and missing
        overlap = set(matched_skills_names) & set(missing_skills_names)
        self.assertEqual(len(overlap), 0, f"Skills appear in both matched and missing: {overlap}")

        # 2. Total must partition exactly
        self.assertEqual(len(matched_skills_names) + len(missing_skills_names), len(drive["required_skills"]))

        # 3. Exactly 2 matched (Python or Java, SQL / MongoDB)
        self.assertIn("Python or Java", matched_skills_names)
        self.assertIn("SQL / MongoDB", matched_skills_names)

        # 4. Exactly 2 missing (HTML & CSS, Docker & Kubernetes)
        self.assertIn("HTML & CSS", missing_skills_names)
        self.assertIn("Docker & Kubernetes", missing_skills_names)

        # 5. Score agreement: 2/4 = 50%
        self.assertEqual(res["match_percentage"], 50)

        # 6. Unrestricted branches -> eligible is True
        self.assertTrue(res["eligible"])

    @patch("ai_tools.gemini_is_configured", return_value=False)
    @patch("ranking.generate_explanation", return_value=["Computed fit score: 67.0/100"])
    @patch("ranking.find_one")
    def test_score_application_agreement_with_displayed_skills(self, mock_find_one, mock_generate_explanation, mock_gemini_cfg) -> None:
        """Requirement 3 & 5: ranking.py score_application agreement between score and displayed skills."""
        drive = {
            "id": "d_100",
            "role": "Software Engineer",
            "required_skills": [
                "Python or Java",
                "HTML & CSS",
                "SQL",
            ],
        }
        master = {
            "id": "s_100",
            "cgpa": 8.0,
            "mock_interview": 80,
            "aptitude": 80,
        }
        profile = {
            "student_id": "s_100",
            "parsed_skills": ["Python", "HTML", "MySQL"],
            "projects": [],
            "certificates": [],
            "resume_text": "",
        }

        def mock_db_lookup(collection: str, query: dict):
            if collection == "drives":
                return drive
            if collection == "master_students":
                return master
            if collection == "students":
                return profile
            return None

        mock_find_one.side_effect = mock_db_lookup

        app = {"id": "app_1", "drive_id": "d_100", "student_id": "s_100"}

        result = score_application(app)

        matched = result["matched_skills"]
        missing = result["missing_skills"]

        # Python or Java: Matched (has Python)
        self.assertIn("Python or Java", matched)
        self.assertNotIn("Python or Java", missing)

        # SQL: Matched (has MySQL alias)
        self.assertIn("SQL", matched)
        self.assertNotIn("SQL", missing)

        # HTML & CSS: Missing (only has HTML)
        self.assertIn("HTML & CSS", missing)
        self.assertNotIn("HTML & CSS", matched)

        # Check total agreement: 2 out of 3 matched = 67%
        self.assertEqual(len(matched), 2)
        self.assertEqual(len(missing), 1)

        # Verify semantic similarity calculation: 2 / 3 = 0.67 -> skill_score = 67.0
        expected_sim = round(2 / 3, 2)
        expected_skill_score = round(expected_sim * 100, 1)

        # Check score weights strictly: 40% skill, 20% evidence, 25% assessment, 15% cgpa
        expected_assessment = (80 + 80) / 2
        expected_cgpa = 8.0 * 10
        expected_evidence = 0
        expected_fit = round(expected_skill_score * 0.40 + expected_evidence * 0.20 + expected_assessment * 0.25 + expected_cgpa * 0.15, 1)

        self.assertEqual(result["fit_score"], expected_fit)

    def test_official_roster_sources_preserved(self) -> None:
        """Requirement 4: Official roster (master) is the sole authority for CGPA, branch, backlogs."""
        # master has 8.0 CGPA and 0 backlogs, which meets drive requirements
        master = {"cgpa": 8.0, "branch": "CSE", "backlogs": 0}
        drive = {"min_cgpa": 7.5, "branches": ["CSE"], "max_backlogs": 0}

        ok, reason = is_eligible(master, drive)
        self.assertTrue(ok)

        # If official master has backlogs, even if self-reported might claim otherwise, reject
        master_with_backlog = {"cgpa": 8.0, "branch": "CSE", "backlogs": 2}
        ok_b, reason_b = is_eligible(master_with_backlog, drive)
        self.assertFalse(ok_b)
        self.assertIn("Backlogs exceed", reason_b)

        # If official master has lower CGPA, reject
        master_low_cgpa = {"cgpa": 6.8, "branch": "CSE", "backlogs": 0}
        ok_c, reason_c = is_eligible(master_low_cgpa, drive)
        self.assertFalse(ok_c)
        self.assertIn("CGPA 6.8 is below 7.5", reason_c)


if __name__ == "__main__":
    unittest.main()
