# CampusLink Status Flow

## Drive

```text
pending_admin_review
        │ Gate 1 approve
        ▼
open_for_optin
        │ opt-in window closes / verification proceeds
        ▼
ranking_ready
        │ recruiter selects up to 50
        ▼
recruiter_selected
        │ Gate 3 + conflict check
        ▼
shortlist_published
```

Gate 1 may also move a drive to `drive_rejected`.

## Application

```text
opted_in
   │ Gate 2
   ├──────────────► rejected
   ▼
verified
   │ recruiter picks
   ▼
selected_by_recruiter
   │ Gate 3
   ▼
shortlisted
   ▼
offered
   ├──► accepted
   ├──► deferred
   └──► withdrawn
```

## Engine separation

- **Eligibility engine:** rules only; CGPA, branch, backlogs from master record.
- **Verification engine:** red/yellow/green evidence flags.
- **Ranking engine:** 40% skill match, 20% project/certification relevance, 25% assessment signal, 15% official CGPA.
