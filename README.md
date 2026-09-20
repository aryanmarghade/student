# Vision Academy — Student Profile & Academic Analytics Platform

An institutional-grade college Student Profile & Academic Analytics Platform engineered with a full-stack architecture (React, Node.js/Express, and PostgreSQL).

---

## 🏛️ System Features & Security Model

1. **Role-Based Portals & Server-Side Security**:
   - **Admin**: College-wide analytics, manage classes, departments, subjects, teacher assignments, CSV bulk user import, password resets, user activation, upload official marksheets, and targeted broadcast notifications.
   - **Teacher**: Restricted strictly by `teacher_class_assignments`. The backend enforces that teachers can ONLY access students, marks, and classes assigned to them (returning HTTP 403 otherwise). Includes spreadsheet-style mark entry grids, analytics with linear regression next-semester score prediction, CSV/PNG exports, and tool-grounded AI assistant.
   - **Student**: Hard-locked to authenticated user's ID. Profile editing (bio, LinkedIn, GitHub with URL validation), photo and resume upload with automatic heuristic section parser (Education, Skills, Projects, Experience, Certifications), live Profile Strength indicator, marksheet viewer with SGPA/CGPA charts, notification inbox, and private AI assistant.
2. **AI Assistant with Function-Calling**:
   - Built with Google Gemini (`@google/genai` `gemini-3.8-flash`) using tool declarations (`get_class_topper`, `get_student_average`, `predict_next_score`, `get_struggling_students`, `get_student_academic_summary`).
   - Every answer is grounded in queries executed against the database; the AI refuses to fabricate numbers or answer outside the user's authorized role scope.
   - Every assistant query is audited in the `ai_query_logs` table.
3. **Database Architecture**:
   - Native PostgreSQL support using pure `.sql` schema (`db/schema.sql`) and seed data (`db/seed.sql`).
   - Integrated dual-mode database client: Connects directly to any PostgreSQL instance via `DATABASE_URL`, with an embedded in-memory SQL storage engine so the app is immediately previewable in container environments out of the box!

---

