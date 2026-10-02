# ACADEMIC DATA INTEGRITY REPORT

**Date:** October 2, 2026  
**Status:** **PASSED & VERIFIED** (0 Invalid Records, 0 Future Marks, 0 Duplicates, 0 Orphan Records)

---

## 1. Executive Summary
A comprehensive audit and targeted data correction was performed on the PostgreSQL database (`vission_academy`) to eliminate future semester marks contamination and resolve subject/semester/class mismatches.

All data integrity rules have been strictly enforced:
- **No student possesses marks or marksheets for semesters beyond their legitimate current semester.**
- **All marks belong strictly to the student's assigned class and curriculum.**
- **Backlogs are derived exclusively from authentic failed evaluations (<40% passing threshold).**
- **Teacher analytics and student dossier scopes remain perfectly isolated.**

---

## 2. Student Counts & Distribution
- **Total Active Students:** 73
- **Students by Current Semester:**
  - **Semester 1 (Year 1):** 18 students (Classes: *QA Semester 1 Class A, B, C*)
  - **Semester 2 (Year 2):** 19 students (Classes: *QA Semester 2 Class A, B, C*)
  - **Semester 3 (Year 3):** 18 students (Classes: *QA Semester 3 Class A, B, C*)
  - **Semester 4 (Year 4):** 18 students (Classes: *QA Semester 4 Class A, B, C*)

---

## 3. Marks Audit & Distribution
- **Total Marks Records:** 634
- **Historical Marks (Semester < Current Semester):** 398
- **Current Marks (Semester == Current Semester):** 236
- **Future Marks (Semester > Current Semester):** **0** (Expected: 0)

---

## 4. Relationship & Integrity Verification
| Check Item | Result | Expected | Status |
| :--- | :---: | :---: | :---: |
| **Future Marks** | `0` | `0` | **PASS** |
| **Student / Class Mismatches** | `0` | `0` | **PASS** |
| **Subject / Semester Mismatches** | `0` | `0` | **PASS** |
| **Assessment / Class Mismatches** | `0` | `0` | **PASS** |
| **Duplicate Marks Groups** | `0` | `0` | **PASS** |
| **Orphan Marks Records** | `0` | `0` | **PASS** |
| **Orphan Assessment Definitions** | `0` | `0` | **PASS** |
| **Students Without Valid Current Semester** | `0` | `0` | **PASS** |

---

## 5. Backlogs & Academic Standing Audit
Backlogs are computed dynamically from actual subject performance where marks obtained are below the 40% threshold:
- **Total Failing Subject Records:** 4
- **Students with 0 Backlogs:** 71
- **Students with 1 Backlog:** 0
- **Students with 2+ Backlogs:** 2 (*Atharva Ghodki* and *QA Student 06*)
- **Future Semester Backlogs:** **0**

---

## 6. Sample Student Dossiers

### 1. Semester 1 Student
- **Student:** QA Student Y1A 1 (`QA-Y1A-001`)
- **Class:** QA Semester 1 Class A | **Current Semester:** 1
- **Allowed Historical/Current Semesters:** `[1]`
- **Actual Mark Semesters:** `[1]`
- **Invalid Future Marks:** `0`
- **Backlogs:** `0`
- **Marks:**
  - *Semester 1:* `ALG101` (Internal 1: 10/25, Internal 2: 13/25)

### 2. Semester 2 Student (Clean / 0-Backlog)
- **Student:** QA Student Y2A 1 (`QA-Y2A-001`)
- **Class:** QA Semester 2 Class A | **Current Semester:** 2
- **Allowed Historical/Current Semesters:** `[1, 2]`
- **Actual Mark Semesters:** `[1, 2]`
- **Invalid Future Marks:** `0`
- **Backlogs:** `0`
- **Marks:**
  - *Semester 1:* `DBMS201` (Final: 41/100, Internal 1: 17/25, Internal 2: 17/25, Midterm: 32/50)
  - *Semester 2:* `DBMS201` (Final: 43/100, Internal 1: 20/25, Internal 2: 14/25, Midterm: 43/50)

