-- =========================================================
-- Vission Academy — Local Development Sample Dataset
-- File: scripts/seed-dev.sql
-- NOTICE: FOR LOCAL DEVELOPMENT AND TESTING ONLY.
-- Production deployment starts completely blank from zero.
-- =========================================================

-- 1. Development Sample Faculty
-- Password for all dev accounts: password123
-- Hash: $2b$10$KtXAd/5CAjIrM70KIKO..expd548nXRI3xZM8.ycfT9Pz71AZSwVu

INSERT INTO users (id, email, password_hash, role, full_name, is_active, must_reset_password)
VALUES
('usr_teach_01', 'teacher@vissionacademy.edu', '$2b$10$KtXAd/5CAjIrM70KIKO..expd548nXRI3xZM8.ycfT9Pz71AZSwVu', 'teacher', 'Prof. Elena Rostova', true, false),
('usr_teach_02', 'prof.chen@vissionacademy.edu', '$2b$10$KtXAd/5CAjIrM70KIKO..expd548nXRI3xZM8.ycfT9Pz71AZSwVu', 'teacher', 'Prof. Wei Chen', true, false)
ON CONFLICT (id) DO NOTHING;

-- 2. Development Sample Students
INSERT INTO users (id, email, password_hash, role, full_name, is_active, must_reset_password)
VALUES
('usr_stud_01', 'student@vissionacademy.edu', '$2b$10$KtXAd/5CAjIrM70KIKO..expd548nXRI3xZM8.ycfT9Pz71AZSwVu', 'student', 'Rohan Sharma', true, false),
('usr_stud_02', 'ananya.iyer@vissionacademy.edu', '$2b$10$KtXAd/5CAjIrM70KIKO..expd548nXRI3xZM8.ycfT9Pz71AZSwVu', 'student', 'Ananya Iyer', true, false),
('usr_stud_03', 'marcus.vance@vissionacademy.edu', '$2b$10$KtXAd/5CAjIrM70KIKO..expd548nXRI3xZM8.ycfT9Pz71AZSwVu', 'student', 'Marcus Vance', true, false)
ON CONFLICT (id) DO NOTHING;

-- 3. Development Sample Class
INSERT INTO classes (id, department_id, academic_year_id, name, year, section)
VALUES
('cls_cs3a', 'dept_cs', 'ay_2025', 'CS-3A', 3, 'A')
ON CONFLICT (id) DO NOTHING;

-- 4. Development Sample Subjects
INSERT INTO subjects (id, department_id, name, code, max_marks)
VALUES
('sbj_algo', 'dept_cs', 'Design & Analysis of Algorithms', 'CS301', 100),
('sbj_os', 'dept_cs', 'Operating Systems & Concurrency', 'CS302', 100),
('sbj_dbms', 'dept_cs', 'Database Management Systems', 'CS303', 100)
ON CONFLICT (id) DO NOTHING;

-- 5. Link Students
INSERT INTO students (id, user_id, roll_number, class_id, department_id, linkedin_url, github_url, bio, profile_strength)
VALUES
('std_01', 'usr_stud_01', 'CS2023001', 'cls_cs3a', 'dept_cs', 'https://linkedin.com/in/rohan-sharma-va', 'https://github.com/rohansharma-dev', 'Third-year CSE student passionate about distributed systems.', 85),
('std_02', 'usr_stud_02', 'CS2023002', 'cls_cs3a', 'dept_cs', 'https://linkedin.com/in/ananya-iyer-va', 'https://github.com/ananyaiyer-code', 'Algorithms researcher and competitive programmer.', 90),
('std_03', 'usr_stud_03', 'CS2023003', 'cls_cs3a', 'dept_cs', 'https://linkedin.com/in/marcus-vance-va', 'https://github.com/marcusvance-eng', 'Cloud systems and security engineering enthusiast.', 75)
ON CONFLICT (id) DO NOTHING;

-- 6. Teacher Assignment
INSERT INTO teacher_class_assignments (id, teacher_user_id, class_id, subject_id, semester_id, status)
VALUES
('tca_01', 'usr_teach_01', 'cls_cs3a', 'sbj_algo', 'sem_01', 'active'),
('tca_02', 'usr_teach_01', 'cls_cs3a', 'sbj_os', 'sem_01', 'active'),
('tca_03', 'usr_teach_02', 'cls_cs3a', 'sbj_dbms', 'sem_01', 'active')
ON CONFLICT (id) DO NOTHING;
