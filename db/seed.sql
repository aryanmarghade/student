-- =========================================================
-- Vision Academy — PostgreSQL Seed Data
-- File: db/seed.sql
-- Default password for all demo accounts: password123
-- (Bcrypt hash: $2a$10$qR6qU/h9M50V1V8G0mUqDe6gY6eM8kF6/9pEre1F9Vl3Y8I4W3cWy)
-- =========================================================

-- 1. USERS
INSERT INTO users (id, email, password_hash, role, full_name, is_active) VALUES
('usr_admin_01', 'admin@vision.edu', '$2a$10$qR6qU/h9M50V1V8G0mUqDe6gY6eM8kF6/9pEre1F9Vl3Y8I4W3cWy', 'admin', 'Dr. Arthur Vance', true),
('usr_teach_01', 'teacher@vision.edu', '$2a$10$qR6qU/h9M50V1V8G0mUqDe6gY6eM8kF6/9pEre1F9Vl3Y8I4W3cWy', 'teacher', 'Prof. Elena Rostova', true),
('usr_teach_02', 'prof.chen@vision.edu', '$2a$10$qR6qU/h9M50V1V8G0mUqDe6gY6eM8kF6/9pEre1F9Vl3Y8I4W3cWy', 'teacher', 'Prof. Wei Chen', true),
('usr_stud_01', 'student@vision.edu', '$2a$10$qR6qU/h9M50V1V8G0mUqDe6gY6eM8kF6/9pEre1F9Vl3Y8I4W3cWy', 'student', 'Rohan Sharma', true),
('usr_stud_02', 'priya.patel@vision.edu', '$2a$10$qR6qU/h9M50V1V8G0mUqDe6gY6eM8kF6/9pEre1F9Vl3Y8I4W3cWy', 'student', 'Priya Patel', true),
('usr_stud_03', 'marcus.chen@vision.edu', '$2a$10$qR6qU/h9M50V1V8G0mUqDe6gY6eM8kF6/9pEre1F9Vl3Y8I4W3cWy', 'student', 'Marcus Chen', true),
('usr_stud_04', 'ananya.iyer@vision.edu', '$2a$10$qR6qU/h9M50V1V8G0mUqDe6gY6eM8kF6/9pEre1F9Vl3Y8I4W3cWy', 'student', 'Ananya Iyer', true),
('usr_stud_05', 'david.miller@vision.edu', '$2a$10$qR6qU/h9M50V1V8G0mUqDe6gY6eM8kF6/9pEre1F9Vl3Y8I4W3cWy', 'student', 'David Miller', true)
ON CONFLICT (id) DO NOTHING;

-- 2. COLLEGES & DEPARTMENTS
INSERT INTO colleges (id, name, code, address) VALUES
('col_01', 'Vision Academy of Engineering & Technology', 'VAET', '100 University Crest Blvd, Tech Campus')
ON CONFLICT (id) DO NOTHING;

INSERT INTO departments (id, college_id, name, code) VALUES
('dept_cs', 'col_01', 'Computer Science & Engineering', 'CSE'),
('dept_ee', 'col_01', 'Electrical & Electronics Engineering', 'EEE'),
('dept_me', 'col_01', 'Mechanical Engineering', 'ME')
ON CONFLICT (id) DO NOTHING;

