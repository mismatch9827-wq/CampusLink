# CAMPUSLINK — Inter-College Hackathon Prototype

AI-powered Campus-to-Corporate Placement Management & Analytics Platform.

This version is rebuilt around the supplied CampusLink roadmap and the requested Next.js/FastAPI folder structure. The workflow is deliberately status-driven: a recruiter job moves through **Gate 1**, student applications move through **Gate 2**, and recruiter selections move through **Gate 3** before a shortlist is published.

## What changed from the earlier prototype

- Frontend migrated from Vite/React JSX to **Next.js App Router + TypeScript**.
- Frontend routes now match the requested student/recruiter/admin structure.
- Backend changed to the requested **flat FastAPI module layout**.
- Backend requires MongoDB and fails at startup if it cannot connect.
- Added login + role checks.
- Added official `master_students` records and locked academic fields.
- Added the exact drive/application status flow from the roadmap.
- Added three admin gates:
  - Gate 1: recruiter drive approval.
  - Gate 2: application verification with red/yellow/green flags.
  - Gate 3: shortlist approval + conflict detection.
- Matching score uses the roadmap weights:
  - Skill match: 40
  - Projects + certifications: 20
  - Mock interview + aptitude: 25
  - Official CGPA: 15
- Added student eligibility explanations and opt-in.
- Added recruiter ranked list and top-50 selection.
- Added offer/document/joining tracking.
- Added admin analytics and at-risk signals.
- Added student eligibility assistant.
- UI uses live API records, empty states, and visible request errors without sample data.

---

## Folder structure

```text
CAMPUSLINK_InterCollege_Hackathon/
│
├── frontend/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx                    # login
│   │   ├── student/
│   │   │   ├── page.tsx                # readiness + status
│   │   │   ├── drives/page.tsx         # eligible drives + opt-in
│   │   │   └── chatbot/page.tsx        # eligibility assistant
│   │   ├── recruiter/
│   │   │   ├── page.tsx                # my drives
│   │   │   ├── new-drive/page.tsx      # post a job
│   │   │   └── drives/[id]/page.tsx    # ranked list + top 50
│   │   └── admin/
│   │       ├── page.tsx                # analytics dashboard
│   │       ├── drives/page.tsx         # Gate 1 + scheduling details
│   │       ├── verification/page.tsx   # Gate 2 + flags
│   │       ├── shortlists/page.tsx     # Gate 3 + conflicts
│   │       └── offers/page.tsx         # offers + joining
│   │
│   ├── components/
│   │   ├── ui/
│   │   ├── StatusBadge.tsx
│   │   ├── DriveCard.tsx
│   │   ├── FlagList.tsx
│   │   ├── FitScoreCard.tsx
│   │   ├── GateStepper.tsx
│   │   └── DashboardShell.tsx
│   │
│   └── lib/
│       ├── api.ts
│       ├── types.ts
│       └── auth.ts
│
├── backend/
│   ├── main.py
│   ├── db.py
│   ├── auth.py
│   ├── students.py
│   ├── drives.py
│   ├── verification.py
│   ├── ranking.py
│   ├── scheduling.py
│   ├── offers.py
│   ├── analytics.py
│   ├── notifications.py
│   ├── create_user.py
│   └── requirements.txt
│
└── docs/
    ├── CampusLink Build Roadmap.html
    ├── ARCHITECTURE.md
    └── STATUS_FLOW.md
```

---

# 1. Run the backend

```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Optional: copy `.env.example` to `.env` and set MongoDB.

```env
MONGO_URI=mongodb://localhost:27017
MONGO_DB=campuslink
JWT_SECRET=replace-with-a-long-random-secret
FRONTEND_ORIGIN=http://localhost:3000
```

MongoDB must be running before the API starts. The backend does not seed users or placement records. Create the first placement-cell account either from the Placement Cell tab's one-time Create account option or with this command:

```powershell
python create_user.py
```

Start API:

```powershell
uvicorn main:app --reload
```

Open:

- API: `http://127.0.0.1:8000`
- Swagger: `http://127.0.0.1:8000/docs`

---

# 2. Run the frontend

Open a second terminal:

```powershell
cd frontend
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

Students must create an account after the placement cell uploads their roster record. Recruiters can create their own account from the Recruiter tab. The first placement-cell account can be created once from the Placement Cell tab; additional staff accounts can be provisioned with `create_user.py`.

JD PDF upload extracts selectable text and tables. Scanned-page OCR is optional and requires Tesseract OCR and Poppler installed on the machine and available on `PATH`. If either is unavailable, the API returns a warning and recruiters can enter the missing requirements manually. Extracted values must be reviewed in the form before submission. Configure `GEMINI_API_KEY` in the backend `.env` to enable Gemini parsing; without it, the rule-based parser is used and its results still require review.

For a clean test, create the real placement-cell and recruiter accounts, upload the college roster, post jobs from the recruiter account, then log in with each student's registration number and upload that student's resume. Empty pages mean there are no records yet; API errors are shown rather than replaced with sample data.

---

# Data note

Eligibility and analytics use records currently stored in MongoDB. Upload accurate, authorized college data before evaluating those results.
