# Role-Based Access Control (RBAC) Master Endpoint Matrix - Vission Academy

Legend:
- `ALLOW`: Permitted with valid JWT role
- `DENY`: Must return HTTP `403 Forbidden` (or `401 Unauthorized` if unauthenticated)
- `SCOPED`: Permitted only for resources owned by or assigned to that user

| Endpoint Path | Method | admin | teacher | placement | student | Notes |
|---|---|---|---|---|---|---|
| `/api/auth/login` | POST | ALLOW | ALLOW | ALLOW | ALLOW | Public endpoint; returns role-specific JWT |
| `/api/auth/reset-password` | POST | ALLOW | ALLOW | ALLOW | ALLOW | Must be authenticated |
| `/api/auth/me` | GET | ALLOW | ALLOW | ALLOW | ALLOW | Returns authenticated user details |
| `/api/health` | GET | ALLOW | ALLOW | ALLOW | ALLOW | Public health check |
| **ADMIN ENDPOINTS (`/api/admin/*`)** | | | | | | |
| `/api/admin/kpis` | GET | ALLOW | DENY | DENY | DENY | Global institutional pass rate & counts |
| `/api/admin/users` | GET, POST | ALLOW | DENY | DENY | DENY | User account directory management |
| `/api/admin/users/:id` | PUT, DELETE | ALLOW | DENY | DENY | DENY | Account updates and soft deactivation |
| `/api/admin/users/:id/reset-password` | POST | ALLOW | DENY | DENY | DENY | Force password reset flag |
| `/api/admin/colleges` | GET, POST | ALLOW | DENY | DENY | DENY | Academic institution structure |
| `/api/admin/departments` | GET, POST | ALLOW | DENY | DENY | DENY | Department management |
| `/api/admin/academic-years` | GET, POST | ALLOW | DENY | DENY | DENY | Academic year cohorts |
| `/api/admin/semesters` | GET, POST | ALLOW | DENY | DENY | DENY | Semester configurations |
| `/api/admin/classes` | GET, POST | ALLOW | DENY | DENY | DENY | Class & section provisioning |
| `/api/admin/subjects` | GET, POST | ALLOW | DENY | DENY | DENY | Course catalogue |
| `/api/admin/teacher-assignments` | GET, POST, DELETE | ALLOW | DENY | DENY | DENY | Faculty course & class assignments |
| `/api/admin/marksheets/upload` | POST | ALLOW | DENY | DENY | DENY | Single PDF marksheet processing |
| `/api/admin/marksheets/upload-zip` | POST | ALLOW | DENY | DENY | DENY | Batch ZIP marksheet processing |
| `/api/admin/teachers/:id/analytics-visibility` | GET, PATCH | ALLOW | DENY | DENY | DENY | 6-toggle visibility per teacher |
| `/api/admin/placement/:id/analytics-visibility` | GET, PATCH | ALLOW | DENY | DENY | DENY | 6-toggle visibility per placement officer |
| `/api/admin/analytics-visibility/all` | GET | ALLOW | DENY | DENY | DENY | All active visibility flags |
| `/api/admin/github/sync` | POST | ALLOW | DENY | DENY | DENY | Trigger on-demand GitHub sync |
| `/api/admin/leetcode/sync` | POST | ALLOW | DENY | DENY | DENY | Trigger on-demand LeetCode sync |
| `/api/admin/analytics/sync-all` | POST | ALLOW | DENY | DENY | DENY | Trigger full batch synchronization |
| `/api/admin/students/:studentId/full-profile` | GET | ALLOW | DENY | DENY | DENY | Complete student 360 portfolio |
| `/api/admin/notices` | GET, POST, DELETE | ALLOW | DENY | DENY | DENY | Campus-wide announcement broadcasting |
| `/api/admin/events` | GET, POST, DELETE | ALLOW | DENY | DENY | DENY | Calendar event management |
| `/api/admin/audit-logs` | GET | ALLOW | DENY | DENY | DENY | System event and security log inspection |
| **TEACHER ENDPOINTS (`/api/teacher/*`)** | | | | | | |
| `/api/teacher/classes` | GET | DENY | SCOPED | DENY | DENY | Only assigned classes |
| `/api/teacher/classes/:classId/students` | GET | DENY | SCOPED | DENY | DENY | Enrolled students in assigned class |
| `/api/teacher/classes/:classId/subjects/:subjectId/assessments` | GET, POST | DENY | SCOPED | DENY | DENY | Dynamic assessments creation |
| `/api/teacher/assessments/:assessmentId/marks` | GET, POST | DENY | SCOPED | DENY | DENY | Spreadsheet marks entry & update |
| `/api/teacher/classes/:classId/analytics` | GET | DENY | SCOPED | DENY | DENY | Linear regression & grade distribution |
| `/api/teacher/students/:studentId/dossier` | GET | DENY | SCOPED | DENY | DENY | Student dossier (visibility enforced) |
| `/api/teacher/notices` | GET, POST | DENY | ALLOW | DENY | DENY | Class announcement creation |
| **PLACEMENT ENDPOINTS (`/api/placement/*`)** | | | | | | |
| `/api/placement/visibility` | GET | DENY | DENY | ALLOW | DENY | Active permissions for logged-in officer |
| `/api/placement/dashboard` | GET | DENY | DENY | ALLOW | DENY | Candidate directory (visibility enforced) |
| `/api/placement/students/:studentId/full-profile` | GET | DENY | DENY | ALLOW | DENY | Full candidate profile (visibility enforced) |
| **STUDENT ENDPOINTS (`/api/student/*`)** | | | | | | |
| `/api/student/profile` | GET, PUT | DENY | DENY | DENY | SCOPED | Own profile only (`req.user.id`) |
| `/api/student/projects` | GET, POST, PUT, DELETE | DENY | DENY | DENY | SCOPED | Own projects only |
| `/api/student/achievements` | GET, POST, DELETE | DENY | DENY | DENY | SCOPED | Own achievements only |
| `/api/student/certifications` | GET, POST, DELETE | DENY | DENY | DENY | SCOPED | Own certifications only |
| `/api/student/hackathons` | GET, POST, DELETE | DENY | DENY | DENY | SCOPED | Own hackathons only |
| `/api/student/marks` | GET | DENY | DENY | DENY | SCOPED | Own marks only |
| `/api/student/marksheets` | GET | DENY | DENY | DENY | SCOPED | Own official marksheets only |
| `/api/student/documents` | GET, POST, DELETE | DENY | DENY | DENY | SCOPED | Own document vault only |
| `/api/student/posts` | GET, POST, DELETE | DENY | DENY | DENY | ALLOW | Portfolio showcase feed & posts |
| `/api/student/notices` | GET | DENY | DENY | DENY | ALLOW | View broadcast notices |
| `/api/student/notifications` | GET | DENY | DENY | DENY | SCOPED | Own notification alerts |
| `/api/student/notifications/:id/read` | POST | DENY | DENY | DENY | SCOPED | Mark own notification as read |
| **AI ASSISTANT ENDPOINTS (`/api/ai/*`)** | | | | | | |
| `/api/ai/query` | POST | ALLOW | ALLOW | ALLOW | ALLOW | Queries scoped to user's assigned role |
| `/api/ai/feedback` | POST | ALLOW | ALLOW | ALLOW | ALLOW | Submits query accuracy feedback |
