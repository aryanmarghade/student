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
    role VARCHAR(32) NOT NULL CHECK (role IN ('admin', 'teacher', 'student', 'placement')),
    full_name VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_reset_password BOOLEAN DEFAULT FALSE;

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
    hackerrank_url TEXT,
    portfolio_url TEXT,
    profile_photo_url TEXT,
    resume_url TEXT,
    bio TEXT,
    profile_strength INT DEFAULT 20,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE students ADD COLUMN IF NOT EXISTS hackerrank_url TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS portfolio_url TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS github_data JSONB;
ALTER TABLE students ADD COLUMN IF NOT EXISTS github_synced_at TIMESTAMP WITH TIME ZONE;

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
ALTER TABLE student_documents ADD COLUMN IF NOT EXISTS title VARCHAR(255);
ALTER TABLE student_documents ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE student_documents ADD COLUMN IF NOT EXISTS category VARCHAR(64) DEFAULT 'Other';

CREATE INDEX IF NOT EXISTS idx_student_documents_student ON student_documents(student_id);

CREATE TABLE IF NOT EXISTS projects (
    id VARCHAR(64) PRIMARY KEY,
    student_id VARCHAR(64) NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    technologies JSONB NOT NULL DEFAULT '[]',
    github_url TEXT,
    live_url TEXT,
    date DATE,
    team_members JSONB NOT NULL DEFAULT '[]',
    image_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_projects_student ON projects(student_id);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS verification_status VARCHAR(64) DEFAULT 'Student Submitted';

CREATE TABLE IF NOT EXISTS achievements (
    id VARCHAR(64) PRIMARY KEY,
    student_id VARCHAR(64) NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    organization VARCHAR(255) NOT NULL,
    date DATE,
    link TEXT,
    certificate_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_achievements_student ON achievements(student_id);
ALTER TABLE achievements ADD COLUMN IF NOT EXISTS verification_status VARCHAR(64) DEFAULT 'Student Submitted';

CREATE TABLE IF NOT EXISTS certifications (
    id VARCHAR(64) PRIMARY KEY,
    student_id VARCHAR(64) NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    issuer VARCHAR(255) NOT NULL,
    issue_date DATE,
    credential_id VARCHAR(255),
    credential_url TEXT,
    certificate_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_certifications_student ON certifications(student_id);
ALTER TABLE certifications ADD COLUMN IF NOT EXISTS verification_status VARCHAR(64) DEFAULT 'Student Submitted';

CREATE TABLE IF NOT EXISTS hackathons (
    id VARCHAR(64) PRIMARY KEY,
    student_id VARCHAR(64) NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    organizer VARCHAR(255) NOT NULL,
    date DATE,
    position_result VARCHAR(255),
    team_name VARCHAR(255),
    project_name VARCHAR(255),
    project_description TEXT,
    github_url TEXT,
    demo_url TEXT,
    certificate_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_hackathons_student ON hackathons(student_id);
ALTER TABLE hackathons ADD COLUMN IF NOT EXISTS verification_status VARCHAR(64) DEFAULT 'Student Submitted';

CREATE TABLE IF NOT EXISTS events (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    organizer VARCHAR(255) NOT NULL,
    event_date DATE NOT NULL,
    registration_deadline DATE,
    location VARCHAR(255) NOT NULL,
    registration_link TEXT,
    banner_url TEXT,
    eligibility TEXT NOT NULL DEFAULT 'All Students',
    status VARCHAR(32) NOT NULL DEFAULT 'upcoming',
    created_by VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

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
CREATE UNIQUE INDEX IF NOT EXISTS uq_tca_active_assignment ON teacher_class_assignments (teacher_user_id, class_id, subject_id, semester_id) WHERE status = 'active';

-- 9. MARKS
CREATE TABLE IF NOT EXISTS marks (
    id VARCHAR(64) PRIMARY KEY,
    student_id VARCHAR(64) REFERENCES students(id) ON DELETE CASCADE,
    class_id VARCHAR(64) REFERENCES classes(id) ON DELETE CASCADE,
    subject_id VARCHAR(64) REFERENCES subjects(id) ON DELETE CASCADE,
    semester_id VARCHAR(64) REFERENCES semesters(id) ON DELETE CASCADE,
    teacher_user_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
    exam_type VARCHAR(64) NOT NULL,
    marks_obtained NUMERIC(5, 2) NOT NULL,
    max_marks NUMERIC(5, 2) NOT NULL DEFAULT 100,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_marks_student ON marks(student_id);
CREATE INDEX IF NOT EXISTS idx_marks_class_subject_semester ON marks(class_id, subject_id, semester_id);
CREATE INDEX IF NOT EXISTS idx_marks_subject_semester ON marks(subject_id, semester_id);
CREATE INDEX IF NOT EXISTS idx_marks_student_semester ON marks(student_id, semester_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_marks_student_class_subject_semester_exam ON marks(student_id, class_id, subject_id, semester_id, exam_type);

-- 9.1 ASSESSMENT DEFINITIONS (Dynamic, teacher-created assessments)
CREATE TABLE IF NOT EXISTS assessment_definitions (
    id VARCHAR(64) PRIMARY KEY,
    class_id VARCHAR(64) REFERENCES classes(id) ON DELETE CASCADE,
    subject_id VARCHAR(64) REFERENCES subjects(id) ON DELETE CASCADE,
    semester_id VARCHAR(64) REFERENCES semesters(id) ON DELETE CASCADE,
    teacher_user_id VARCHAR(64) REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(128) NOT NULL,
    max_marks NUMERIC(5, 2) NOT NULL CHECK (max_marks > 0),
    assessment_type VARCHAR(64) NOT NULL DEFAULT 'Other' CHECK (assessment_type IN ('Internal', 'Mid Sem', 'Final', 'Assignment', 'Practical', 'Other')),
    status VARCHAR(32) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_assessment_definition UNIQUE (class_id, subject_id, semester_id, title)
);

CREATE INDEX IF NOT EXISTS idx_assessment_definitions_scope ON assessment_definitions(class_id, subject_id, semester_id, status);

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

CREATE TABLE IF NOT EXISTS audit_logs (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(128) NOT NULL,
    entity_type VARCHAR(128) NOT NULL,
    entity_id VARCHAR(64),
    details TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);

-- 14. POSTS
CREATE TABLE IF NOT EXISTS posts (
    id VARCHAR(64) PRIMARY KEY,
    student_id VARCHAR(64) NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    category VARCHAR(64) NOT NULL,
    tags JSONB NOT NULL DEFAULT '[]',
    external_link TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_posts_student ON posts(student_id);

-- 15. POST ATTACHMENTS
CREATE TABLE IF NOT EXISTS post_attachments (
    id VARCHAR(64) PRIMARY KEY,
    post_id VARCHAR(64) NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    file_url TEXT NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_type VARCHAR(64) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_post_attachments_post ON post_attachments(post_id);

-- 16. STUDENT GITHUB MONTHLY SNAPSHOTS
-- One row per student per month (YYYY-MM). Historical rows are NEVER overwritten.
-- Idempotent upsert via ON CONFLICT (student_id, snapshot_month) DO UPDATE.
CREATE TABLE IF NOT EXISTS student_github_snapshots (
    id VARCHAR(64) PRIMARY KEY,
    student_id VARCHAR(64) NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    github_username VARCHAR(255) NOT NULL,
    snapshot_month VARCHAR(7) NOT NULL,          -- YYYY-MM  e.g. '2026-09'
    synced_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    public_repos INT,                            -- from GET /users/{username}
    total_stars INT,                             -- sum of stargazers_count across repos
    total_forks INT,                             -- sum of forks_count across repos
    followers INT,                               -- from GET /users/{username}
    languages JSONB DEFAULT '[]',               -- unique languages across repos
    top_repos JSONB DEFAULT '[]',               -- top 5 repos (name, url, stars, language)
    total_contributions INT,                     -- NULL unless GITHUB_TOKEN is set (GraphQL)
    raw_data JSONB,                              -- full GitHub API response for auditability
    sync_status VARCHAR(32) NOT NULL DEFAULT 'synced'
        CHECK (sync_status IN ('synced', 'failed', 'not_synced')),
    error_message TEXT,                          -- populated when sync_status = 'failed'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_student_github_snapshot_month UNIQUE (student_id, snapshot_month)
);

CREATE INDEX IF NOT EXISTS idx_github_snapshots_student ON student_github_snapshots(student_id);
CREATE INDEX IF NOT EXISTS idx_github_snapshots_month ON student_github_snapshots(snapshot_month);
CREATE INDEX IF NOT EXISTS idx_github_snapshots_status ON student_github_snapshots(sync_status);

-- 16a. STUDENT LINKEDIN MONTHLY SNAPSHOTS
CREATE TABLE IF NOT EXISTS student_linkedin_snapshots (
    id VARCHAR(64) PRIMARY KEY,
    student_id VARCHAR(64) NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    linkedin_url VARCHAR(255) NOT NULL,
    snapshot_month VARCHAR(7) NOT NULL,          -- YYYY-MM
    synced_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    connections INT,
    posts_count INT,
    followers INT,
    raw_data JSONB,
    sync_status VARCHAR(32) NOT NULL DEFAULT 'synced'
        CHECK (sync_status IN ('synced', 'failed', 'not_synced')),
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_student_linkedin_snapshot_month UNIQUE (student_id, snapshot_month)
);

CREATE INDEX IF NOT EXISTS idx_linkedin_snapshots_student ON student_linkedin_snapshots(student_id);
CREATE INDEX IF NOT EXISTS idx_linkedin_snapshots_month ON student_linkedin_snapshots(snapshot_month);
CREATE INDEX IF NOT EXISTS idx_linkedin_snapshots_status ON student_linkedin_snapshots(sync_status);

-- 16b. STUDENT HACKERRANK MONTHLY SNAPSHOTS
CREATE TABLE IF NOT EXISTS student_hackerrank_snapshots (
    id VARCHAR(64) PRIMARY KEY,
    student_id VARCHAR(64) NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    hackerrank_username VARCHAR(255) NOT NULL,
    snapshot_month VARCHAR(7) NOT NULL,          -- YYYY-MM
    synced_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    badges_count INT,
    verified_skills JSONB DEFAULT '[]',
    raw_data JSONB,
    sync_status VARCHAR(32) NOT NULL DEFAULT 'synced'
        CHECK (sync_status IN ('synced', 'failed', 'not_synced')),
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_student_hackerrank_snapshot_month UNIQUE (student_id, snapshot_month)
);

CREATE INDEX IF NOT EXISTS idx_hackerrank_snapshots_student ON student_hackerrank_snapshots(student_id);
CREATE INDEX IF NOT EXISTS idx_hackerrank_snapshots_month ON student_hackerrank_snapshots(snapshot_month);
CREATE INDEX IF NOT EXISTS idx_hackerrank_snapshots_status ON student_hackerrank_snapshots(sync_status);

-- 17. TEACHER ANALYTICS VISIBILITY SETTINGS
-- A row per teacher controlling what data is exposed in Teacher Analytics.
CREATE TABLE IF NOT EXISTS teacher_analytics_visibility (
    teacher_user_id VARCHAR(64) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    github_enabled BOOLEAN DEFAULT TRUE,
    linkedin_enabled BOOLEAN DEFAULT TRUE,
    hackerrank_enabled BOOLEAN DEFAULT TRUE,
    hackathon_enabled BOOLEAN DEFAULT TRUE,
    academic_enabled BOOLEAN DEFAULT TRUE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_by VARCHAR(64) REFERENCES users(id) ON DELETE SET NULL
);
