from __future__ import annotations

import unittest
from unittest.mock import patch

from ai_tools import _fallback_parse_jd
from drives import DriveCreate, create_drive, extract_jd_pdf


class FakePage:
    def __init__(self, text: str, tables: list[list[list[str | None]]] | None = None):
        self.text = text
        self.tables = tables or []

    def extract_text(self, layout: bool = False) -> str:
        return self.text

    def extract_tables(self) -> list[list[list[str | None]]]:
        return self.tables


class FakePdf:
    def __init__(self, pages: list[FakePage]):
        self.pages = pages

    def __enter__(self) -> FakePdf:
        return self

    def __exit__(self, *args: object) -> None:
        return None


class JobDescriptionExtractionTests(unittest.TestCase):
    def test_extracts_table_rows_with_page_text(self) -> None:
        page = FakePage(
            'Software Engineer responsibilities include building web services and APIs.',
            [[['Requirement', 'Criteria'], ['Minimum CGPA', '7.5'], ['Branches', 'CSE | ECE']]],
        )
        with patch('drives.pdfplumber.open', return_value=FakePdf([page])):
            text, warnings, ocr_used = extract_jd_pdf(b'%PDF-test', enable_ocr=False)

        self.assertIn('Software Engineer', text)
        self.assertIn('Minimum CGPA | 7.5', text)
        self.assertEqual(warnings, [])
        self.assertFalse(ocr_used)

    def test_pdf_table_pipeline_extracts_company_and_drive_logistics(self) -> None:
        page = FakePage(
            'Campus recruitment drive job description and responsibilities for new graduates.',
            [[
                ['Company', 'NexaWave Technologies Pvt. Ltd.'],
                ['Role', 'Software Development Engineer Trainee'],
                ['CTC (LPA)', '12 LPA'],
                ['Drive date', '18 November 2026'],
                ['Time slot', '9:30 AM - 5:00 PM'],
                ['Venue', 'Main Campus Seminar Hall'],
            ]],
        )
        with patch('drives.pdfplumber.open', return_value=FakePdf([page])):
            text, warnings, _ = extract_jd_pdf(b'%PDF-table-test', enable_ocr=False)
        parsed = _fallback_parse_jd(text)

        self.assertEqual(warnings, [])
        self.assertEqual(parsed['company'], 'NexaWave Technologies Pvt. Ltd.')
        self.assertEqual(parsed['role'], 'Software Development Engineer Trainee')
        self.assertEqual(parsed['ctc'], 12.0)
        self.assertEqual(parsed['drive_date'], '2026-11-18')
        self.assertEqual(parsed['slot'], '9:30 AM - 5:00 PM')
        self.assertEqual(parsed['venue'], 'Main Campus Seminar Hall')

    def test_fallback_does_not_invent_missing_cutoffs(self) -> None:
        parsed = _fallback_parse_jd('Our software engineers work with Python and SQL.')

        self.assertIsNone(parsed['role'])
        self.assertEqual(parsed['branches'], [])
        self.assertIsNone(parsed['min_cgpa'])
        self.assertIsNone(parsed['max_backlogs'])

    def test_fallback_reads_pipe_delimited_table_criteria(self) -> None:
        parsed = _fallback_parse_jd(
            'Company | NexaWave Technologies Pvt. Ltd.\n'
            'Role | Software Development Engineer (SDE) Trainee\n'
            'Minimum CGPA | 7.5\n'
            'Max backlogs | 0 (no active backlogs allowed)\n'
            'CTC (LPA) | 12 LPA (Fixed 10 LPA + 2 LPA joining and performance bonus)\n'
            'Drive date | 18 November 2026\n'
            'Time slot | 9:30 AM - 5:00 PM\n'
            'Venue | Training & Placement Cell, Seminar Hall, Main Campus\n'
            'Eligible branches | CSE, IT, ECE, EEE\n'
            'Required skills | Python or Java, SQL / MongoDB, REST APIs, Git'
        )

        self.assertEqual(parsed['company'], 'NexaWave Technologies Pvt. Ltd.')
        self.assertEqual(parsed['role'], 'Software Development Engineer (SDE) Trainee')
        self.assertEqual(parsed['min_cgpa'], 7.5)
        self.assertEqual(parsed['max_backlogs'], 0)
        self.assertIn('CSE', parsed['branches'])
        self.assertEqual(parsed['ctc'], 12.0)
        self.assertEqual(parsed['drive_date'], '2026-11-18')
        self.assertEqual(parsed['slot'], '9:30 AM - 5:00 PM')
        self.assertEqual(parsed['venue'], 'Training & Placement Cell, Seminar Hall, Main Campus')
        self.assertIn('Python', parsed['required_skills'])

    def test_missing_ocr_binary_returns_warning_not_exception(self) -> None:
        page = FakePage('')
        with (
            patch('drives.pdfplumber.open', return_value=FakePdf([page])),
            patch('pdf2image.convert_from_bytes', side_effect=OSError('Poppler is unavailable')),
        ):
            text, warnings, ocr_used = extract_jd_pdf(b'%PDF-scanned', enable_ocr=True)

        self.assertEqual(text, '--- PAGE 1 ---')
        self.assertTrue(any('OCR is unavailable' in warning for warning in warnings))
        self.assertFalse(ocr_used)

    def test_drive_creation_keeps_recruiter_reviewed_requirements(self) -> None:
        body = DriveCreate(
            company='Reviewed Company',
            role='Reviewed Role',
            jd='Role: Different Role. Minimum CGPA: 6.5',
            required_skills=['Reviewed Skill'],
            min_cgpa=8.0,
            branches=['ECE'],
            max_backlogs=1,
            ctc=10.0,
            date='2026-11-01',
            slot='10:00-11:00',
            venue='Hall A',
        )
        with patch('drives.insert_one') as insert:
            saved = create_drive(body, {'id': 'test-recruiter'})

        insert.assert_called_once()
        self.assertEqual(saved['role'], 'Reviewed Role')
        self.assertEqual(saved['required_skills'], ['Reviewed Skill'])
        self.assertEqual(saved['min_cgpa'], 8.0)
        self.assertEqual(saved['branches'], ['ECE'])
        self.assertEqual(saved['max_backlogs'], 1)


if __name__ == '__main__':
    unittest.main()