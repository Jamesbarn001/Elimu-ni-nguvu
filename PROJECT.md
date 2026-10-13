# Project: Elingu Full-Stack Hardening & Synchronization

## Architecture
The Elingu platform is an enterprise-grade EdTech system supporting Kenyan Competency-Based Education (CBE) and Cambridge IGCSE curricula across three core user portals: **Student**, **Teacher**, and **Parent**, governed by a **Super Admin Watchtower**.

```
                           ┌──────────────────────────────┐
                           │      Client Entrypoints      │
                           │  - Student SPA (index.html)  │
                           │  - Teacher Portal (routes)   │
                           │  - Parent Portal (server.js) │
                           │  - Super Admin Dashboard     │
                           └──────────────┬───────────────┘
                                          │ HTTPS / Signed Session Tokens
                                          ▼
                           ┌──────────────────────────────┐
                           │      Hardened API Layer      │
                           │ - Strict Rate Limiting       │
                           │ - Defensive Parameter Parser │
                           │ - Anti-Brute-Force & Lockout │
                           │ - RBAC & Multi-Tenant Gates  │
                           └──────────────┬───────────────┘
                                          │
                   ┌──────────────────────┴──────────────────────┐
                   ▼                                             ▼
       ┌───────────────────────┐                     ┌───────────────────────┐
       │ Core Business Engines │                     │ Disaster Recovery &   │
       │ - Socratic AI Engine  │                     │ Backup Engine         │
       │ - Teacher Live Sync   │                     │ - Pre-write Snapshots │
       │ - Stream Join Codes   │                     │ - SHA-256 Checksums   │
       │ - KDPA PII Masking    │                     │ - Exhaust Isolation   │
       └───────────┬───────────┘                     └───────────┬───────────┘
                   │                                             │
                   └──────────────────────┬──────────────────────┘
                                          ▼
                           ┌──────────────────────────────┐
                           │  Unified Persistence Layer   │
                           │ - Async PostgreSQL Client   │
                           │ - Relational Tables (Schema) │
                           │ - JSON-to-SQL Reconciliation │
                           │ - ACID Transaction Bounds   │
                           └──────────────────────────────┘
```

- **Staging Plane Isolation**: All structural refactorings and migrations are executed on staging branch `feature/secure-sync`.
- **Containment Plane**: All diagnostic logs, test run results, architecture traces, and immutable backups reside strictly in `docs/teamwork_exhaust/`.
- **Security Boundary**: Zero child PII exposure per Kenya Data Protection Act 2019 (KDPA); cryptographic session tokens replace unauthenticated IDs; no credentials in URLs; XSS vectors eradicated.

---

## Feature Inventory
Every feature identified during the comprehensive Phase 0 survey is mapped to an assigned milestone:

| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Staging Git Plane | Creation and maintenance of `feature/secure-sync` git branch | M1 | Survey (Database/R5) |
| 2 | Exhaust Containment | Isolation of all diagnostic, benchmark, and exhaust files inside `docs/teamwork_exhaust/` | M1 | Survey (Database/R4) |
| 3 | Automated Snapshot Backups | Immutable pre-write and pre-migration JSON/SQL snapshots with SHA-256 verification in `docs/teamwork_exhaust/backups/` | M1 | Survey (Database/R3) |
| 4 | Relational PostgreSQL Migration | Creation of relational tables (`schools`, `teachers`, `students`, `missions`, `sessions`, `parents`) in Neon PostgreSQL | M1 | Survey (Database/R3) |
| 5 | Async Database Adapter Unification | Elimination of `querySync` in PostgreSQL mode and removal of silent error swallowing in `syncDb` | M1 | Survey (Database/R3) |
| 6 | JSON-to-SQL Data Reconciliation | Bidirectional consistency verification between `data/*.json` and PostgreSQL tables | M1 | Survey (Database/R3) |
| 7 | Secret & Credential Hardening | Removal of hardcoded `SESSION_SECRET`, `ADMIN_TOKEN_SECRET`, and default admin password leakage in `adminStore.js` | M2 | Survey (Backend/R2) |
| 8 | KDPA 2019 Child PII Defense | Authentication gating and PII masking on `GET /api/students/profiles` (zero unauthenticated phone/email leaks) | M2 | Survey (Frontend/Backend/KDPA) |
| 9 | Student Cryptographic Session Tokens | Issuance and validation of signed tokens/JWTs for Socratic chat, profile updates, and session persistence | M2 | Survey (Backend/R2) |
| 10 | Parent Session Authentication | Replacement of cleartext `familyPassword` GET parameters with signed session token headers | M2 | Survey (Backend/Frontend/R1) |
| 11 | School Admin Code Protection | Authentication check on `GET /api/school/:schoolId` to prevent unauthenticated access to school `admin_code` | M2 | Survey (Database/R2) |
| 12 | Backend TypeError Remediation | Fix `parentStore.findParentByEmail` -> `getParentByEmail` in `server.js` | M2 | Survey (Backend/R2) |
| 13 | Anti-Brute-Force & Lockout Windows | Strict enforcement of login attempt caps, OTP cooldowns, and progressive lockout delays | M2 | Survey (SpecMiner/R2) |
| 14 | Stream Join Code Validation | Strict validation of stream join codes against active database streams with zero acceptance of invalid codes | M3 | Survey (Backend/AC) |
| 15 | Real-Time Teacher Mission Sync | Synchronized pipeline for teacher mission creation, broadcast, student reception, and live analytics tracking | M3 | Survey (Backend/AC) |
| 16 | Student Quiz & Progress Pipeline | Atomic recording of student quiz answers, score calculations, points award, and live stream updates | M3 | Survey (Backend/R2) |
| 17 | Parent Socratic Insight Sync | Real-time calculation and synchronization of Socratic Depth, Persistence, and Independence metrics | M3 | Survey (SpecMiner/R2) |
| 18 | Student PIN Reset Crash Fix | Elimination of nonexistent `setActiveLearner` and `saveLearnerSession` calls in `public/index.html` | M4 | Survey (Frontend/R1) |
| 19 | Socratic Chat Stored XSS Eradication | Contextual sanitization and safe DOM parsing for SVG rendering in `formatMessageText` | M4 | Survey (Frontend/R1) |
| 20 | Teacher Dashboard Cross-Portal XSS Defense | Strict HTML entity escaping for student quiz answers (`att.answer`) in `teacherRoutes.js` process trails | M4 | Survey (Frontend/R1) |
| 21 | Frictionless UI State Management | Zero layout shifts, elimination of hanging spinners, clear visual feedback across all three portals | M4 | Survey (Frontend/R1) |
| 22 | Automated E2E Test Suite (Tiers 1-4) | Comprehensive 4-tier test runner executing over 140 feature, boundary, cross-portal, and real-world scenarios | M5 | Survey (SpecMiner/R5) |
| 23 | Adversarial Coverage Hardening (Tier 5) | Adversarial stress testing, pen-testing exploit simulations, and Forensic Integrity Audit verification | M5 | Survey (Project/Pattern) |

---

## Milestones

| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Staging Isolation, Containment & Disaster Recovery Engine | Branch `feature/secure-sync`, `docs/teamwork_exhaust/backups/`, immutable snapshot backup engine, PostgreSQL schema migration, async DB adapter unification | None | IN_PROGRESS |
| M2 | Backend Security, KDPA 2019 Hardening & Session Authentication | Secret hardening, child PII protection, student/parent signed session tokens, admin code gating, error fixes | M1 | PLANNED |
| M3 | Real-Time Synchronization & Stream Code Integrity | Strict stream join code DB validation, teacher mission push & live tracking, quiz submission pipeline, Socratic insight sync | M1, M2 | PLANNED |
| M4 | Frontend Hardening & Crisp User Experience | Student PIN reset fix, SVG chat XSS eradication, Teacher dashboard XSS fix, parent auth header refactor, zero hanging spinners | M2, M3 | PLANNED |
| M5 | E2E Integration Verification Suite (Tiers 1-4) & Adversarial Hardening (Tier 5) | Dual-Track test suite execution, 100% pass of Tiers 1-4, publication of `TEST_READY.md`, Tier 5 adversarial stress testing, Forensic Integrity Audit | M1, M2, M3, M4 | PLANNED |

---

## Interface Contracts

