# Admin Functional Audit Report — Vission Academy SaaS

**Audit Date**: September 20, 2026  
**Audit Status**: **INCOMPLETE / FAILURES IDENTIFIED**  
**Overall Verdict**: **FAIL (Do NOT mark as overall PASS)**

---

## Executive Summary

A comprehensive functional and runtime audit was conducted across all Administrative capabilities within the Vission Academy platform, covering REST API contracts, PostgreSQL data integrity, authentication/authorization boundaries, user/class/subject management, marksheets processing, notification distribution, and campus events.

During testing, **two critical failures** were identified. Per audit instructions, **no fixes have been applied**; all verified findings and reproduction steps are documented below for post-audit remediation.

---

## Confirmed Failures (Detailed Breakdown)

### 1. Duplicate Active Teacher Class Assignments Allowed (Data Integrity Failure)

* **Classification**: **FAIL**
* **Area**: Teacher Class Assignments & Database Constraints
* **Location**: `db/schema.sql`, `server/routes/admin-routes.ts:163-170`
* **Finding**:
  The `teacher_class_assignments` table allows duplicate active records for the same teacher, class, subject, and semester tuple. In the current database state, duplicate active records exist for:
  ```sql
  teacher_user_id = 'usr_teacher_01'
  class_id        = 'cls_sem_1'
  subject_id      = 'sbj_algorithms'
  semester_id     = 'sem_1'
  status          = 'active'
  ```
* **Root Cause**:
  `db/schema.sql` lacks a `UNIQUE` constraint or unique index on `(teacher_user_id, class_id, subject_id, semester_id, status)` or `(teacher_user_id, class_id, subject_id, semester_id) WHERE status = 'active'`.
  Because no PostgreSQL unique constraint exists on these columns, the error handling block in `POST /api/admin/teacher-assignments`:
  ```ts
  catch (e: any) {
    if (e.code === '23505') return res.status(409).json({ error: 'This teacher is already actively assigned...' });
    throw e;
  }
  ```
  is completely ineffective. PostgreSQL never raises error `23505` (`unique_violation`), causing duplicate assignments to accumulate silently in the database.
* **Impact**:
  Teachers see duplicate assigned courses on their dashboard, marks aggregation and roster queries may produce duplicate entries or redundant join hits, and database integrity is degraded.

---

### 2. Backend Server Process Crash on Notification Publication (Runtime Crash)

* **Classification**: **FAIL**
* **Area**: Admin Notifications API & Process Stability
* **Location**: `server/routes/admin-routes.ts:290-296`
* **Trigger Endpoint**: `POST /api/admin/notifications`
* **Finding**:
  Sending a valid request to `POST /api/admin/notifications` causes an uncaught database driver error that crashes the entire Node.js backend server. Once crashed, the API health check `/api/health` and all web endpoints become unreachable until the process is manually restarted.
* **Captured Error Output & Stack Trace**:
  ```text
  error: bind message supplies 8 parameters, but prepared statement "" requires 7
      at C:\Users\Aryan\Downloads\vission-academy\node_modules\pg-pool\index.js:45:11
      at process.processTicksAndRejections (node:internal/process/task_queues:103:5)
      at async query (C:\Users\Aryan\Downloads\vission-academy\server\db.ts:25:18)
      at async <anonymous> (C:\Users\Aryan\Downloads\vission-academy\server\routes\admin-routes.ts:294:3) {
    length: 137,
    severity: 'ERROR',
    code: '08P01',
    routine: 'exec_bind_message'
  }
  ```
* **Root Cause**:
  In `server/routes/admin-routes.ts`, the notification record object `n` is constructed with **8 properties**:
  ```ts
  const n = {
    id: id('notif'),
    title: String(title).trim(),
    body: String(body).trim(),
    target_role,
    target_class_id: target_role === 'class' ? target_class_id : null,
    file_url: file_url || null,
    created_by: req.user!.id,
    created_at: new Date().toISOString() // 8th property
  };
  ```
  Line 294 then executes:
  ```ts
  await query(
    'INSERT INTO notifications (id,title,body,target_role,target_class_id,file_url,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    Object.values(n)
  );
  ```
  `Object.values(n)` passes an 8-element array into `query(...)`, but the SQL statement only defines 7 placeholders (`$1` through `$7`). PostgreSQL rejects the parameter count mismatch with error `08P01`. Because Express async routes lack an outer `try/catch` wrapper, the unhandled Promise rejection terminates the Node.js process (`exit code 1`).
* **Impact**:
  Any administrator attempting to send an announcement crashes the institution's entire server.

---

