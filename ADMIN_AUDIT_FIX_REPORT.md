# Admin Audit Fix Report — Vission Academy SaaS

**Fix Completion Date**: September 20, 2026  
**Status**: **ALL CONFIRMED FAILURES RESOLVED & VERIFIED**  
**Overall Verdict**: **PASS (Both confirmed failures successfully remediated & empirically verified)**

---

## Executive Summary

Following the completion of the comprehensive Admin Functional Audit, the two confirmed failures were remediated and verified without introducing new features, altering existing UI designs, refactoring unrelated codebase files, or deleting valid historical records.

Both fixes were validated against PostgreSQL and runtime HTTP API behavior, passing all linting (`tsc --noEmit`), full application build (`vite build` + `esbuild`), and live API integration test criteria.

---

## Fix 1 — Notification Post Crash

### Root Cause
In `server/routes/admin-routes.ts`, `POST /api/admin/notifications` defined an insertion SQL query with **7 parameter placeholders** (`$1` through `$7`), but passed `Object.values(n)` where `n` contained **8 object properties** (including `created_at`). The PostgreSQL driver rejected the parameter count mismatch with error code `08P01` (`"bind message supplies 8 parameters, but prepared statement "" requires 7"`). Because Express async routes lacked parameter matching, the unhandled Promise rejection terminated the Node.js server process (`exit code 1`), causing `/api/health` and all API endpoints to fail.

### Implementation Fix
Updated `server/routes/admin-routes.ts` (and aligned `server/routes/teacher-routes.ts`) to explicitly map the parameter array matching all 8 columns in the `notifications` schema:
```ts
const n = {
  id: id('notif'),
  title: String(title).trim(),
  body: String(body).trim(),
  target_role,
  target_class_id: target_role === 'class' ? target_class_id : null,
  file_url: file_url || null,
  created_by: req.user!.id,
  created_at: new Date().toISOString()
};

await query(
  'INSERT INTO notifications (id,title,body,target_role,target_class_id,file_url,created_by,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
  [n.id, n.title, n.body, n.target_role, n.target_class_id, n.file_url, n.created_by, n.created_at]
);
```

### Verification & Evidence
1. **HTTP Response**: `POST /api/admin/notifications` returns `201 Created` with the created notification payload.
2. **PostgreSQL Storage**: Querying `SELECT * FROM notifications WHERE id = $1` confirms the record is saved with complete column attributes (`created_at`, `created_by`, `target_role`, etc.).
3. **Retrieval**: `GET /api/admin/notifications` returns `200 OK` and includes the newly published notification.
4. **Server Stability**: Server remains running; `GET /api/health` continues returning `200 OK` (`status: "ok"`).

---

## Fix 2 — Duplicate Teacher Class Assignments

### Root Cause
`db/schema.sql` previously defined `teacher_class_assignments` without a `UNIQUE` constraint or unique index for active assignment identity (`teacher_user_id`, `class_id`, `subject_id`, `semester_id`) when `status = 'active'`. Consequently, `POST /api/admin/teacher-assignments` error handling for error code `23505` (`unique_violation`) was never triggered, allowing duplicate active assignment rows to be inserted.

### Database Index Added
Added a partial `UNIQUE` index in `db/schema.sql` and `server/db.ts` that enforces uniqueness specifically for active assignments while preserving the ability to hold historical/past records (`status = 'past'`):
```sql
CREATE UNIQUE INDEX IF NOT EXISTS uq_tca_active_assignment 
ON teacher_class_assignments (teacher_user_id, class_id, subject_id, semester_id) 
WHERE status = 'active';
```

### Duplicate Cleanup Performed
Prior to applying the index, an automated deduplication query executed during server initialization (`server/db.ts`):
- Identified the duplicate active rows for `usr_teacher_01` / `cls_sem_1` / `sbj_algorithms` / `sem_1` (`tca_new_cls_sem_1_sbj_algorithms` and `tca_1789890953545_z1dy9e`).
- Removed only the invalid duplicate records while preserving the original seeded active assignment (`tca_qa_1`).
- Preserved all historical/past assignments (`status = 'past'`).

### Verification & Evidence

#### Before / After Database Evidence

* **Before Fix**:
  ```json
  [
    { "id": "tca_qa_1", "teacher_user_id": "usr_teacher_01", "class_id": "cls_sem_1", "subject_id": "sbj_algorithms", "semester_id": "sem_1", "status": "active" },
    { "id": "tca_new_cls_sem_1_sbj_algorithms", "teacher_user_id": "usr_teacher_01", "class_id": "cls_sem_1", "subject_id": "sbj_algorithms", "semester_id": "sem_1", "status": "active" },
    { "id": "tca_1789890953545_z1dy9e", "teacher_user_id": "usr_teacher_01", "class_id": "cls_sem_1", "subject_id": "sbj_algorithms", "semester_id": "sem_1", "status": "active" }
  ]
  ```
  *Active count*: `3` (Data Integrity Failure).

* **After Fix**:
  ```json
  [
    { "id": "tca_qa_1", "teacher_user_id": "usr_teacher_01", "class_id": "cls_sem_1", "subject_id": "sbj_algorithms", "semester_id": "sem_1", "status": "active" }
  ]
  ```
  *Active count*: `1` (Unique active assignment enforced).  
  *Past assignments count*: `1` (Historical record preserved).

#### API Behavior Evidence
1. **Initial Creation**: Valid initial assignment returns `201 Created` (`"Teacher assigned successfully."`).
2. **Duplicate Creation Attempt**: Submitting the same teacher + class + subject + semester tuple with `status = 'active'` returns HTTP `409 Conflict` (`"This teacher is already actively assigned to this class and subject for this semester."`).
3. **Teacher RBAC**: `qateacher1@test.com` authenticated successfully and fetched active assignments (`GET /api/teacher/assignments` -> `200 OK`).

---

## Complete Verification Suite Results

| Test Step | Verification Description | Status | Evidence / Result |
| :---: | :--- | :---: | :--- |
| **1** | Run `npm run lint` (TypeScript compilation) | **PASS** | Completed with `0` errors. |
| **2** | Run `npm run build` (Vite + esbuild bundle) | **PASS** | Frontend & Node server CJS bundle compiled cleanly. |
| **3** | Restart backend server process | **PASS** | DB initialized, deduplication applied, index created, server listening on port 3000. |
| **4** | `POST /api/admin/notifications` | **PASS** | Returns `201 Created` with valid payload. |
| **5** | Verify notification in PostgreSQL | **PASS** | Record present in `notifications` table; included in `GET /api/admin/notifications`. |
| **6** | Duplicate active assignment creation attempt | **PASS** | Returns `409 Conflict` with clear error message. |
| **7** | PostgreSQL active assignment count | **PASS** | DB retains exactly `1` active record for `usr_teacher_01` scope (`tca_qa_1`). |
| **8** | New unique assignment & immediate duplicate check | **PASS** | First attempt returns `201 Created`; second attempt returns `409 Conflict`. |
| **9** | Teacher RBAC functionality | **PASS** | `qateacher1@test.com` logs in and fetches active assigned classes (`200 OK`). |
| **10** | Historical / Past assignments preservation | **PASS** | Past assignments remain intact in PostgreSQL. |
| **11** | Server crash prevention | **PASS** | `/api/health` continuously returns `200 OK` post-testing. |
| **12** | Auth & Rate Limiting integrity | **PASS** | Unauthenticated requests return `401 Unauthorized`; rate limiters remain active. |

---

## Remaining Issues

- **None**. Both confirmed failures are fully resolved, tested, and verified against PostgreSQL and the live Node.js server environment.
