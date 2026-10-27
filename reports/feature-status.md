# Vission Academy - Feature Status & Verification Ledger

**Last Updated**: 2026-10-27  
**Current Milestone**: Part 0 Completed (Demo Analytics Data Engine & Platform Isolation)  
**Strict Visual & Layout Freeze**: Active & Maintained

---

## 1. Feature Status Matrix (PROJECT_MAP.txt Section 6)

| ID | Role | Feature / Capability | Status | Evidence / Verification Method |
|---|---|---|---|---|
| **ADM-01** | Admin | Institutional Overview & Headcounts (Students, Faculty, Classes) | Untested | Pending Part 1 automated browser run |
| **ADM-02** | Admin | Institutional Overall Pass Rate (%) & Semester Curves | Untested | Pending Part 2 analytics audit |
| **ADM-03** | Admin | Department-level Distribution Tables | Untested | Pending Part 2 analytics audit |
| **ADM-04** | Admin | Academic Hierarchy Governance (Colleges, Depts, Years, Semesters, Classes) | Untested | Pending Part 1 & Part 5 verification |
| **ADM-05** | Admin | Subject Catalogue Management & Default Max Marks | Untested | Pending Part 5 verification |
| **ADM-06** | Admin | Teacher Class & Subject Assignments (`teacher_class_assignments`) | Working | Verified in `tests/part0-seed-demo.spec.ts` |
| **ADM-07** | Admin | User Directory & Identity Provisioning (Student, Teacher, Placement) | Working | Verified in `tests/part0-seed-demo.spec.ts` |
| **ADM-08** | Admin | Force Password Reset (`must_reset_password`) | Untested | Pending Part 1 & Part 5 verification |
| **ADM-09** | Admin | Official Marksheet Uploads (Single PDF & Bulk ZIP) | Untested | Pending Part 5 verification |
| **ADM-10** | Admin | Granular Faculty Analytics Visibility Toggles | Untested | Pending Part 5 verification |
| **ADM-11** | Admin | Granular Placement Analytics Visibility Toggles | Untested | Pending Part 5 verification |
| **ADM-12** | Admin | External Synchronization Center (GitHub, LeetCode, HackerRank, LinkedIn) | Working | Verified in `tests/part0-seed-demo.spec.ts` (Demo rows skipped) |
| **ADM-13** | Admin | Student Dossier 360° Inspector | Untested | Pending Part 1 browser run |
| **ADM-14** | Admin | Targeted Notices & Campus Events | Untested | Pending Part 5 verification |
| **ADM-15** | Admin | System Audit Log Trail | Untested | Pending Part 5 verification |
| **TCH-01** | Teacher | Scoped Class Roster & Student Dossier | Working | Verified in `tests/part0-capture-screenshots.spec.ts` |
| **TCH-02** | Teacher | Dynamic Assessment Definition & Marks Entry Spreadsheet | Untested | Pending Part 1 & Part 5 verification |
| **TCH-03** | Teacher | Grade Distribution & Linear Regression Predictive Intelligence | Untested | Pending Part 2 analytics audit |
| **TCH-04** | Teacher | Visibility-Governed External Analytics (GH, LC, HR, LI, Hackathons) | Untested | Pending Part 2 & Part 3 verification |
| **TCH-05** | Teacher | Class Announcements & Academic Communication | Untested | Pending Part 5 verification |
| **PLC-01** | Placement | Placement Overview (Eligible Candidates 0-Backlog Count) | Working | Verified in `tests/part0-capture-screenshots.spec.ts` |
| **PLC-02** | Placement | Multi-Year Filterable Student Directory (1st to 4th Year) | Working | Verified in `tests/part0-capture-screenshots.spec.ts` |
| **PLC-03** | Placement | Live Student Search by Name or Roll Number | Untested | Pending Part 1 verification |
| **PLC-04** | Placement | Student Profile Modal & Dossier (Academic History, Tech Stats, Projects) | Working | Verified in `tests/part0-capture-screenshots.spec.ts` |
| **PLC-05** | Placement | Placement Visibility Backend Enforcement Boundary | Untested | Pending Part 5 verification |
| **STD-01** | Student | Public Profile, Bio & Profile Strength Score (0-100%) | Working | Verified in `tests/part0-capture-screenshots.spec.ts` |
| **STD-02** | Student | Projects & Portfolio Management | Working | Verified in `tests/part0-seed-demo.spec.ts` |
| **STD-03** | Student | Certifications, Hackathons & Sports Vault | Working | Verified in `tests/part0-seed-demo.spec.ts` |
| **STD-04** | Student | Academic Records, Marks Transcripts & Marksheet Downloads | Working | Verified in `tests/part0-seed-demo.spec.ts` |
| **STD-05** | Student | Social Feed & Activity Posts | Untested | Pending Part 5 verification |
| **STD-06** | Student | Document Vault Storage | Untested | Pending Part 5 verification |
| **STD-07** | Student | Notifications & Events Participation | Untested | Pending Part 5 verification |
| **AIA-01** | AI Assistant | Grounded Academic Queries (Database schema tools) | Untested | Pending Part 4 AI test suite |
| **AIA-02** | AI Assistant | Role-Based Access Boundary Enforcement in AI queries | Untested | Pending Part 4 AI test suite |
| **AIA-03** | AI Assistant | Multi-turn Conversation & `ai_query_logs` Auditing | Untested | Pending Part 4 AI test suite |