### 3. Semester 2 Student (Backlog Case)
- **Student:** Atharva Ghodki (`VA1789815813361`)
- **Class:** QA Semester 2 Class A | **Current Semester:** 2
- **Allowed Historical/Current Semesters:** `[1, 2]`
- **Actual Mark Semesters:** `[1, 2]`
- **Invalid Future Marks:** `0`
- **Backlogs:** `2` (`CS303`: 32/100, `CS401`: 37/100)
- **Marks:**
  - *Semester 1:* `CS303` (32/100 - Fail), `CS304` (53/100 - Pass)
  - *Semester 2:* `ALG101` (46/100 - Pass), `CS401` (37/100 - Fail)

### 4. Semester 3 Student (Clean / 0-Backlog)
- **Student:** Aryan Marghade (`25070521215`)
- **Class:** QA Semester 3 Class A | **Current Semester:** 3
- **Allowed Historical/Current Semesters:** `[1, 2, 3]`
- **Actual Mark Semesters:** `[1, 2, 3]`
- **Invalid Future Marks:** `0` (Formerly contaminated Sem 4 & Sem 5 marks removed)
- **Backlogs:** `0`
- **Marks:**
  - *Semester 1:* `CS303` (61/100), `CS304` (66/100)
  - *Semester 2:* `ALG101` (59/100), `CS401` (66/100)
  - *Semester 3:* `OS301` (Internal 1: 23/25, Internal 2: 12/25)

### 5. Semester 3 Student (Backlog Case)
- **Student:** QA Student 06 (`QA-S3-001`)
- **Class:** QA Semester 3 Class A | **Current Semester:** 3
- **Allowed Historical/Current Semesters:** `[1, 2, 3]`
- **Actual Mark Semesters:** `[1, 2, 3]`
- **Invalid Future Marks:** `0`
- **Backlogs:** `2` (`CS303`: 37/100, `CS401`: 31/100)
- **Marks:**
  - *Semester 1:* `CS303` (37/100 - Fail), `CS304` (47/100 - Pass)
  - *Semester 2:* `ALG101` (54/100 - Pass), `CS401` (31/100 - Fail)
  - *Semester 3:* `OS301` (Internal 1: 23/25, Internal 2: 18/25)

### 6. Semester 4 Student
- **Student:** QA Student Y4A 1 (`QA-Y4A-001`)
- **Class:** QA Semester 4 Class A | **Current Semester:** 4
- **Allowed Historical/Current Semesters:** `[1, 2, 3, 4]`
- **Actual Mark Semesters:** `[1, 2, 3, 4]`
- **Invalid Future Marks:** `0`
- **Backlogs:** `0`
- **Marks:**
  - *Semester 1:* `DBMS201` (Final: 74/100, Internal 1: 18/25, Internal 2: 22/25, Midterm: 22/50)
  - *Semester 2:* `DBMS201` (Final: 97/100, Internal 1: 13/25, Internal 2: 17/25, Midterm: 45/50)
  - *Semester 3:* `DBMS201` (Final: 43/100, Internal 1: 12/25, Internal 2: 22/25, Midterm: 40/50)
  - *Semester 4:* `DBMS201` (Final: 95/100, Internal 1: 22/25, Internal 2: 21/25, Midterm: 31/50)

---

## 7. Teacher Analytics & Isolation Guarantee
The Teacher Analytics engine evaluates marks filtered strictly by:
- `m.class_id = $1` (selected class)
- `m.subject_id = $2` (selected subject)
- `m.semester_id = ANY($3)` (selected semester)
- Selected Student scope (`whole_class`, `selected_students`, or `single_student`)

Because all `m.class_id` values are synchronized with student enrollments and invalid future marks have been purged, teacher analytics metrics (Internal Marks graph, Class Average, Grade Distribution, Standard Deviation, and Regression) remain completely pure and uncontaminated by past/future semesters.
