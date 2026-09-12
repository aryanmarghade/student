-- =========================================================
-- Vision Academy — PostgreSQL Database Schema
-- File: db/schema.sql
-- =========================================================

-- Enable UUID extension if needed
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. USERS TABLE
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(64) PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(32) NOT NULL CHECK (role IN ('admin', 'teacher', 'student')),
    full_name VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- 2. COLLEGES & DEPARTMENTS
CREATE TABLE IF NOT EXISTS colleges (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(64) UNIQUE NOT NULL,
    address TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS departments (
    id VARCHAR(64) PRIMARY KEY,
    college_id VARCHAR(64) REFERENCES colleges(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(64) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. ACADEMIC YEARS & SEMESTERS
CREATE TABLE IF NOT EXISTS academic_years (
    id VARCHAR(64) PRIMARY KEY,
    year_name VARCHAR(64) NOT NULL, -- e.g. "2024-2025"
    is_current BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS semesters (
    id VARCHAR(64) PRIMARY KEY,
    academic_year_id VARCHAR(64) REFERENCES academic_years(id) ON DELETE CASCADE,
    semester_number INT NOT NULL,
    name VARCHAR(128) NOT NULL, -- e.g. "Semester 1", "Semester 2", "Semester 3"
    is_active BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_semesters_academic_year ON semesters(academic_year_id);

-- 4. CLASSES
CREATE TABLE IF NOT EXISTS classes (
    id VARCHAR(64) PRIMARY KEY,
    department_id VARCHAR(64) REFERENCES departments(id) ON DELETE CASCADE,
    academic_year_id VARCHAR(64) REFERENCES academic_years(id) ON DELETE SET NULL,
    name VARCHAR(128) NOT NULL, -- e.g. "CS-3A", "EE-2B"
    year INT NOT NULL,          -- e.g. 1, 2, 3, 4
    section VARCHAR(16) NOT NULL, -- e.g. "A", "B"
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_classes_dept ON classes(department_id);

-- 5. SUBJECTS
CREATE TABLE IF NOT EXISTS subjects (
    id VARCHAR(64) PRIMARY KEY,
    department_id VARCHAR(64) REFERENCES departments(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(64) NOT NULL, -- e.g. "CS301"
    max_marks INT NOT NULL DEFAULT 100,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_subjects_dept ON subjects(department_id);

-- 6. STUDENTS (linked to users)
CREATE TABLE IF NOT EXISTS students (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    roll_number VARCHAR(64) UNIQUE NOT NULL,
    class_id VARCHAR(64) REFERENCES classes(id) ON DELETE SET NULL,
    department_id VARCHAR(64) REFERENCES departments(id) ON DELETE SET NULL,
    linkedin_url TEXT,
    github_url TEXT,
    profile_photo_url TEXT,
    resume_url TEXT,
    bio TEXT,
    profile_strength INT DEFAULT 20,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_students_user_id ON students(user_id);
CREATE INDEX IF NOT EXISTS idx_students_class_id ON students(class_id);
CREATE INDEX IF NOT EXISTS idx_students_roll_number ON students(roll_number);

-- 7. STUDENT DOCUMENTS (Resumes, Certificates, etc.)
CREATE TABLE IF NOT EXISTS student_documents (
    id VARCHAR(64) PRIMARY KEY,
    student_id VARCHAR(64) REFERENCES students(id) ON DELETE CASCADE,
    doc_type VARCHAR(64) NOT NULL, -- e.g. 'resume', 'marksheet_submission', 'certificate'
    file_url TEXT NOT NULL,
    file_name VARCHAR(255),
    parsed_headings JSONB DEFAULT '{}',
    status VARCHAR(64) DEFAULT 'processed',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_student_documents_student ON student_documents(student_id);

-- 8. TEACHER CLASS ASSIGNMENTS (Single source of truth for Teacher authorization)
CREATE TABLE IF NOT EXISTS teacher_class_assignments (
    id VARCHAR(64) PRIMARY KEY,
    teacher_user_id VARCHAR(64) REFERENCES users(id) ON DELETE CASCADE,
    class_id VARCHAR(64) REFERENCES classes(id) ON DELETE CASCADE,
    subject_id VARCHAR(64) REFERENCES subjects(id) ON DELETE CASCADE,
    semester_id VARCHAR(64) REFERENCES semesters(id) ON DELETE CASCADE,
    status VARCHAR(32) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'past')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tca_teacher ON teacher_class_assignments(teacher_user_id);
CREATE INDEX IF NOT EXISTS idx_tca_lookup ON teacher_class_assignments(teacher_user_id, class_id, subject_id, semester_id, status);

-- 9. MARKS
CREATE TABLE IF NOT EXISTS marks (
    id VARCHAR(64) PRIMARY KEY,
    student_id VARCHAR(64) REFERENCES students(id) ON DELETE CASCADE,
    subject_id VARCHAR(64) REFERENCES subjects(id) ON DELETE CASCADE,
    semester_id VARCHAR(64) REFERENCES semesters(id) ON DELETE CASCADE,
    teacher_user_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
    exam_type VARCHAR(64) NOT NULL CHECK (exam_type IN ('Internal 1', 'Internal 2', 'Midterm', 'Final', 'Assignment', 'Practical')),
    marks_obtained NUMERIC(5, 2) NOT NULL,
    max_marks NUMERIC(5, 2) NOT NULL DEFAULT 100,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_marks_student ON marks(student_id);
CREATE INDEX IF NOT EXISTS idx_marks_subject_semester ON marks(subject_id, semester_id);
CREATE INDEX IF NOT EXISTS idx_marks_student_semester ON marks(student_id, semester_id);

-- 10. MARKSHEETS (Official documents uploaded by admin)
CREATE TABLE IF NOT EXISTS marksheets (
    id VARCHAR(64) PRIMARY KEY,
    student_id VARCHAR(64) REFERENCES students(id) ON DELETE CASCADE,
    semester_id VARCHAR(64) REFERENCES semesters(id) ON DELETE CASCADE,
    file_url TEXT NOT NULL,
    file_name VARCHAR(255),
    sgpa NUMERIC(4, 2),
    cgpa NUMERIC(4, 2),
    uploaded_by VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_marksheets_student ON marksheets(student_id);

-- 11. NOTIFICATIONS
CREATE TABLE IF NOT EXISTS notifications (
    id VARCHAR(64) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    target_role VARCHAR(32) NOT NULL DEFAULT 'all' CHECK (target_role IN ('all', 'all_students', 'all_teachers', 'class')),
    target_class_id VARCHAR(64) REFERENCES classes(id) ON DELETE SET NULL,
    file_url TEXT,
    created_by VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notifications_target ON notifications(target_role, target_class_id);

-- 12. NOTIFICATION READS
CREATE TABLE IF NOT EXISTS notification_reads (
    id VARCHAR(64) PRIMARY KEY,
    notification_id VARCHAR(64) REFERENCES notifications(id) ON DELETE CASCADE,
    user_id VARCHAR(64) REFERENCES users(id) ON DELETE CASCADE,
    read_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_notification_user UNIQUE (notification_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_notif_reads_user ON notification_reads(user_id);

-- 13. AI QUERY LOGS (Audit trail for all AI assistant tool interactions)
CREATE TABLE IF NOT EXISTS ai_query_logs (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) REFERENCES users(id) ON DELETE CASCADE,
    query_text TEXT NOT NULL,
    resolved_intent VARCHAR(128) NOT NULL,
    response_summary TEXT,
    tool_calls JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ai_query_logs_user ON ai_query_logs(user_id);
