from __future__ import annotations

from io import BytesIO
import unittest
from unittest.mock import patch

from bson import ObjectId
from fastapi import FastAPI
from fastapi.testclient import TestClient

from ai_tools import _fallback_parse_jd, _fallback_parse_jd_schedule
from auth import get_current_user
from db import store_drive_jd_file
import drives
from drives import DriveCreate, _schedule_conflicts, create_drive, extract_jd_pdf


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


class DriveScheduleConflictTests(unittest.TestCase):
    def setUp(self) -> None:
        self.other_drive = {
            'id': 'other-drive',
            'recruiter_id': 'other-recruiter',
            'status': 'open_for_optin',
            'company': 'Example Company',
            'role': 'Software Engineer',
            'date': '2026-11-18',
            'slot': '9:30 AM to 12:00 PM',
            'venue': 'Main Auditorium',
        }
        self.current_drive = {'id': 'current-drive', 'recruiter_id': 'current-recruiter'}

    def test_overlapping_time_at_same_venue_is_reported(self) -> None:
        with patch('drives.find_many', return_value=[self.other_drive]):
            conflicts = _schedule_conflicts(self.current_drive, {
                'date': '2026-11-18',
                'slot': '11:00 AM to 1:00 PM',
                'venue': 'Main Auditorium',
            })

        self.assertEqual(len(conflicts), 1)
        self.assertIn('Example Company', conflicts[0])

    def test_back_to_back_time_at_same_venue_is_allowed(self) -> None:
        with patch('drives.find_many', return_value=[self.other_drive]):
            conflicts = _schedule_conflicts(self.current_drive, {
                'date': '2026-11-18',
                'slot': '12:00 PM to 1:00 PM',
                'venue': 'Main Auditorium',
            })

        self.assertEqual(conflicts, [])