## Detailed Admin Audit Results Table

| Feature / Domain | Endpoint / Component | Status | Observations / Verification Details |
| :--- | :--- | :---: | :--- |
| **Teacher Class Assignments** | `POST /api/admin/teacher-assignments` | **FAIL** | Duplicate active records allowed for `usr_teacher_01` / `cls_sem_1` / `sbj_algorithms` / `sem_1`. Missing UNIQUE constraint in `db/schema.sql`. |
| **Notification Publishing** | `POST /api/admin/notifications` | **FAIL** | Server crashes with `08P01` (8 params bound to 7 SQL placeholders). Unhandled Promise rejection terminates Node.js process. |
| **Notification Listing** | `GET /api/admin/notifications` | **PASS** | Returns complete notification list with creator names, target class names, and read counts (`200 OK`). Verified post-server restart. |
| **Notification Deletion** | `DELETE /api/admin/notifications/:id` | **PASS** | Removes notification entry cleanly (`200 OK`). Verified post-server restart. |
| **College Events & Hackathons** | `GET / POST / DELETE /api/admin/events` | **PASS** | Event listing, creation (`201 Created`), and deletion (`200 OK`) function as designed with input validation. Verified post-server restart. |
| **Admin Overview & Dashboard** | `GET /api/admin/overview` | **PASS** | Aggregates student/teacher/class counts, active semesters, overall pass rates, semester trends, and department stats. |
| **System Analytics** | `GET /api/admin/analytics` | **PASS** | Computes grade distributions (A/B/C/D/F) from recorded marks across departments. |
| **Audit Logs** | `GET /api/admin/audit-logs` | **PASS** | Returns chronological security/activity log entries with user attribution (`200 OK`). |
| **User Listing & Search** | `GET /api/admin/users` | **PASS** | Supports filtering by role, search by name/email/roll number, returns active assignment counts. |
| **User Creation (Single)** | `POST /api/admin/users` | **PASS** | Creates `users` record and linked `students` profile (for student role). Enforces email uniqueness (`409 Conflict`). |
| **Account Activation Status** | `PATCH /api/admin/users/:id/status` | **PASS** | Toggles user `is_active` state. Prevents master administrator self-deactivation (`400 Bad Request`). |
| **Administrative Password Reset** | `POST /api/admin/users/:id/reset-password` | **PASS** | Resets password, sets `must_reset_password = TRUE`, returns temp password or updates custom string. |
| **Bulk CSV User Import** | `POST /api/admin/users/bulk-import` | **PASS** | Parses CSV, creates user accounts, handles missing/duplicate email rows gracefully, returns structured import report. |
| **Class Management** | `GET / POST / DELETE /api/admin/classes` | **PASS** | Enforces unique class designation (`409 Conflict`), blocks deletion of classes with enrolled students or assignments. |
| **Departments & Semesters** | `GET /departments`, `GET /semesters` | **PASS** | Fetches active structure cleanly. |
| **Subject Catalog** | `GET / POST / DELETE /api/admin/subjects` | **PASS** | Handles course creation, enforces unique course codes (`409 Conflict`), blocks deletion when referenced (`23503`). |
| **Start New Semester Workflow** | `POST /api/admin/start-new-semester` | **PASS** | Transactionally deactivates current semester, creates/activates new semester, and transitions active assignments to `past`. |
| **Single Marksheet Upload** | `POST /api/admin/marksheets/upload` | **PASS** | Validates PDF header (`%PDF-`), uploads file to `/uploads/marksheets/`, creates database record (`200 OK`). |
| **Bulk ZIP Marksheet Processing** | `POST /api/admin/marksheets/bulk-zip` | **PASS** | Extracts ZIP in-memory, maps filenames to roll numbers, skips non-PDFs/duplicates, returns detailed status payload. |
| **Academic AI Assistant** | `POST /api/admin/ai/query` | **BLOCKED** | `GEMINI_API_KEY` is not set in `.env`. Graceful fallback to PostgreSQL-scoped summary succeeds, but live Gemini LLM reasoning is unverified. |

---

## Remaining Verification Summary

- **Authentication & Rate Limiting**: Maintained intact (`15` requests per `5 min` on sensitive auth routes).
- **Database State**: Untouched (duplicate assignment records for `usr_teacher_01` preserved for audit verification).
- **Server Health**: Restarted and operational; GET endpoints for notifications/events verified post-restart.

---

## Conclusion & Action Required

The Admin functional audit is **CONCLUDED WITH FAILURES**. No code changes or database modifications have been applied. Remediations must be addressed only after formal review of this report.
