# E2E Test Infra: Elingu Full-Stack Hardening & Synchronization

## Test Philosophy
- Opaque-box, requirement-driven derived strictly from `ORIGINAL_REQUEST.md` and Kenyan CBE / KDPA 2019 specifications.
- Methodology: Category-Partition + Boundary Value Analysis (BVA) + Pairwise Combinatorial Interaction + Real-World End-to-End Workload Simulation.
- Dual-Track Execution: Test creation runs in parallel; passing 100% of Tiers 1-4 is the mandatory gate before final adversarial coverage hardening (Tier 5).

## Feature Inventory & Test Matrix
| # | Feature | Source (Requirement) | Tier 1 | Tier 2 | Tier 3 |
|---|---------|----------------------|:------:|:------:|:------:|
| 1 | Student Portal Signup & Identity | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 2 | Student PIN Verification & Lockout | ORIGINAL_REQUEST §R1, R2 | 5 | 5 | ✓ |
| 3 | Student PIN Reset Recovery Flow | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 4 | Student Session Tokens & IDOR Defense | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 5 | KDPA 2019 Child PII Masking | ORIGINAL_REQUEST §AC | 5 | 5 | ✓ |
| 6 | Socratic Chat Interaction & Guardrails | ORIGINAL_REQUEST §R1, R2 | 5 | 5 | ✓ |
| 7 | Chat Input Sanitization & Stored XSS Defense | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 8 | Stream Join Code DB Validation | ORIGINAL_REQUEST §AC | 5 | 5 | ✓ |
| 9 | Teacher Portal Authentication & Tokens | ORIGINAL_REQUEST §R1, R2 | 5 | 5 | ✓ |
| 10 | School Admin Code Gate | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 11 | Teacher Stream Management | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 12 | Teacher Mission Generation & Assignment | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 13 | Student Mission Reception & Attempt | ORIGINAL_REQUEST §AC | 5 | 5 | ✓ |
| 14 | Teacher Live Tracker Analytics & Process Trails | ORIGINAL_REQUEST §AC, R1 | 5 | 5 | ✓ |
| 15 | Parent Portal Authentication & Token Gate | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 16 | Parent Dashboard & Child Linkage | ORIGINAL_REQUEST §R1, R2 | 5 | 5 | ✓ |
| 17 | Parent Socratic Insight Formulas | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 18 | Section 33 Parental Consent Enforcement | ORIGINAL_REQUEST §AC | 5 | 5 | ✓ |
| 19 | Section 40 Right to Erasure (FUTA DATA) | ORIGINAL_REQUEST §AC | 5 | 5 | ✓ |
| 20 | Pre-Write Snapshot Backup Engine | ORIGINAL_REQUEST §R3, AC | 5 | 5 | ✓ |
| 21 | Unified Relational PostgreSQL Persistence | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |
| 22 | JSON-to-SQL Bidirectional Reconciliation | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |
| 23 | Exhaust & Diagnostics Repository Containment | ORIGINAL_REQUEST §R4, AC | 5 | 5 | ✓ |
| 24 | Staging Plane Branch Isolation | ORIGINAL_REQUEST §R5 | 5 | 5 | ✓ |

## Test Architecture
- **Location**: `tests/`
- **Runner**: `node tests/runner.js`
- **Semantics**:
  - Independent exit codes (Exit Code 0 = 100% Passed, Exit Code 1 = Assertion Failure).
  - Isolated test fixtures; zero pollution of live production tables.
  - Test logs output directly to `docs/teamwork_exhaust/tests/`.

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Complexity |
|---|----------|--------------------|------------|
| 1 | School Term Onboarding & Digital Homework Cycle | Teacher stream creation, student enrollment with valid stream code, mission assignment push, student quiz submission, teacher live tracker update | High |
| 2 | Multi-Child Household & Subscription Scaling | Parent account creation, multiple child linkages, subscription verification, Socratic insights depth/persistence sync | High |
| 3 | KDPA 2019 Regulatory Audit & Right to Erasure | Unauthenticated PII probe verification, parental consent enforcement, verified child account purge with "FUTA DATA" phrase, complete data erasure audit | High |
| 4 | Ephemeral Container Crash & Zero-Data-Loss Recovery | Server simulation with unpersisted store writes, triggering pre-write backup engine, verification of SHA-256 snapshot in `docs/teamwork_exhaust/backups/`, full data recovery | High |
| 5 | Adversarial Pen-Testing & Exploit Simulation | Parameter tampering on `studentId`, Stored XSS payload in chat & process trails, brute-force login lockout trigger, invalid stream join code rejection | High |

## Coverage Thresholds
- **Tier 1 (Feature Coverage)**: ≥120 test cases (≥5 per feature across 24 core capabilities).
- **Tier 2 (Boundary & Corner Cases)**: ≥40 test cases.
- **Tier 3 (Cross-Feature Combinations)**: ≥24 pairwise combinations.
- **Tier 4 (Real-World Scenarios)**: 5 comprehensive end-to-end workflows.
- **Tier 5 (Adversarial Coverage Hardening)**: White-box gap analysis, edge case mutation testing, and Forensic Auditor verification.
