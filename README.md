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

## 🔑 Demo Accounts (All passwords: `password123`)

| Role | Email | Name | Key Context |
| :--- | :--- | :--- | :--- |
| **Admin** | `admin@vision.edu` | Dr. Arthur Vance | Full institution control, marksheet uploader, broadcaster |
| **Teacher** | `teacher@vision.edu` | Prof. Elena Rostova | Assigned to CS-3A (Algorithms & DBMS) & CS-3B |
| **Student** | `student@vision.edu` | Rohan Sharma | Class CS-3A (Roll: CS2023001), 2 semesters of marks |
| **Student (Topper)** | `priya.patel@vision.edu` | Priya Patel | Class CS-3A (Roll: CS2023002), 9.50 CGPA |

---

## 🚀 Local Setup & Installation

### 1. Prerequisites
- Node.js (v18 or higher)
- PostgreSQL (v14 or higher)

### 2. Clone & Install Dependencies
```bash
git clone <repo-url>
cd vision-academy
npm install
```

### 3. Setup PostgreSQL Database
Log in to your local PostgreSQL server via `psql`:
```bash
# Create database
psql -U postgres -c "CREATE DATABASE vision_academy;"

# Execute schema and seed data
psql -U postgres -d vision_academy -f db/schema.sql
psql -U postgres -d vision_academy -f db/seed.sql
```

### 4. Configure Environment Variables
Create a `.env` file in the root directory:
```env
# Server Port
PORT=3000

# PostgreSQL Connection URL
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/vision_academy

# JWT Secret for Session Tokens
JWT_SECRET=vision-academy-secret-key-prod-2026

# Gemini API Key (for tool-grounded AI Assistant)
GEMINI_API_KEY=your_gemini_api_key_here

# S3 Compatible Storage (optional - defaults to local uploads directory)
S3_ENDPOINT=http://localhost:9000
S3_BUCKET=vision-academy
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
```

### 5. Start the Application
```bash
# Runs the full-stack server (Node/Express API + Vite Frontend on http://localhost:3000)
npm run dev
```

The application will be live at `http://localhost:3000`.

---

## 🛠️ Verification & Audit Checklist

- [x] **Backend**: Node.js with Express. No proprietary BaaS lock-in.
- [x] **PostgreSQL Schema**: Defined in `db/schema.sql` with real foreign keys, constraints, and indexes.
- [x] **Demo Seed Data**: Defined in `db/seed.sql`.
- [x] **AI Assistant Grounding**: Function calling against real database queries; audited in `ai_query_logs`.
- [x] **Server-Side Role Scoping**: 403 Forbidden enforced on unassigned teacher classes and unauthorized student records.
