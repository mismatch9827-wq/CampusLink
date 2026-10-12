from __future__ import annotations

import unittest
from unittest.mock import MagicMock, patch
from fastapi import HTTPException

# Patch Mongo before importing modules
patch("pymongo.MongoClient").start()
patch("gridfs.GridFSBucket").start()

from offers import create_offer, list_offers, get_offer, update_offer, OfferCreate, OfferUpdate


class OfferHardeningTests(unittest.TestCase):
    def setUp(self) -> None:
        self.recruiter_a = {"id": "rec_a", "role": "recruiter", "email": "rec_a@corp.com"}
        self.recruiter_b = {"id": "rec_b", "role": "recruiter", "email": "rec_b@corp.com"}
        self.admin = {"id": "adm_1", "role": "admin", "email": "admin@campus.edu"}
        self.student_1_user = {"id": "usr_s1", "role": "student", "registration_number": "REG101"}
        self.student_2_user = {"id": "usr_s2", "role": "student", "registration_number": "REG102"}

        self.student_1_master = {"id": "mst_s1", "name": "Alice", "registration_number": "REG101"}
        self.student_2_master = {"id": "mst_s2", "name": "Bob", "registration_number": "REG102"}

        self.drive_a = {"id": "drv_a", "recruiter_id": "rec_a", "company": "Alpha Tech", "role": "SDE"}
        self.drive_b = {"id": "drv_b", "recruiter_id": "rec_b", "company": "Beta Corp", "role": "DevOps"}

        self.app_1 = {
            "id": "app_1",
            "drive_id": "drv_a",
            "student_id": "mst_s1",
            "status": "shortlisted",
        }
        self.app_2 = {
            "id": "app_2",
            "drive_id": "drv_b",
            "student_id": "mst_s2",
            "status": "shortlisted",
        }

        self.offer_1 = {
            "id": "o_1",
            "application_id": "app_1",
            "student_id": "mst_s1",
            "student_name": "Alice",
            "company": "Alpha Tech",
            "role": "SDE",
            "ctc": 12.0,
            "status": "offered",
            "documents": "0/4",
            "joining_status": "Awaiting acceptance",
        }

    # ---------------- 1. Creation & Ownership Tests ----------------
    @patch("offers.insert_one")
    @patch("offers.update_one")
    @patch("offers.log_action")
    @patch("offers.find_one")
    def test_owning_recruiter_can_create_offer(self, mock_find, mock_log, mock_upd, mock_ins) -> None:
        """Requirement 1: Owning recruiter can create offer for their drive's shortlisted application."""
        def lookup(coll, query):
            if coll == "applications": return self.app_1
            if coll == "drives": return self.drive_a
            if coll == "master_students": return self.student_1_master
            if coll == "offers": return None  # no duplicate
            return None
        mock_find.side_effect = lookup

        body = OfferCreate(application_id="app_1", ctc=12.5)
        offer = create_offer(body, user=self.recruiter_a)

        self.assertEqual(offer["company"], "Alpha Tech")
        self.assertEqual(offer["ctc"], 12.5)
        self.assertEqual(offer["status"], "offered")
        mock_ins.assert_called_once()
        mock_upd.assert_called_once_with("applications", {"id": "app_1"}, {"status": "offered"})

    @patch("offers.find_one")
    def test_unrelated_recruiter_cannot_create_offer(self, mock_find) -> None:
        """Requirement 1: Unrelated recruiter B cannot create offer for drive A."""
        def lookup(coll, query):
            if coll == "applications": return self.app_1
            if coll == "drives": return self.drive_a
            if coll == "master_students": return self.student_1_master
            if coll == "offers": return None
            return None
        mock_find.side_effect = lookup

        body = OfferCreate(application_id="app_1", ctc=12.5)
        with self.assertRaises(HTTPException) as ctx:
            create_offer(body, user=self.recruiter_b)
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertIn("own drives", ctx.exception.detail)

    @patch("offers.insert_one")
    @patch("offers.update_one")
    @patch("offers.log_action")
    @patch("offers.find_one")
    def test_admin_can_create_offer_across_drives(self, mock_find, mock_log, mock_upd, mock_ins) -> None:
        """Requirement 2: Admin can manage offers across drives."""
        def lookup(coll, query):
            if coll == "applications": return self.app_1
            if coll == "drives": return self.drive_a
            if coll == "master_students": return self.student_1_master
            if coll == "offers": return None
            return None
        mock_find.side_effect = lookup

        body = OfferCreate(application_id="app_1", ctc=14.0)
        offer = create_offer(body, user=self.admin)
        self.assertEqual(offer["status"], "offered")
        mock_ins.assert_called_once()

    # ---------------- 2. Validation & Duplicate Tests ----------------
    def test_negative_ctc_rejected(self) -> None:
        """Requirement 5: Negative CTC is rejected."""
        body = OfferCreate(application_id="app_1", ctc=-5.0)
        with self.assertRaises(HTTPException) as ctx:
            create_offer(body, user=self.recruiter_a)
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("non-negative", ctx.exception.detail)

    @patch("offers.find_one")
    def test_duplicate_offer_rejected(self, mock_find) -> None:
        """Requirement 5: Duplicate offer for the same application is rejected."""
        def lookup(coll, query):
            if coll == "applications": return self.app_1
            if coll == "offers": return self.offer_1  # offer already exists
            return None
        mock_find.side_effect = lookup

        body = OfferCreate(application_id="app_1", ctc=12.0)
        with self.assertRaises(HTTPException) as ctx:
            create_offer(body, user=self.recruiter_a)
        self.assertEqual(ctx.exception.status_code, 409)
        self.assertIn("already exists", ctx.exception.detail)

    @patch("offers.find_one")
    def test_non_shortlisted_app_rejected(self, mock_find) -> None:
        """Offer can only be created for shortlisted applications."""
        unshortlisted = {**self.app_1, "status": "opted_in"}
        mock_find.side_effect = lambda coll, q: unshortlisted if coll == "applications" else None

        body = OfferCreate(application_id="app_1", ctc=10.0)
        with self.assertRaises(HTTPException) as ctx:
            create_offer(body, user=self.recruiter_a)
        self.assertEqual(ctx.exception.status_code, 409)

    # ---------------- 3. View Access Control ----------------
    @patch("offers.find_one")
    def test_student_view_own_offer_success(self, mock_find) -> None:
        """Requirement 3: Student can view their own offer."""
        def lookup(coll, query):
            if coll == "offers": return self.offer_1
            if coll == "master_students": return self.student_1_master
            return None
        mock_find.side_effect = lookup

        res = get_offer("o_1", user=self.student_1_user)
        self.assertEqual(res["id"], "o_1")

    @patch("offers.find_one")
    def test_student_cannot_view_another_student_offer(self, mock_find) -> None:
        """Requirement 3 & 4: Student 2 cannot view Student 1's offer."""
        def lookup(coll, query):
            if coll == "offers": return self.offer_1
            if coll == "master_students": return self.student_2_master  # student 2
            return None
        mock_find.side_effect = lookup

        with self.assertRaises(HTTPException) as ctx:
            get_offer("o_1", user=self.student_2_user)
        self.assertEqual(ctx.exception.status_code, 403)

    @patch("offers.find_one")
    def test_unrelated_recruiter_cannot_view_offer(self, mock_find) -> None:
        """Requirement 4: Recruiter B cannot view offer in Drive A."""
        def lookup(coll, query):
            if coll == "offers": return self.offer_1
            if coll == "applications": return self.app_1
            if coll == "drives": return self.drive_a
            return None
        mock_find.side_effect = lookup

        with self.assertRaises(HTTPException) as ctx:
            get_offer("o_1", user=self.recruiter_b)
        self.assertEqual(ctx.exception.status_code, 403)

    @patch("offers.find_many")
    @patch("offers.find_one")
    def test_list_offers_filters_by_role_ownership(self, mock_find_one, mock_find_many) -> None:
        """Offers list returns only owned drives for recruiter and student's own for student."""
        all_offers = [self.offer_1, {"id": "o_2", "student_id": "mst_s2", "application_id": "app_2"}]
        mock_find_many.side_effect = lambda coll, q=None: all_offers if coll == "offers" else (
            [self.drive_b] if coll == "drives" else [{"id": "app_2", "drive_id": "drv_b"}]
        )
        mock_find_one.return_value = self.student_1_master

        # Student 1 sees only offer 1
        s1_offers = list_offers(user=self.student_1_user)
        self.assertEqual(len(s1_offers), 1)
        self.assertEqual(s1_offers[0]["id"], "o_1")

        # Recruiter B sees only offer 2
        rec_b_offers = list_offers(user=self.recruiter_b)
        self.assertEqual(len(rec_b_offers), 1)
        self.assertEqual(rec_b_offers[0]["id"], "o_2")

    # ---------------- 4. Student Response & Transitions ----------------
    @patch("offers.update_one")
    @patch("offers.log_action")
    @patch("offers.find_one")
    def test_student_valid_acceptance_transition(self, mock_find, mock_log, mock_upd) -> None:
        """Requirement 3 & 6: Student accepts offer: offered -> accepted."""
        def lookup(coll, query):
            if coll == "offers": return {**self.offer_1, "status": "offered"}
            if coll == "applications": return self.app_1
            if coll == "drives": return self.drive_a
            if coll == "master_students": return self.student_1_master
            return None
        mock_find.side_effect = lookup

        body = OfferUpdate(status="accepted")
        update_offer("o_1", body, user=self.student_1_user)

        # Check update called with accepted and auto-aligned joining status
        mock_upd.assert_any_call("offers", {"id": "o_1"}, {"status": "accepted", "joining_status": "Offer accepted"})
        mock_upd.assert_any_call("applications", {"id": "app_1"}, {"status": "accepted"})

    @patch("offers.update_one")
    @patch("offers.log_action")
    @patch("offers.find_one")
    def test_student_valid_deferral_transition(self, mock_find, mock_log, mock_upd) -> None:
        """Requirement 3 & 6: Student defers offer: offered -> deferred."""
        def lookup(coll, query):
            if coll == "offers": return {**self.offer_1, "status": "offered"}
            if coll == "applications": return self.app_1
            if coll == "drives": return self.drive_a
            if coll == "master_students": return self.student_1_master
            return None
        mock_find.side_effect = lookup

        body = OfferUpdate(status="deferred")
        update_offer("o_1", body, user=self.student_1_user)

        mock_upd.assert_any_call("offers", {"id": "o_1"}, {"status": "deferred", "joining_status": "Deferred by student"})

    @patch("offers.find_one")
    def test_student_invalid_transition_rejected(self, mock_find) -> None:
        """Requirement 6: Student cannot revert accepted -> offered, or set withdrawn."""
        def lookup(coll, query):
            if coll == "offers": return {**self.offer_1, "status": "accepted"}
            if coll == "applications": return self.app_1
            if coll == "drives": return self.drive_a
            if coll == "master_students": return self.student_1_master
            return None
        mock_find.side_effect = lookup

        # Attempt to revert accepted -> offered
        with self.assertRaises(HTTPException) as ctx1:
            update_offer("o_1", OfferUpdate(status="offered"), user=self.student_1_user)
        self.assertEqual(ctx1.exception.status_code, 400)
        self.assertIn("Invalid transition", ctx1.exception.detail)

        # Attempt to set withdrawn
        with self.assertRaises(HTTPException) as ctx2:
            update_offer("o_1", OfferUpdate(status="withdrawn"), user=self.student_1_user)
        self.assertEqual(ctx2.exception.status_code, 400)

    @patch("offers.find_one")
    def test_student_forbidden_fields_rejected(self, mock_find) -> None:
        """Requirement 3 & 4: Student cannot edit documents, joining status, or CTC."""
        def lookup(coll, query):
            if coll == "offers": return self.offer_1
            if coll == "applications": return self.app_1
            if coll == "drives": return self.drive_a
            if coll == "master_students": return self.student_1_master
            return None
        mock_find.side_effect = lookup

        body = OfferUpdate(status="accepted", documents="4/4", joining_status="Joined")
        with self.assertRaises(HTTPException) as ctx:
            update_offer("o_1", body, user=self.student_1_user)
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertIn("not permitted to edit documents, joining_status", ctx.exception.detail)

    @patch("offers.find_one")
    def test_another_student_cannot_update_offer(self, mock_find) -> None:
        """Requirement 4: Another student cannot respond to Alice's offer."""
        def lookup(coll, query):
            if coll == "offers": return self.offer_1
            if coll == "applications": return self.app_1
            if coll == "drives": return self.drive_a
            if coll == "master_students": return self.student_2_master
            return None
        mock_find.side_effect = lookup

        with self.assertRaises(HTTPException) as ctx:
            update_offer("o_1", OfferUpdate(status="accepted"), user=self.student_2_user)
        self.assertEqual(ctx.exception.status_code, 403)

    # ---------------- 5. Recruiter & Admin Updates ----------------
    @patch("offers.update_one")
    @patch("offers.log_action")
    @patch("offers.find_one")
    def test_owning_recruiter_can_update_documents_and_joining(self, mock_find, mock_log, mock_upd) -> None:
        """Requirement 1: Owning recruiter can update document progress and joining status."""
        def lookup(coll, query):
            if coll == "offers": return self.offer_1
            if coll == "applications": return self.app_1
            if coll == "drives": return self.drive_a
            return None
        mock_find.side_effect = lookup

        body = OfferUpdate(documents="2/4", joining_status="Documents submitted")
        update_offer("o_1", body, user=self.recruiter_a)

        mock_upd.assert_called_once_with("offers", {"id": "o_1"}, {"documents": "2/4", "joining_status": "Documents submitted"})

    @patch("offers.find_one")
    def test_unrelated_recruiter_cannot_update_offer(self, mock_find) -> None:
        """Requirement 1 & 4: Unrelated recruiter B cannot update Recruiter A's offer."""
        def lookup(coll, query):
            if coll == "offers": return self.offer_1
            if coll == "applications": return self.app_1
            if coll == "drives": return self.drive_a
            return None
        mock_find.side_effect = lookup

        body = OfferUpdate(documents="4/4")
        with self.assertRaises(HTTPException) as ctx:
            update_offer("o_1", body, user=self.recruiter_b)
        self.assertEqual(ctx.exception.status_code, 403)

    @patch("offers.update_one")
    @patch("offers.log_action")
    @patch("offers.find_one")
    def test_admin_can_update_offer_across_drives(self, mock_find, mock_log, mock_upd) -> None:
        """Requirement 2: Admin can update offer across drives."""
        def lookup(coll, query):
            if coll == "offers": return self.offer_1
            if coll == "applications": return self.app_1
            if coll == "drives": return self.drive_a
            return None
        mock_find.side_effect = lookup

        body = OfferUpdate(status="withdrawn")
        update_offer("o_1", body, user=self.admin)
        mock_upd.assert_any_call("offers", {"id": "o_1"}, {"status": "withdrawn", "joining_status": "Offer withdrawn"})


if __name__ == "__main__":
    unittest.main()
