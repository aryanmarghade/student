# FINAL ODD SEMESTER BROWSER QA REPORT

## 1. Overall Result Summary

| Role / Scope | Browser Test Result | Key Notes |
| :--- | :--- | :--- |
| **Admin Portal** (`/admin`) | **PASS** | Full access to Academic Records, User Directory, Classes/Courses, Teacher Scopes, Official Marksheets, Broadcasts, Events, Audit Logs, Analytics Settings. Student dossiers reflect odd semester progression. |
| **Teacher 1** (`qateacher1@test.com`) | **PASS** | Authorized class scopes loaded (`CSE-2A Sem 3`, `CSE-1B Sem 1`, `CSE-1C Sem 1`, `CSE-1A Sem 1`). Roster and real-time linear regression analytics rendered accurately without historical bleed. |
| **Teacher 3** (`qateacher3@test.com`) | **PASS** | Authorized class scopes loaded. Roster and marks entry isolate assigned cohorts. |
| **Placement Portal** (`/placement`) | **PASS** | Year-wise breakdown (1st, 2nd, 3rd, 4th Year), average CGPAs, student directory, links, projects, and authentic backlog tags (71 eligible, 2 with active backlogs). Direct navigation to `/admin` and `/teacher` blocked. |
| **Student Year 1** (`QA Student 01` `QA-S1-001`) | **PASS** | Current Semester = **Sem 1**; mark history contains only Semester 1 marks. No future semester marks. |
| **Student Year 2** (`Atharva Ghodki` `VA1789815813361`) | **PASS** | Current Semester = **Sem 3**; historical progression Sem 1, 2, 3 with 2 active backlogs (Sem 1 OS & Sem 2 ML). |
| **Student Year 3** (`Aryan Marghade` `25070521215`) | **PASS** | Current Semester = **Sem 5**; historical progression Sem 1, 2, 3, 4, 5. No Sem 6+ marks. |
| **Student Year 4** (`QA Student 08` `QA-S4-001`) | **PASS** | Current Semester = **Sem 7**; historical progression Sem 1 through Sem 7. No Sem 8 marks. |

---

## 2. Academic Progression & Distribution

### Current Semester Breakdown
- **Year 1 $\rightarrow$ Semester 1:** **18** students (Sem 2 = **0**)
- **Year 2 $\rightarrow$ Semester 3:** **19** students (Sem 4 = **0**)
- **Year 3 $\rightarrow$ Semester 5:** **18** students (Sem 6 = **0**)
- **Year 4 $\rightarrow$ Semester 7:** **18** students (Sem 8 = **0**)
- **Total Students Enrolled:** **73**

### Mark History & Progression
- **Year 1:** Semesters present in marks: `[ 1 ]`
- **Year 2:** Semesters present in marks: `[ 1, 2, 3 ]`
- **Year 3:** Semesters present in marks: `[ 1, 2, 3, 4, 5 ]`
- **Year 4:** Semesters present in marks: `[ 1, 2, 3, 4, 5, 6, 7 ]`
- **Future marks ($> \text{current semester}$):** **0**

---

## 3. Backlog Isolation & Derivation
Backlogs are derived solely from authentic evaluations with mark percentage $< 40\%$:
1. **Atharva Ghodki (`VA1789815813361` - Year 2 / Sem 3):**
   - Sem 1 *Operating Systems & Concurrency*: 32/100 (32%) $\rightarrow$ Active Backlog
   - Sem 2 *Applied Machine Learning*: 37/100 (37%) $\rightarrow$ Active Backlog
2. **QA Student 06 (`QA-S3-001` - Year 3 / Sem 5):**
   - Sem 1 *Operating Systems & Concurrency*: 37/100 (37%) $\rightarrow$ Active Backlog
   - Sem 2 *Applied Machine Learning*: 31/100 (31%) $\rightarrow$ Active Backlog
- **Future-semester backlogs:** **0**

---

## 4. Teacher Analytics Verification

| Metric / Feature | Whole Class | Selected Students | Single Student | Result |
| :--- | :--- | :--- | :--- | :--- |
| **Arithmetic Mean & Median** | Accurate (65.25% Mean, 63.5% Median) | Reactive to cohort selection | Focused on student | **PASS** |
| **Standard Deviation & Range** | ±15.45% (Range: 46% - 88%) | Dynamic calculation | Single point | **PASS** |
| **Linear Regression Trend** | Rendered (slope: -13.7, non-negative projection) | Reactive to cohort selection | Focused trajectory | **PASS** |
| **Grade Distribution Graph** | Clean letter-grade bars across active filter | Responsive | Individual grade | **PASS** |
| **Historical Isolation** | Sem 1–2 historical backlogs do NOT bleed into Sem 3 current graph | Isolated | Isolated | **PASS** |

---

## 5. Security & Cross-Role Access Control (RBAC)

- **Student:** Direct navigation to `/admin`, `/teacher`, `/placement` is blocked and redirects to login/authorized area. Cannot see other students' marks or dossiers.
- **Placement Officer:** Direct navigation to `/admin` and `/teacher` is strictly blocked. Placement operates in strict Read-Only mode.
- **Teacher:** Scope isolation enforced. Teachers only see students enrolled in their assigned class/subject scopes.
- **Admin:** Full governance and visibility controls across all departments, classes, subjects, and analytics settings.

---

## 6. Viewport Responsiveness

- **Desktop (1280 × 800):** **PASS** — Full multi-column dashboard, graphs, grids, dossiers, and sidebars fully accessible.
- **Tablet (768 × 1024):** **PASS** — Tables scroll horizontally within containers, navigation tabs collapse gracefully, graphs maintain visible height.
- **Mobile (375 × 667):** **PASS** — Single-column layout with vertical flow, modal dossiers fit viewport, zero broken horizontal overflows.

---

## 7. Console & Network Logs

- **Console Errors:** **0** JavaScript / React runtime errors.
- **Network Failures:** **0** unexpected 500 / unhandled 400 responses.
- **Vite Hot Module Reloading:** Fully connected and functioning.

---

## 8. Defect Log
- **Identified Bugs:** **0**

---

## Final Decision

### **READY FOR FINAL PUSH**
