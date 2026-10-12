from __future__ import annotations

import io
import unittest
from unittest.mock import MagicMock, patch

# Preempt MongoClient / GridFS connections before db import
patch("pymongo.MongoClient").start()
patch("gridfs.GridFSBucket").start()

from ai_tools import (
    parse_resume,
    parse_jd,
    _fallback_parse_resume,
    _fallback_parse_jd,
    ResumeExtraction,
    JDExtraction,
)
from drives import parse_jd_pdf
from students import upload_resume
from fastapi import UploadFile


class ParsingProviderReportingTests(unittest.TestCase):
    def test_resume_mock_gemini_success(self) -> None:
        mock_output = MagicMock()
        mock_output.model_dump.return_value = {
            "skills": ["Python", "FastAPI"],
            "projects": ["CampusLink"],
            "certificates": ["AWS Certified Cloud Practitioner"],
            "cgpa": 8.5,
        }

        with patch("ai_tools._get_api_keys", return_value=["dummy-test-key"]), \
             patch("ai_tools.ChatGoogleGenerativeAI") as mock_chat:
            mock_llm = MagicMock()
            mock_structured = MagicMock()
            mock_chat.return_value = mock_llm
            mock_llm.with_structured_output.return_value = mock_structured
            
            # Mock the runnable chain
            with patch("ai_tools.ChatPromptTemplate") as mock_prompt_tmpl:
                mock_chain = MagicMock()
                mock_prompt_tmpl.from_messages.return_value.__or__ = MagicMock(return_value=mock_chain)
                mock_chain.invoke.return_value = mock_output

                res = parse_resume("Sample resume text with Python")

        self.assertEqual(res["parsing_provider"], "gemini")
        self.assertFalse(res["fallback_used"])
        self.assertIsNone(res["fallback_reason"])
        self.assertEqual(res["skills"], ["Python", "FastAPI"])
        self.assertEqual(res["projects"], ["CampusLink"])

    def test_resume_missing_configuration_falls_back(self) -> None:
        with patch("ai_tools._get_api_keys", return_value=[]):
            res = parse_resume(
                "PROJECTS\n• DevPortal - Developer portal with React\n\nSKILLS\nPython, Docker, SQL\n\nCGPA: 8.2"
            )

        self.assertEqual(res["parsing_provider"], "rule_based_fallback")
        self.assertTrue(res["fallback_used"])
        self.assertIn("not configured", res["fallback_reason"])
        self.assertIn("Python", res["skills"])
        self.assertIn("Docker", res["skills"])
        self.assertIn("SQL", res["skills"])
        self.assertIn("DevPortal", res["projects"])
        self.assertEqual(res["cgpa"], 8.2)

    def test_resume_gemini_provider_failure_exposes_fallback(self) -> None:
        with patch("ai_tools._get_api_keys", return_value=["mock-key-1", "mock-key-2"]), \
             patch("ai_tools.ChatGoogleGenerativeAI", side_effect=RuntimeError("QuotaExceeded 429")):
            res = parse_resume("Python and React developer. CGPA: 9.0")

        self.assertEqual(res["parsing_provider"], "rule_based_fallback")
        self.assertTrue(res["fallback_used"])
        self.assertIn("failed across all keys", res["fallback_reason"])
        self.assertIn("Python", res["skills"])
        self.assertIn("React", res["skills"])
        self.assertEqual(res["cgpa"], 9.0)

    def test_jd_mock_gemini_success(self) -> None:
        mock_output = MagicMock()
        mock_output.model_dump.return_value = {
            "company": "TechCorp",
            "role": "SDE-1",
            "required_skills": ["Python", "Docker"],
            "branches": ["CSE"],
            "min_cgpa": 7.5,
            "max_backlogs": 0,
            "ctc": 14.0,
            "drive_date": "2026-11-20",
            "slot": "Morning",
            "venue": "Campus Hall",
        }

        with patch("ai_tools._get_api_keys", return_value=["dummy-test-key"]), \
             patch("ai_tools.ChatGoogleGenerativeAI") as mock_chat:
            mock_llm = MagicMock()
            mock_structured = MagicMock()
            mock_chat.return_value = mock_llm
            mock_llm.with_structured_output.return_value = mock_structured
            
            with patch("ai_tools.ChatPromptTemplate") as mock_prompt_tmpl:
                mock_chain = MagicMock()
                mock_prompt_tmpl.from_messages.return_value.__or__ = MagicMock(return_value=mock_chain)
                mock_chain.invoke.return_value = mock_output

                res = parse_jd("TechCorp hiring SDE-1")

        self.assertEqual(res["parsing_provider"], "gemini")
        self.assertFalse(res["fallback_used"])
        self.assertIsNone(res["fallback_reason"])
        self.assertEqual(res["company"], "TechCorp")
        self.assertEqual(res["ctc"], 14.0)

    def test_jd_missing_configuration_falls_back(self) -> None:
        jd_text = "Company: InnovateTech\nRole: Backend Engineer\nEligible branches: CSE, IT\nMin CGPA: 7.0\nCTC: 10 LPA"
        with patch("ai_tools._get_api_keys", return_value=[]):
            res = parse_jd(jd_text)

        self.assertEqual(res["parsing_provider"], "rule_based_fallback")
        self.assertTrue(res["fallback_used"])
        self.assertIn("not configured", res["fallback_reason"])
        self.assertEqual(res["company"], "InnovateTech")
        self.assertEqual(res["role"], "Backend Engineer")
        self.assertEqual(res["ctc"], 10.0)

    def test_jd_gemini_provider_failure_exposes_fallback(self) -> None:
        jd_text = "Company: DataCorp\nRole: Data Analyst\nCTC: 8 LPA"
        with patch("ai_tools._get_api_keys", return_value=["test-key-1"]), \
             patch("ai_tools.ChatGoogleGenerativeAI", side_effect=Exception("API key invalid")):
            res = parse_jd(jd_text)

        self.assertEqual(res["parsing_provider"], "rule_based_fallback")
        self.assertTrue(res["fallback_used"])
        self.assertIn("failed across all keys", res["fallback_reason"])
        self.assertEqual(res["company"], "DataCorp")

    def test_fallback_does_not_invent_projects_or_certificates(self) -> None:
        sparse_text = "Experienced with Python and Git. Education: B.Tech in CSE."
        res = _fallback_parse_resume(sparse_text)

        self.assertEqual(res["projects"], [])
        self.assertEqual(res["certificates"], [])
        self.assertIn("Python", res["skills"])
        self.assertIn("Git", res["skills"])
        self.assertNotIn("AWS", res["skills"])

    def test_fallback_extracts_explicit_projects_and_certs_faithfully(self) -> None:
        resume_text = """
        John Doe
        CGPA: 8.7

        PROJECTS
        • SmartCampus - AI Placement Portal with React and FastAPI
        • SensorHub - IoT telemetry aggregator

        CERTIFICATIONS
        • AWS Certified Solutions Architect - Associate
        • Deep Learning Specialization by Coursera

        TECHNICAL SKILLS
        Python, TypeScript, React, Docker, Kubernetes, PostgreSQL
        """
        res = _fallback_parse_resume(resume_text)

        self.assertIn("SmartCampus", res["projects"])
        self.assertIn("SensorHub", res["projects"])
        self.assertEqual(len(res["projects"]), 2)

        self.assertTrue(any("AWS Certified" in c for c in res["certificates"]))
        self.assertTrue(any("Deep Learning" in c for c in res["certificates"]))
        self.assertEqual(len(res["certificates"]), 2)

        self.assertIn("Python", res["skills"])
        self.assertIn("Kubernetes", res["skills"])
        self.assertIn("PostgreSQL", res["skills"])
        self.assertEqual(res["cgpa"], 8.7)

    @patch("drives.extract_jd_pdf", return_value=("Company: Acme\nRole: Engineer", [], False))
    def test_drives_parse_pdf_route_exposes_fallback_when_gemini_fails(self, mock_extract) -> None:
        import asyncio
        from unittest.mock import AsyncMock

        file_mock = MagicMock(spec=UploadFile)
        file_mock.filename = "job_description.pdf"
        file_mock.read = AsyncMock(return_value=b"%PDF-1.4 test")

        with patch("drives.parse_jd", return_value={
            "company": "Acme",
            "role": "Engineer",
            "parsing_provider": "rule_based_fallback",
            "fallback_used": True,
            "fallback_reason": "Gemini provider calls failed across all keys; switched to rule-based fallback"
        }):
            recruiter_user = {"id": "rec_001", "role": "recruiter"}
            response = asyncio.run(parse_jd_pdf(file=file_mock, recruiter=recruiter_user))

        self.assertTrue(response["fallback_used"])
        self.assertEqual(response["parsing_provider"], "rule_based_fallback")
        self.assertTrue(any("switched to rule-based fallback" in w for w in response["warnings"]))

    @patch("students._student_records")
    def test_students_upload_resume_route_persists_and_returns_fallback_metadata(self, mock_records) -> None:
        import asyncio
        from unittest.mock import AsyncMock

        master = {"id": "m_1", "registration_number": "REG100", "cgpa": 8.0, "branch": "CSE"}
        profile = {"student_id": "m_1", "parsed_skills": [], "projects": [], "certificates": []}
        mock_records.return_value = (master, profile)

        file_mock = MagicMock(spec=UploadFile)
        file_mock.filename = "resume.txt"
        file_mock.read = AsyncMock(return_value=b"Python developer with SQL skills. Projects: SmartApp")

        with patch("students.parse_resume", return_value={
            "skills": ["Python", "SQL"],
            "projects": ["SmartApp"],
            "certificates": [],
            "cgpa": 8.0,
            "parsing_provider": "rule_based_fallback",
            "fallback_used": True,
            "fallback_reason": "Gemini API keys are not configured"
        }), \
        patch("students.find_one", return_value={"student_id": "m_1"}), \
        patch("students.update_one", return_value={
            "student_id": "m_1",
            "parsed_skills": ["Python", "SQL"],
            "projects": [{"title": "SmartApp"}],
            "certificates": [],
            "resume_parsing_provider": "rule_based_fallback",
            "resume_fallback_used": True,
        }), \
        patch("students.find_many", return_value=[]):
            user = {"id": "u_student", "registration_number": "REG100", "role": "student"}
            response = asyncio.run(upload_resume(file=file_mock, user=user))

        self.assertTrue(response["fallback_used"])
        self.assertEqual(response["parsing_provider"], "rule_based_fallback")
        self.assertEqual(response["fallback_reason"], "Gemini API keys are not configured")

    def test_no_api_keys_logged_on_failure(self) -> None:
        import sys
        secret_key = "AIzaSyDUMMY_SECRET_KEY_1234567890"

        captured_stdout = io.StringIO()
        with patch("ai_tools._get_api_keys", return_value=[secret_key]), \
             patch("ai_tools.ChatGoogleGenerativeAI", side_effect=Exception("Simulated error")), \
             patch("sys.stdout", captured_stdout):
            parse_resume("Resume with Python")

        log_output = captured_stdout.getvalue()
        # Verify no part of the secret key is in the log
        self.assertNotIn(secret_key, log_output)
        self.assertNotIn("AIzaSy", log_output)
        self.assertNotIn("1234567890", log_output)
        self.assertIn("Key #1 failed on parse_resume", log_output)


if __name__ == "__main__":
    unittest.main()