class OriginalJdPdfTests(unittest.TestCase):
    def test_json_drive_submission_uses_recruiter_route(self) -> None:
        app = FastAPI()
        app.include_router(drives.router)
        app.dependency_overrides[get_current_user] = lambda: {'id': 'recruiter-1', 'role': 'recruiter'}
        with patch('drives.insert_one') as insert:
            response = TestClient(app).post('/drives', json={
                'company': 'Example Corp',
                'role': 'Engineer',
                'jd': 'Build software',
                'required_skills': ['Python'],
                'min_cgpa': 7,
                'branches': ['CSE'],
                'max_backlogs': 0,
                'ctc': 8,
                'date': '',
                'slot': '',
                'venue': '',
            })

        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()['recruiter_id'], 'recruiter-1')
        insert.assert_called_once()

    def test_schedule_parser_returns_only_date_time_and_venue(self) -> None:
        result = _fallback_parse_jd_schedule(
            'Company | Example Corp\n'
            'Drive date | 18 November 2026\n'
            'Time slot | 9:30 AM - 5:00 PM\n'
            'Venue | Main Hall\n'
            'Minimum CGPA | 7.5\n'
            'Required skills | Python'
        )

        self.assertEqual(result, {
            'drive_date': '2026-11-18',
            'slot': '9:30 AM - 5:00 PM',
            'venue': 'Main Hall',
        })

    def test_gridfs_store_uses_stream_and_returns_file_id(self) -> None:
        file_id = ObjectId()
        with patch('db._drive_jd_bucket.upload_from_stream', return_value=file_id) as upload:
            result = store_drive_jd_file(b'%PDF-test', 'jd.pdf', {'content_type': 'application/pdf'})

        self.assertEqual(result, str(file_id))
        self.assertEqual(upload.call_args.args[0], 'jd.pdf')
        self.assertEqual(upload.call_args.args[1].read(), b'%PDF-test')

    def test_multipart_drive_submission_stores_the_original_pdf(self) -> None:
        app = FastAPI()
        app.include_router(drives.router)
        app.dependency_overrides[get_current_user] = lambda: {'id': 'recruiter-1', 'role': 'recruiter'}
        client = TestClient(app)
        fields = {
            'company': 'Example Corp',
            'role': 'Engineer',
            'jd': '',
            'required_skills': 'Python',
            'min_cgpa': '7',
            'branches': 'CSE',
            'max_backlogs': '0',
            'ctc': '8',
            'date': '',
            'slot': '',
            'venue': '',
        }
        with (
            patch('drives.store_drive_jd_file', return_value='gridfs-file-id') as store,
            patch('drives.insert_one', side_effect=lambda collection, document: document),
        ):
            response = client.post(
                '/drives/with-pdf',
                data=fields,
                files={'file': ('job-description.pdf', b'%PDF-test', 'application/pdf')},
            )

        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()['jd_source'], 'pdf')
        self.assertEqual(response.json()['jd_pdf_file_id'], 'gridfs-file-id')
        self.assertEqual(response.json()['jd'], '')
        store.assert_called_once_with(b'%PDF-test', 'job-description.pdf', {
            'content_type': 'application/pdf',
            'uploaded_by': 'recruiter-1',
        })

    def test_recruiter_cannot_fetch_admin_job_description_pdf(self) -> None:
        app = FastAPI()
        app.include_router(drives.router)
        app.dependency_overrides[get_current_user] = lambda: {'id': 'recruiter-1', 'role': 'recruiter'}

        response = TestClient(app).get('/admin/drives/drive-1/jd-pdf')

        self.assertEqual(response.status_code, 403)

    def test_pdf_parse_response_extracts_jd_requirements_and_schedule(self) -> None:
        app = FastAPI()
        app.include_router(drives.router)
        app.dependency_overrides[get_current_user] = lambda: {'id': 'recruiter-1', 'role': 'recruiter'}
        with (
            patch('drives.extract_jd_pdf', return_value=('Company | Example Corp', [], False)),
            patch('drives.parse_jd', return_value={
                'company': 'Example Corp',
                'role': 'Engineer',
                'required_skills': ['Python'],
                'branches': ['CSE'],
                'min_cgpa': 7.0,
                'max_backlogs': 0,
                'ctc': 10.0,
                'drive_date': '2026-11-18',
                'slot': '9:30 AM to 5 PM',
                'venue': 'Main Hall',
            }),
        ):
            response = TestClient(app).post(
                '/drives/parse-pdf',
                files={'file': ('job-description.pdf', b'%PDF-test', 'application/pdf')},
            )

        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()['extracted_data']['company'], 'Example Corp')
        self.assertEqual(response.json()['extracted_data']['drive_date'], '2026-11-18')
        self.assertIn('raw_text', response.json())

    def test_admin_receives_uploaded_pdf_inline(self) -> None:
        app = FastAPI()
        app.include_router(drives.router)
        app.dependency_overrides[get_current_user] = lambda: {'id': 'admin-1', 'role': 'admin'}
        drive = {'id': 'drive-1', 'jd_pdf_file_id': str(ObjectId()), 'jd_pdf_filename': 'original jd.pdf'}
        with (
            patch('drives.find_one', return_value=drive),
            patch('drives.open_drive_jd_file', return_value=BytesIO(b'%PDF-test')),
        ):
            response = TestClient(app).get('/admin/drives/drive-1/jd-pdf')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers['content-type'], 'application/pdf')
        self.assertIn("inline; filename*=UTF-8''original%20jd.pdf", response.headers['content-disposition'])
        self.assertEqual(response.content, b'%PDF-test')

    def test_multipart_drive_submission_with_minimal_fields_stores_drive(self) -> None:
        app = FastAPI()
        app.include_router(drives.router)
        app.dependency_overrides[get_current_user] = lambda: {'id': 'recruiter-1', 'role': 'recruiter', 'name': 'Acme Corp'}
        client = TestClient(app)
        with (
            patch('drives.store_drive_jd_file', return_value='gridfs-file-id'),
            patch('drives.insert_one', side_effect=lambda collection, document: document),
        ):
            response = client.post(
                '/drives/with-pdf',
                data={'date': '2026-11-20', 'slot': '10 AM - 4 PM', 'venue': 'Auditorium'},
                files={'file': ('job.pdf', b'%PDF-test', 'application/pdf')},
            )

        self.assertEqual(response.status_code, 200, response.text)
        res_data = response.json()
        self.assertEqual(res_data['company'], 'Acme Corp')
        self.assertEqual(res_data['date'], '2026-11-20')
        self.assertEqual(res_data['slot'], '10 AM - 4 PM')
        self.assertEqual(res_data['venue'], 'Auditorium')
        self.assertEqual(res_data['jd_source'], 'pdf')

    def test_admin_can_update_drive_details(self) -> None:
        app = FastAPI()
        app.include_router(drives.router)
        app.dependency_overrides[get_current_user] = lambda: {'id': 'admin-1', 'role': 'admin'}
        client = TestClient(app)
        existing_drive = {'id': 'drive-99', 'company': 'Acme Corp', 'role': 'Job Opening (From JD)', 'status': 'pending_admin_review'}
        with (
            patch('drives.find_one', return_value=existing_drive),
            patch('drives.update_one', return_value={**existing_drive, 'role': 'Senior SDE', 'min_cgpa': 7.5, 'ctc': 12.0}),
            patch('drives.log_action'),
        ):
            response = client.patch(
                '/admin/drives/drive-99',
                json={'role': 'Senior SDE', 'min_cgpa': 7.5, 'ctc': 12.0},
            )

        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()['role'], 'Senior SDE')
        self.assertEqual(response.json()['min_cgpa'], 7.5)
        self.assertEqual(response.json()['ctc'], 12.0)


if __name__ == '__main__':
    unittest.main()