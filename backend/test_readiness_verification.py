import os
import unittest
from unittest.mock import MagicMock, patch
from dotenv import load_dotenv

load_dotenv()
os.environ.setdefault("JWT_SECRET", "test-secret-key-12345")

from students import readiness
from verification import parse_github_repo, verify_github_project


class ProjectVerificationAndReadinessTests(unittest.TestCase):
    def test_parse_github_repo(self) -> None:
        self.assertEqual(parse_github_repo("https://github.com/facebook/react"), ("facebook", "react"))
        self.assertEqual(parse_github_repo("https://github.com/torvalds/linux.git"), ("torvalds", "linux"))
        self.assertEqual(parse_github_repo("github.com/user/my-repo"), ("user", "my-repo"))
        self.assertIsNone(parse_github_repo("https://gitlab.com/user/repo"))
        self.assertIsNone(parse_github_repo("invalid text"))

    @patch("verification.urllib.request.urlopen")
    def test_verify_github_project_success(self, mock_urlopen) -> None:
        mock_response = MagicMock()
        mock_response.status = 200
        mock_response.read.return_value = b'{"name": "test-repo", "stargazers_count": 5, "language": "Python", "size": 120, "updated_at": "2026-03-01T00:00:00Z"}'
        mock_response.__enter__.return_value = mock_response
        mock_urlopen.return_value = mock_response

        res = verify_github_project("https://github.com/testowner/test-repo")
        self.assertTrue(res["verified"])
        self.assertEqual(res["repo"], "test-repo")
        self.assertEqual(res["language"], "Python")
        self.assertEqual(res["stars"], 5)

    def test_readiness_score_impact_from_project_verification(self) -> None:
        # Base student profile
        base_master = {
            "academic": {"cgpa": 8.0, "backlogs": 0},
            "skills": ["Python", "FastAPI"],
            "certifications": [],
            "mock_interviews": [],
        }

        # Case 1: 2 Unverified projects (e.g. self-declared only, no verified repo)
        profile_unverified = {
            "projects": [
                {"title": "E-commerce Website", "verified": False},
                {"title": "Chat App", "verified": False},
            ],
            "aptitude_score": 75,
            "mock_interview_score": 70,
        }

        # Case 2: Same student, but both projects are verified via GitHub
        profile_verified = {
            "projects": [
                {"title": "E-commerce Website", "verified": True, "github_url": "https://github.com/student/ecom"},
                {"title": "Chat App", "verified": True, "github_url": "https://github.com/student/chat"},
            ],
            "aptitude_score": 75,
            "mock_interview_score": 70,
        }

        # Compute readiness for both (returns tuple (score, level, gaps))
        score_unverified, level_unverified, gaps_unverified = readiness(base_master, profile_unverified)
        score_verified, level_verified, gaps_verified = readiness(base_master, profile_verified)

        # In unverified case: 2 unverified projects = 2 * 12 = 24 project pts
        # In verified case: 2 verified projects = 2 * 35 = 70 project pts (+46 project points!)
        # The overall readiness score should be significantly higher for the verified student
        self.assertGreater(score_verified, score_unverified)

        # Difference in readiness score is 15% of the 46 project points difference (~6.9 points)
        self.assertAlmostEqual(score_verified - score_unverified, 6.9, delta=0.5)

    def test_smart_skill_matching_and_company_gap_analysis(self) -> None:
        from students import match_required_skill, compute_company_skill_gap

        student_skills = ["Python", "SQL", "C++", "HTML"]
        resume_text = "Built a web portal using FastAPI and Postgres. Solved 200 DSA problems."

        # Test "Python or Java" -> Matched because student has Python
        ok1, matched1 = match_required_skill("Python or Java", student_skills, resume_text)
        self.assertTrue(ok1)
        self.assertIn("Python", matched1)

        # Test "SQL / MongoDB" -> Matched because student has SQL
        ok2, matched2 = match_required_skill("SQL / MongoDB", student_skills, resume_text)
        self.assertTrue(ok2)
        self.assertIn("SQL", matched2)

        # Test "REST APIs" -> Matched because resume mentions FastAPI
        ok3, matched3 = match_required_skill("REST APIs", student_skills, resume_text)
        self.assertTrue(ok3)

        # Test "Docker" -> False (Gap)
        ok4, matched4 = match_required_skill("Docker & Kubernetes", student_skills, resume_text)
        self.assertFalse(ok4)

        # Full company gap analysis
        master = {"cgpa": 8.5, "branch": "CSE", "backlogs": 0}
        profile = {"parsed_skills": student_skills, "resume_text": resume_text, "projects": []}
        drive = {
            "id": "d_123",
            "company": "NexaWave Technologies",
            "role": "SDE Trainee",
            "min_cgpa": 7.5,
            "branches": ["CSE", "IT"],
            "max_backlogs": 0,
            "ctc": 12.0,
            "required_skills": ["Python or Java", "SQL / MongoDB", "REST APIs", "Docker & Kubernetes"],
        }

        res = compute_company_skill_gap(master, profile, drive)
        self.assertEqual(res["company"], "NexaWave Technologies")
        self.assertTrue(res["eligible"])
        self.assertEqual(len(res["matched_skills"]), 3)
        self.assertEqual(len(res["missing_skills"]), 1)
        self.assertEqual(res["missing_skills"][0]["skill"], "Docker & Kubernetes")
        self.assertEqual(res["match_percentage"], 75)
        self.assertGreater(len(res["company_advice"]), 0)


if __name__ == "__main__":
    unittest.main()