---

## 2. Part 0 & Part 0B Execution Summary & Evidence

- **Demo Analytics Seed Script**: `scripts/seed-demo-analytics.ts`
  - NPM Scripts: `seed:demo`, `seed:demo:reset`, `demo:db:setup`, `dev:demo`
  - Safety Guards: Refuses execution when `NODE_ENV=production` or if database name does not contain `test` or `demo`.
  - Determinism: Mulberry32 PRNG (seed 42) ensures 100% deterministic dataset.
  - Scale: 150 students across 4 years (Year 1: 41, Year 2: 38, Year 3: 37, Year 4: 37) and 4 departments (CSE, IT, ECE, ME).
  - Correlated Data:
    - High performers: CGPA 8.9–9.8, 0 backlogs, LeetCode 300–520 (Easy >= Medium >= Hard strictly for ALL students), 5-star HackerRank, multi-month snapshots, hackathon awards, sports awards.
    - Average performers: CGPA 6.0–7.9, 0–1 backlogs, LeetCode 80–250 (Easy >= Medium >= Hard).
    - At-risk performers: Active backlogs, marks < 40, lower profile strength.
    - Rank vs Solved Pearson correlation: -0.664 (negative confirms higher solved leads to better ranking).
    - CGPA vs LeetCode Solved Pearson correlation: +0.735 (realistic positive correlation).
    - Monotonically non-decreasing monthly snapshots across all platforms.
  - 5 Explicit Edge Cases:
    1. Unlinked profiles: 3 students
    2. Zero activity profiles: 3 students
    3. Single platform linked: 5 students
    4. Top performers (profile_strength >= 90): 21 students
    5. At-risk students (active backlogs): 15 students

- **Isolation & Exact Reset**:
  - `seed:demo:reset` removes only `demo_%` tagged rows and restores 100% exact table row counts across all tables in `information_schema.tables` and files in `uploads/` (0 orphans).
  - Sync skip test verified non-vacuously: removing skip guard causes test failure (152 students queued); restoring guard passes cleanly (2 non-demo students queued).
  - Separate demo database `vission_academy_demo` running on port 3001 via `dev:demo` (`.env.demo`).
  - Test suite (`vission_academy_small_test`) asserts illegal configuration if pointed at demo database.

- **Automated UI Proof Across 4 Roles (`tests/part0b-demo-proof.spec.ts`)**:
  - Saved 8 screenshots to gitignored `reports/demo-proof/`:
    * `teacher_student_analytics.png`
    * `placement_directory.png`
    * `placement_student_dossier_modal.png`
    * `admin_student_dossier.png`
    * `admin_analytics_settings.png`
    * `student_profile_tab.png`
    * `student_intelligence_tab.png`
    * `student_sports_tab.png`
  - Automated Playwright audit read database values for 5 random demo students and compared against browser screen text with 100% exact match assertions passing.