### M1 ↔ M2, M3: Database Client & Backup Interface
- `db/client.js`:
  - `async query(sqlText, params)`: Returns `Promise<{ rows, rowCount }>`. Standardized across PostgreSQL and SQLite.
  - `async transaction(async (tx) => { ... })`: Guarantees atomic commit or rollback.
- `db/backupEngine.js` (inside `docs/teamwork_exhaust/` integration or core helper):
  - `async createSnapshot(contextTag)`: Creates immutable snapshot of all JSON stores and PostgreSQL tables in `docs/teamwork_exhaust/backups/<timestamp>_<tag>/`, generates SHA-256 checksum manifest `checksums.json`, returns `{ backupDir, checksum, timestamp }`.

### M2 ↔ M4: Authentication & Token Contract
- `authUtils.js`:
  - `generateStudentSessionToken(studentId, schoolId)`: Returns signed HMAC/JWT token with 24h TTL.
  - `verifyStudentSessionToken(token)`: Returns `{ valid: boolean, studentId, schoolId, error }`.
  - `generateParentSessionToken(parentId, email)`: Returns signed token with 24h TTL.
  - `verifyParentSessionToken(token)`: Returns `{ valid: boolean, parentId, email, error }`.
- Request headers:
  - `Authorization: Bearer <token>` required for `/api/chat`, `/api/students/profile`, `/api/parent/dashboard`, etc.
  - Client sends bearer token in `fetch()` headers instead of plaintext credentials in URL query strings.

### M3 ↔ M4: Stream Join Code & Real-Time Mission Pipeline
- `POST /api/students/join-stream`:
  - Input: `{ streamJoinCode: string }`
  - Validation: Queries database `schools` and `streams` table asynchronously. Must match an active stream in the student's assigned school. Returns `400` with descriptive error if invalid; returns `{ success: true, stream, schoolName }` on success. Zero phantom joins.
- `GET /api/mission/:missionId/analytics`:
  - Returns `{ missionId, totalAssigned, submittedCount, averageScore, processTrails: [...] }`.
  - Trails contain properly sanitized answers and timestamps.

---

## Code Layout
```
d:\Local Disk\Projects\Elingu\elingu-starter\elingu-starter\
├── .agents/teamwork/             # Agent coordination metadata ONLY
│   ├── orchestrator/             # Orchestrator state (BRIEFING, progress, DISPATCH)
│   ├── m1_database_security/     # Milestone 1 specialist workspace
│   ├── m2_backend_security/      # Milestone 2 specialist workspace
│   ├── m3_realtime_sync/         # Milestone 3 specialist workspace
│   ├── m4_frontend_hardening/    # Milestone 4 specialist workspace
│   └── m5_e2e_testing/           # Milestone 5 test writer & audit workspace
├── docs/
│   └── teamwork_exhaust/         # STRICT containment for all diagnostics, logs, and backups
│       ├── backups/              # Automated immutable pre-write snapshots
│       ├── reports/              # Architectural & audit exhaust
│       └── tests/                # Test run artifacts
├── db/                           # Relational persistence & migrations
│   ├── client.js                 # Unified async database client
│   ├── schema.sql                # PostgreSQL 6-table relational schema
│   ├── migrate.js                # Migration runner
│   ├── inspect.js                # Database inspector
│   └── repositories/             # Relational table repositories
├── public/                       # Student client interface SPA
│   └── index.html                # Single-page application
├── tests/                        # E2E test suite (Tiers 1-4 & Tier 5)
│   ├── runner.js                 # Unified test harness
│   ├── tier1_features/           # Feature coverage tests
│   ├── tier2_boundaries/         # Edge cases & boundary tests
│   ├── tier3_cross_portal/       # Pairwise multi-portal sync tests
│   └── tier4_real_world/         # Real-world application scenarios
├── server.js                     # Main Express server & Parent portal
├── teacherRoutes.js              # Teacher portal routes & UI
├── adminRoutes.js                # Super Admin routes & UI
├── studentStore.js               # Student persistence & business logic
├── teacherStore.js               # Teacher persistence & business logic
├── parentStore.js                # Parent persistence & business logic
├── adminStore.js                 # Admin persistence & business logic
└── authUtils.js                  # Authentication, cryptographic tokens, sanitization
```
