# CampusLink Architecture

```text
                         CAMPUSLINK
                              │
           ┌──────────────────┼──────────────────┐
           │                  │                  │
        STUDENT            RECRUITER          ADMIN
           │                  │                  │
           └──────────────────┼──────────────────┘
                              │
                     NEXT.JS APP ROUTER
                              │
                        lib/api.ts
                              │
                              ▼
                        FASTAPI API
                              │
       ┌───────────────┬──────┼──────┬────────────────┐
       ▼               ▼      ▼      ▼                ▼
     auth.py       students  drives verification   ranking
                                   │                │
                                   └──────┬─────────┘
                                          ▼
                                      scheduling
                                          │
                                    offers / analytics
                                          │
                                          ▼
                                   MongoDB
                                          │
        users · master_students · students · drives · applications
                offers · notifications · audit_log
```

## Core principle

Academic eligibility always reads from `master_students`, which is placement-cell controlled. Student-entered profile data is used for skills, projects and evidence, not for changing official CGPA/branch/backlog eligibility.