-- 3. ACADEMIC YEARS & SEMESTERS
INSERT INTO academic_years (id, year_name, is_current) VALUES
('ay_2023_24', '2023-2024', false),
('ay_2024_25', '2024-2025', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO semesters (id, academic_year_id, semester_number, name, is_active) VALUES
('sem_3', 'ay_2024_25', 3, 'Semester 3 (Fall 2024)', false),
('sem_4', 'ay_2024_25', 4, 'Semester 4 (Spring 2025)', true),
('sem_5', 'ay_2024_25', 5, 'Semester 5 (Upcoming)', false)
ON CONFLICT (id) DO NOTHING;

-- 4. CLASSES
INSERT INTO classes (id, department_id, academic_year_id, name, year, section) VALUES
('cls_cs3a', 'dept_cs', 'ay_2024_25', 'CS-3A', 3, 'A'),
('cls_cs3b', 'dept_cs', 'ay_2024_25', 'CS-3B', 3, 'B'),
('cls_ee2a', 'dept_ee', 'ay_2024_25', 'EE-2A', 2, 'A')
ON CONFLICT (id) DO NOTHING;

-- 5. SUBJECTS
INSERT INTO subjects (id, department_id, name, code, max_marks) VALUES
('sub_algo', 'dept_cs', 'Design & Analysis of Algorithms', 'CS301', 100),
('sub_dbms', 'dept_cs', 'Database Management Systems', 'CS302', 100),
('sub_os', 'dept_cs', 'Operating Systems & Concurrency', 'CS303', 100),
('sub_cn', 'dept_cs', 'Computer Networks & Security', 'CS304', 100),
('sub_ml', 'dept_cs', 'Applied Machine Learning', 'CS401', 100)
ON CONFLICT (id) DO NOTHING;

-- 6. STUDENTS
INSERT INTO students (id, user_id, roll_number, class_id, department_id, linkedin_url, github_url, bio, profile_strength) VALUES
('std_01', 'usr_stud_01', 'CS2023001', 'cls_cs3a', 'dept_cs', 'https://linkedin.com/in/rohan-sharma-va', 'https://github.com/rohansharma-dev', 'Third-year CSE student passionate about distributed systems, cloud computing, and algorithmic optimization.', 92),
('std_02', 'usr_stud_02', 'CS2023002', 'cls_cs3a', 'dept_cs', 'https://linkedin.com/in/priya-patel', 'https://github.com/priyapatel-code', 'Undergraduate researcher in Machine Learning and Computer Vision. Dean honors recipient.', 85),
('std_03', 'usr_stud_03', 'CS2023003', 'cls_cs3a', 'dept_cs', 'https://linkedin.com/in/marcus-chen', 'https://github.com/mchen-dev', 'Full-stack software enthusiast and competitive programmer.', 78),
('std_04', 'usr_stud_04', 'CS2023004', 'cls_cs3a', 'dept_cs', 'https://linkedin.com/in/ananya-iyer', 'https://github.com/ananya-iyer', 'Cybersecurity enthusiast, club lead at Vision Academy ACM Student Chapter.', 88),
('std_05', 'usr_stud_05', 'CS2023005', 'cls_cs3a', 'dept_cs', '', '', 'Student of Computer Science, interested in robotics and embedded systems.', 45)
ON CONFLICT (id) DO NOTHING;

-- 7. STUDENT DOCUMENTS
INSERT INTO student_documents (id, student_id, doc_type, file_url, file_name, parsed_headings, status) VALUES
('doc_01', 'std_01', 'resume', '/uploads/resumes/rohan_sharma_resume.pdf', 'Rohan_Sharma_Resume.pdf', 
 '{"Education": ["B.Tech in Computer Science & Engineering - Vision Academy (CGPA: 8.85/10)", "Senior Secondary Certificate - Apex High School (94.6%)"], "Skills": ["TypeScript", "Node.js", "Python", "PostgreSQL", "React", "Docker", "Algorithms & Data Structures"], "Projects": ["Vision Cloud Engine - Distributed key-value cache", "Campus Connect - Peer tutoring network"], "Experience": ["Software Engineering Intern - AlphaTech Labs (Summer 2024)"], "Certifications": ["AWS Certified Cloud Practitioner", "HackerRank Problem Solving 5 Stars"]}'::jsonb,
 'processed')
ON CONFLICT (id) DO NOTHING;

-- 8. TEACHER CLASS ASSIGNMENTS
-- Prof. Elena Rostova is assigned to CS-3A (Algorithms) and CS-3A (Database Systems) for Semester 4 (Active),
-- plus a historical assignment for Semester 3 (Past).
INSERT INTO teacher_class_assignments (id, teacher_user_id, class_id, subject_id, semester_id, status) VALUES
('tca_01', 'usr_teach_01', 'cls_cs3a', 'sub_algo', 'sem_4', 'active'),
('tca_02', 'usr_teach_01', 'cls_cs3a', 'sub_dbms', 'sem_4', 'active'),
('tca_03', 'usr_teach_01', 'cls_cs3b', 'sub_algo', 'sem_4', 'active'),
('tca_04', 'usr_teach_01', 'cls_cs3a', 'sub_os', 'sem_3', 'past'),
('tca_05', 'usr_teach_02', 'cls_cs3a', 'sub_cn', 'sem_4', 'active')
ON CONFLICT (id) DO NOTHING;

-- 9. MARKS
-- Realistic academic performance across exams for students in Semester 3 & 4
INSERT INTO marks (id, student_id, subject_id, semester_id, teacher_user_id, exam_type, marks_obtained, max_marks) VALUES
-- Rohan Sharma (Semester 3)
('mrk_01', 'std_01', 'sub_os', 'sem_3', 'usr_teach_01', 'Internal 1', 23.5, 25),
('mrk_02', 'std_01', 'sub_os', 'sem_3', 'usr_teach_01', 'Internal 2', 24.0, 25),
('mrk_03', 'std_01', 'sub_os', 'sem_3', 'usr_teach_01', 'Midterm', 45.0, 50),
('mrk_04', 'std_01', 'sub_os', 'sem_3', 'usr_teach_01', 'Final', 88.0, 100),
('mrk_05', 'std_01', 'sub_os', 'sem_3', 'usr_teach_01', 'Assignment', 19.0, 20),
('mrk_06', 'std_01', 'sub_os', 'sem_3', 'usr_teach_01', 'Practical', 28.5, 30),

-- Rohan Sharma (Semester 4 - Algorithms)
('mrk_07', 'std_01', 'sub_algo', 'sem_4', 'usr_teach_01', 'Internal 1', 24.0, 25),
('mrk_08', 'std_01', 'sub_algo', 'sem_4', 'usr_teach_01', 'Internal 2', 23.0, 25),
('mrk_09', 'std_01', 'sub_algo', 'sem_4', 'usr_teach_01', 'Midterm', 46.5, 50),
('mrk_10', 'std_01', 'sub_algo', 'sem_4', 'usr_teach_01', 'Final', 91.0, 100),
('mrk_11', 'std_01', 'sub_algo', 'sem_4', 'usr_teach_01', 'Assignment', 20.0, 20),
('mrk_12', 'std_01', 'sub_algo', 'sem_4', 'usr_teach_01', 'Practical', 29.0, 30),

-- Priya Patel (Semester 4 - Algorithms - Class Topper)
('mrk_13', 'std_02', 'sub_algo', 'sem_4', 'usr_teach_01', 'Internal 1', 25.0, 25),
('mrk_14', 'std_02', 'sub_algo', 'sem_4', 'usr_teach_01', 'Internal 2', 25.0, 25),
('mrk_15', 'std_02', 'sub_algo', 'sem_4', 'usr_teach_01', 'Midterm', 49.0, 50),
('mrk_16', 'std_02', 'sub_algo', 'sem_4', 'usr_teach_01', 'Final', 96.0, 100),
('mrk_17', 'std_02', 'sub_algo', 'sem_4', 'usr_teach_01', 'Assignment', 20.0, 20),
('mrk_18', 'std_02', 'sub_algo', 'sem_4', 'usr_teach_01', 'Practical', 30.0, 30),

-- Marcus Chen (Semester 4 - Algorithms)
('mrk_19', 'std_03', 'sub_algo', 'sem_4', 'usr_teach_01', 'Internal 1', 21.0, 25),
('mrk_20', 'std_03', 'sub_algo', 'sem_4', 'usr_teach_01', 'Internal 2', 20.5, 25),
('mrk_21', 'std_03', 'sub_algo', 'sem_4', 'usr_teach_01', 'Midterm', 41.0, 50),
('mrk_22', 'std_03', 'sub_algo', 'sem_4', 'usr_teach_01', 'Final', 82.0, 100),
('mrk_23', 'std_03', 'sub_algo', 'sem_4', 'usr_teach_01', 'Assignment', 18.0, 20),
('mrk_24', 'std_03', 'sub_algo', 'sem_4', 'usr_teach_01', 'Practical', 26.0, 30),

-- Ananya Iyer (Semester 4 - Algorithms)
('mrk_25', 'std_04', 'sub_algo', 'sem_4', 'usr_teach_01', 'Internal 1', 23.0, 25),
('mrk_26', 'std_04', 'sub_algo', 'sem_4', 'usr_teach_01', 'Internal 2', 24.0, 25),
('mrk_27', 'std_04', 'sub_algo', 'sem_4', 'usr_teach_01', 'Midterm', 47.0, 50),
('mrk_28', 'std_04', 'sub_algo', 'sem_4', 'usr_teach_01', 'Final', 92.5, 100),
('mrk_29', 'std_04', 'sub_algo', 'sem_4', 'usr_teach_01', 'Assignment', 19.5, 20),
('mrk_30', 'std_04', 'sub_algo', 'sem_4', 'usr_teach_01', 'Practical', 28.0, 30),

-- David Miller (Semester 4 - Struggling student)
('mrk_31', 'std_05', 'sub_algo', 'sem_4', 'usr_teach_01', 'Internal 1', 12.0, 25),
('mrk_32', 'std_05', 'sub_algo', 'sem_4', 'usr_teach_01', 'Internal 2', 13.5, 25),
('mrk_33', 'std_05', 'sub_algo', 'sem_4', 'usr_teach_01', 'Midterm', 26.0, 50),
('mrk_34', 'std_05', 'sub_algo', 'sem_4', 'usr_teach_01', 'Final', 54.0, 100),
('mrk_35', 'std_05', 'sub_algo', 'sem_4', 'usr_teach_01', 'Assignment', 12.0, 20),
('mrk_36', 'std_05', 'sub_algo', 'sem_4', 'usr_teach_01', 'Practical', 18.0, 30)
ON CONFLICT (id) DO NOTHING;

-- 10. MARKSHEETS
INSERT INTO marksheets (id, student_id, semester_id, file_url, file_name, sgpa, cgpa, uploaded_by) VALUES
('ms_01', 'std_01', 'sem_3', '/uploads/marksheets/marksheet_CS2023001_sem3.pdf', 'Official_Marksheet_Sem3_RohanSharma.pdf', 8.75, 8.60, 'usr_admin_01'),
('ms_02', 'std_01', 'sem_4', '/uploads/marksheets/marksheet_CS2023001_sem4.pdf', 'Official_Marksheet_Sem4_RohanSharma.pdf', 9.10, 8.85, 'usr_admin_01'),
('ms_03', 'std_02', 'sem_3', '/uploads/marksheets/marksheet_CS2023002_sem3.pdf', 'Official_Marksheet_Sem3_PriyaPatel.pdf', 9.40, 9.35, 'usr_admin_01'),
('ms_04', 'std_02', 'sem_4', '/uploads/marksheets/marksheet_CS2023002_sem4.pdf', 'Official_Marksheet_Sem4_PriyaPatel.pdf', 9.65, 9.50, 'usr_admin_01')
ON CONFLICT (id) DO NOTHING;

-- 11. NOTIFICATIONS
INSERT INTO notifications (id, title, body, target_role, target_class_id, created_by) VALUES
('notif_01', 'Mid-Term Examination Schedule Announced', 'All students and faculty are advised that Mid-Term Examinations for Spring 2025 will commence from October 15th. Detailed hall tickets will be issued shortly.', 'all', NULL, 'usr_admin_01'),
('notif_02', 'Faculty Meeting: Academic Audit & Accreditation', 'A mandatory academic review meeting for all department faculty will be convened this Thursday at 3:00 PM in the Senate Conference Hall.', 'all_teachers', NULL, 'usr_admin_01'),
('notif_03', 'Algorithm Design Lab Assignment 3 Submission Deadline', 'Class CS-3A students must submit their Dynamic Programming implementation and benchmark reports by Friday midnight on the portal.', 'class', 'cls_cs3a', 'usr_teach_01'),
('notif_04', 'Annual Tech Symposium — Call for Research Papers', 'Call for undergraduate technical papers in AI, Systems, and Robotics is now open. Exceptional papers will receive college travel grants.', 'all_students', NULL, 'usr_admin_01')
ON CONFLICT (id) DO NOTHING;

-- 12. NOTIFICATION READS
INSERT INTO notification_reads (id, notification_id, user_id, read_at) VALUES
('nr_01', 'notif_01', 'usr_stud_01', CURRENT_TIMESTAMP)
ON CONFLICT (id) DO NOTHING;
