-- =========================================================
-- Vission Academy — Final Idempotent Academic Master Dataset
-- File: db/seed-locked-academic.sql
-- =========================================================

-- 1. Ensure Academic Years
INSERT INTO academic_years (id, year_name, is_current) VALUES
('ay_2023_27', '2023-2027', false),
('ay_2024_28', '2024-2028', false),
('ay_2025_29', '2025-2029', true),
('ay_2026_30', '2026-2030', false)
ON CONFLICT (id) DO UPDATE SET year_name = EXCLUDED.year_name;

-- 2. Ensure Semesters
INSERT INTO semesters (id, semester_number, name, academic_year_id, is_active) VALUES
('sem_1', 1, 'Semester 1', 'ay_2025_29', false),
('sem_2', 2, 'Semester 2', 'ay_2026_30', true),
('sem_3', 3, 'Semester 3', 'ay_2025_29', true),
('sem_4', 4, 'Semester 4', 'ay_2025_29', false),
('sem_5', 5, 'Semester 5', 'ay_2024_28', true),
('sem_6', 6, 'Semester 6', 'ay_2024_28', false),
('sem_7', 7, 'Semester 7', 'ay_2023_27', true),
('sem_8', 8, 'Semester 8', 'ay_2023_27', false)
ON CONFLICT (id) DO UPDATE SET semester_number = EXCLUDED.semester_number, name = EXCLUDED.name, is_active = EXCLUDED.is_active;

-- 3. Fixed Teachers
INSERT INTO users (id, email, password_hash, role, full_name, is_active, must_reset_password)
VALUES
('usr_teacher_01', 'teacher@vissionacademy.edu', '$2b$10$KtXAd/5CAjIrM70KIKO..expd548nXRI3xZM8.ycfT9Pz71AZSwVu', 'teacher', 'Dr. Neha Kulkarni', true, false),
('usr_teacher_02', 'prof.chen@vissionacademy.edu', '$2b$10$KtXAd/5CAjIrM70KIKO..expd548nXRI3xZM8.ycfT9Pz71AZSwVu', 'teacher', 'Prof. Rohan Deshmukh', true, false),
('usr_teacher_03', 'prof.vance@vissionacademy.edu', '$2b$10$KtXAd/5CAjIrM70KIKO..expd548nXRI3xZM8.ycfT9Pz71AZSwVu', 'teacher', 'Dr. Sneha Joshi', true, false),
('usr_teacher_04', 'prof.jenkins@vissionacademy.edu', '$2b$10$KtXAd/5CAjIrM70KIKO..expd548nXRI3xZM8.ycfT9Pz71AZSwVu', 'teacher', 'Prof. Amit Patil', true, false),
('usr_teacher_05', 'prof.kim@vissionacademy.edu', '$2b$10$KtXAd/5CAjIrM70KIKO..expd548nXRI3xZM8.ycfT9Pz71AZSwVu', 'teacher', 'Dr. Priya Nair', true, false),
('usr_teacher_06', 'prof.patel@vissionacademy.edu', '$2b$10$KtXAd/5CAjIrM70KIKO..expd548nXRI3xZM8.ycfT9Pz71AZSwVu', 'teacher', 'Dr. Arvind Rao', true, false),
('usr_teacher_07', 'prof.wilson@vissionacademy.edu', '$2b$10$KtXAd/5CAjIrM70KIKO..expd548nXRI3xZM8.ycfT9Pz71AZSwVu', 'teacher', 'Prof. Kavita Sharma', true, false),
('usr_teacher_08', 'prof.desai@vissionacademy.edu', '$2b$10$KtXAd/5CAjIrM70KIKO..expd548nXRI3xZM8.ycfT9Pz71AZSwVu', 'teacher', 'Dr. Vivek Mehta', true, false)
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  full_name = EXCLUDED.full_name,
  role = 'teacher',
  is_active = true;

-- 4. Fixed Subjects
INSERT INTO subjects (id, department_id, name, code, max_marks) VALUES
('sbj_math1', 'dept_cs', 'Maths 1', 'MTH101', 100),
('sbj_cprog', 'dept_cs', 'C Programming', 'CS101', 100),
('sbj_ar1', 'dept_cs', 'AR — Aptitude and Reasoning', 'AR101', 100),
('sbj_thinker', 'dept_cs', 'Thinker / Tinker Lab', 'TTL101', 100),
('sbj_phy_a', 'dept_cs', 'Physics A', 'PHY101A', 100),
('sbj_phy_b', 'dept_cs', 'Physics B', 'PHY101B', 100),
('sbj_phy_c', 'dept_cs', 'Physics C', 'PHY101C', 100),
('sbj_nano_d', 'dept_cs', 'Nano D', 'NANO101D', 100),
('sbj_nano_e', 'dept_cs', 'Nano E', 'NANO101E', 100),
('sbj_pss', 'dept_cs', 'PSS — Programming and Problem Solving', 'CS201', 100),
('sbj_phy_d', 'dept_cs', 'Physics D', 'PHY201D', 100),
('sbj_phy_e', 'dept_cs', 'Physics E', 'PHY201E', 100),
('sbj_ar2', 'dept_cs', 'AR 2', 'AR201', 100),
('sbj_deld', 'dept_cs', 'DELD — Digital Electronics and Logic Design', 'EC201', 100),
('sbj_ds', 'dept_cs', 'Data Structure', 'CS202', 100),
('sbj_daa', 'dept_cs', 'Design and Analysis of Algorithms', 'CS301', 100),
('sbj_cyber', 'dept_cs', 'Introduction to Cyber Security', 'CS302', 100),
('sbj_mas', 'dept_cs', 'Microcontroller Systems / MAS', 'CS303', 100),
('sbj_co', 'dept_cs', 'Computer Organization', 'CS304', 100),
('sbj_cn', 'dept_cs', 'Computer Networks', 'CS401', 100),
('sbj_dbms', 'dept_cs', 'Database Management Systems', 'CS402', 100),
('sbj_os', 'dept_cs', 'Operating Systems', 'CS403', 100),
('sbj_toc', 'dept_cs', 'Theory of Computation', 'CS404', 100),
('sbj_ce3', 'dept_cs', 'Career Essentials III', 'CE401', 100),
('sbj_pbl', 'dept_cs', 'Project Based Learning I', 'CS405', 100)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, code = EXCLUDED.code;

-- 5. Fixed 80 Section-Level Teacher-Subject Assignments (16 subjects x 5 sections A-E)
INSERT INTO teacher_class_assignments (id, teacher_user_id, class_id, subject_id, semester_id, status) VALUES
('tca_usr_teacher_03_sbj_ar1_cls_y1_a', 'usr_teacher_03', 'cls_y1_a', 'sbj_ar1', 'sem_1', 'active'),
('tca_usr_teacher_03_sbj_ar1_cls_y1_b', 'usr_teacher_03', 'cls_y1_b', 'sbj_ar1', 'sem_1', 'active'),
('tca_usr_teacher_03_sbj_ar1_cls_y1_c', 'usr_teacher_03', 'cls_y1_c', 'sbj_ar1', 'sem_1', 'active'),
('tca_usr_teacher_03_sbj_ar1_cls_y1_d', 'usr_teacher_03', 'cls_y1_d', 'sbj_ar1', 'sem_1', 'active'),
('tca_usr_teacher_03_sbj_ar1_cls_y1_e', 'usr_teacher_03', 'cls_y1_e', 'sbj_ar1', 'sem_1', 'active'),
('tca_usr_teacher_02_sbj_cprog_cls_y1_a', 'usr_teacher_02', 'cls_y1_a', 'sbj_cprog', 'sem_1', 'active'),
('tca_usr_teacher_02_sbj_cprog_cls_y1_b', 'usr_teacher_02', 'cls_y1_b', 'sbj_cprog', 'sem_1', 'active'),
('tca_usr_teacher_02_sbj_cprog_cls_y1_c', 'usr_teacher_02', 'cls_y1_c', 'sbj_cprog', 'sem_1', 'active'),
('tca_usr_teacher_02_sbj_cprog_cls_y1_d', 'usr_teacher_02', 'cls_y1_d', 'sbj_cprog', 'sem_1', 'active'),
('tca_usr_teacher_02_sbj_cprog_cls_y1_e', 'usr_teacher_02', 'cls_y1_e', 'sbj_cprog', 'sem_1', 'active'),
('tca_usr_teacher_01_sbj_math1_cls_y1_a', 'usr_teacher_01', 'cls_y1_a', 'sbj_math1', 'sem_1', 'active'),
('tca_usr_teacher_01_sbj_math1_cls_y1_b', 'usr_teacher_01', 'cls_y1_b', 'sbj_math1', 'sem_1', 'active'),
('tca_usr_teacher_01_sbj_math1_cls_y1_c', 'usr_teacher_01', 'cls_y1_c', 'sbj_math1', 'sem_1', 'active'),
('tca_usr_teacher_01_sbj_math1_cls_y1_d', 'usr_teacher_01', 'cls_y1_d', 'sbj_math1', 'sem_1', 'active'),
('tca_usr_teacher_01_sbj_math1_cls_y1_e', 'usr_teacher_01', 'cls_y1_e', 'sbj_math1', 'sem_1', 'active'),
('tca_usr_teacher_04_sbj_thinker_cls_y1_a', 'usr_teacher_04', 'cls_y1_a', 'sbj_thinker', 'sem_1', 'active'),
('tca_usr_teacher_04_sbj_thinker_cls_y1_b', 'usr_teacher_04', 'cls_y1_b', 'sbj_thinker', 'sem_1', 'active'),
('tca_usr_teacher_04_sbj_thinker_cls_y1_c', 'usr_teacher_04', 'cls_y1_c', 'sbj_thinker', 'sem_1', 'active'),
('tca_usr_teacher_04_sbj_thinker_cls_y1_d', 'usr_teacher_04', 'cls_y1_d', 'sbj_thinker', 'sem_1', 'active'),
('tca_usr_teacher_04_sbj_thinker_cls_y1_e', 'usr_teacher_04', 'cls_y1_e', 'sbj_thinker', 'sem_1', 'active'),
('tca_usr_teacher_06_sbj_ar2_cls_y1_a', 'usr_teacher_06', 'cls_y1_a', 'sbj_ar2', 'sem_2', 'active'),
('tca_usr_teacher_06_sbj_ar2_cls_y1_b', 'usr_teacher_06', 'cls_y1_b', 'sbj_ar2', 'sem_2', 'active'),
('tca_usr_teacher_06_sbj_ar2_cls_y1_c', 'usr_teacher_06', 'cls_y1_c', 'sbj_ar2', 'sem_2', 'active'),
('tca_usr_teacher_06_sbj_ar2_cls_y1_d', 'usr_teacher_06', 'cls_y1_d', 'sbj_ar2', 'sem_2', 'active'),
('tca_usr_teacher_06_sbj_ar2_cls_y1_e', 'usr_teacher_06', 'cls_y1_e', 'sbj_ar2', 'sem_2', 'active'),
('tca_usr_teacher_07_sbj_deld_cls_y1_a', 'usr_teacher_07', 'cls_y1_a', 'sbj_deld', 'sem_2', 'active'),
('tca_usr_teacher_07_sbj_deld_cls_y1_b', 'usr_teacher_07', 'cls_y1_b', 'sbj_deld', 'sem_2', 'active'),
('tca_usr_teacher_07_sbj_deld_cls_y1_c', 'usr_teacher_07', 'cls_y1_c', 'sbj_deld', 'sem_2', 'active'),
('tca_usr_teacher_07_sbj_deld_cls_y1_d', 'usr_teacher_07', 'cls_y1_d', 'sbj_deld', 'sem_2', 'active'),
('tca_usr_teacher_07_sbj_deld_cls_y1_e', 'usr_teacher_07', 'cls_y1_e', 'sbj_deld', 'sem_2', 'active'),
('tca_usr_teacher_08_sbj_ds_cls_y1_a', 'usr_teacher_08', 'cls_y1_a', 'sbj_ds', 'sem_2', 'active'),
('tca_usr_teacher_08_sbj_ds_cls_y1_b', 'usr_teacher_08', 'cls_y1_b', 'sbj_ds', 'sem_2', 'active'),
('tca_usr_teacher_08_sbj_ds_cls_y1_c', 'usr_teacher_08', 'cls_y1_c', 'sbj_ds', 'sem_2', 'active'),
('tca_usr_teacher_08_sbj_ds_cls_y1_d', 'usr_teacher_08', 'cls_y1_d', 'sbj_ds', 'sem_2', 'active'),
('tca_usr_teacher_08_sbj_ds_cls_y1_e', 'usr_teacher_08', 'cls_y1_e', 'sbj_ds', 'sem_2', 'active'),
('tca_usr_teacher_05_sbj_pss_cls_y1_a', 'usr_teacher_05', 'cls_y1_a', 'sbj_pss', 'sem_2', 'active'),
('tca_usr_teacher_05_sbj_pss_cls_y1_b', 'usr_teacher_05', 'cls_y1_b', 'sbj_pss', 'sem_2', 'active'),
('tca_usr_teacher_05_sbj_pss_cls_y1_c', 'usr_teacher_05', 'cls_y1_c', 'sbj_pss', 'sem_2', 'active'),
('tca_usr_teacher_05_sbj_pss_cls_y1_d', 'usr_teacher_05', 'cls_y1_d', 'sbj_pss', 'sem_2', 'active'),
('tca_usr_teacher_05_sbj_pss_cls_y1_e', 'usr_teacher_05', 'cls_y1_e', 'sbj_pss', 'sem_2', 'active'),
('tca_usr_teacher_08_sbj_co_cls_y2_a', 'usr_teacher_08', 'cls_y2_a', 'sbj_co', 'sem_3', 'active'),
('tca_usr_teacher_08_sbj_co_cls_y2_b', 'usr_teacher_08', 'cls_y2_b', 'sbj_co', 'sem_3', 'active'),
('tca_usr_teacher_08_sbj_co_cls_y2_c', 'usr_teacher_08', 'cls_y2_c', 'sbj_co', 'sem_3', 'active'),
('tca_usr_teacher_08_sbj_co_cls_y2_d', 'usr_teacher_08', 'cls_y2_d', 'sbj_co', 'sem_3', 'active'),
('tca_usr_teacher_08_sbj_co_cls_y2_e', 'usr_teacher_08', 'cls_y2_e', 'sbj_co', 'sem_3', 'active'),
('tca_usr_teacher_01_sbj_daa_cls_y2_a', 'usr_teacher_01', 'cls_y2_a', 'sbj_daa', 'sem_3', 'active'),
('tca_usr_teacher_01_sbj_daa_cls_y2_b', 'usr_teacher_01', 'cls_y2_b', 'sbj_daa', 'sem_3', 'active'),
('tca_usr_teacher_01_sbj_daa_cls_y2_c', 'usr_teacher_01', 'cls_y2_c', 'sbj_daa', 'sem_3', 'active'),
('tca_usr_teacher_01_sbj_daa_cls_y2_d', 'usr_teacher_01', 'cls_y2_d', 'sbj_daa', 'sem_3', 'active'),
('tca_usr_teacher_01_sbj_daa_cls_y2_e', 'usr_teacher_01', 'cls_y2_e', 'sbj_daa', 'sem_3', 'active'),
('tca_usr_teacher_04_sbj_mas_cls_y2_a', 'usr_teacher_04', 'cls_y2_a', 'sbj_mas', 'sem_3', 'active'),
('tca_usr_teacher_04_sbj_mas_cls_y2_b', 'usr_teacher_04', 'cls_y2_b', 'sbj_mas', 'sem_3', 'active'),
('tca_usr_teacher_04_sbj_mas_cls_y2_c', 'usr_teacher_04', 'cls_y2_c', 'sbj_mas', 'sem_3', 'active'),
('tca_usr_teacher_04_sbj_mas_cls_y2_d', 'usr_teacher_04', 'cls_y2_d', 'sbj_mas', 'sem_3', 'active'),
('tca_usr_teacher_04_sbj_mas_cls_y2_e', 'usr_teacher_04', 'cls_y2_e', 'sbj_mas', 'sem_3', 'active'),
('tca_usr_teacher_07_sbj_ce3_cls_y2_a', 'usr_teacher_07', 'cls_y2_a', 'sbj_ce3', 'sem_4', 'active'),
('tca_usr_teacher_07_sbj_ce3_cls_y2_b', 'usr_teacher_07', 'cls_y2_b', 'sbj_ce3', 'sem_4', 'active'),
('tca_usr_teacher_07_sbj_ce3_cls_y2_c', 'usr_teacher_07', 'cls_y2_c', 'sbj_ce3', 'sem_4', 'active'),
('tca_usr_teacher_07_sbj_ce3_cls_y2_d', 'usr_teacher_07', 'cls_y2_d', 'sbj_ce3', 'sem_4', 'active'),
('tca_usr_teacher_07_sbj_ce3_cls_y2_e', 'usr_teacher_07', 'cls_y2_e', 'sbj_ce3', 'sem_4', 'active'),
('tca_usr_teacher_06_sbj_cn_cls_y2_a', 'usr_teacher_06', 'cls_y2_a', 'sbj_cn', 'sem_4', 'active'),
('tca_usr_teacher_06_sbj_cn_cls_y2_b', 'usr_teacher_06', 'cls_y2_b', 'sbj_cn', 'sem_4', 'active'),
('tca_usr_teacher_06_sbj_cn_cls_y2_c', 'usr_teacher_06', 'cls_y2_c', 'sbj_cn', 'sem_4', 'active'),
('tca_usr_teacher_06_sbj_cn_cls_y2_d', 'usr_teacher_06', 'cls_y2_d', 'sbj_cn', 'sem_4', 'active'),
('tca_usr_teacher_06_sbj_cn_cls_y2_e', 'usr_teacher_06', 'cls_y2_e', 'sbj_cn', 'sem_4', 'active'),
('tca_usr_teacher_05_sbj_dbms_cls_y2_a', 'usr_teacher_05', 'cls_y2_a', 'sbj_dbms', 'sem_4', 'active'),
('tca_usr_teacher_05_sbj_dbms_cls_y2_b', 'usr_teacher_05', 'cls_y2_b', 'sbj_dbms', 'sem_4', 'active'),
('tca_usr_teacher_05_sbj_dbms_cls_y2_c', 'usr_teacher_05', 'cls_y2_c', 'sbj_dbms', 'sem_4', 'active'),
('tca_usr_teacher_05_sbj_dbms_cls_y2_d', 'usr_teacher_05', 'cls_y2_d', 'sbj_dbms', 'sem_4', 'active'),
('tca_usr_teacher_05_sbj_dbms_cls_y2_e', 'usr_teacher_05', 'cls_y2_e', 'sbj_dbms', 'sem_4', 'active'),
('tca_usr_teacher_02_sbj_os_cls_y2_a', 'usr_teacher_02', 'cls_y2_a', 'sbj_os', 'sem_4', 'active'),
('tca_usr_teacher_02_sbj_os_cls_y2_b', 'usr_teacher_02', 'cls_y2_b', 'sbj_os', 'sem_4', 'active'),
('tca_usr_teacher_02_sbj_os_cls_y2_c', 'usr_teacher_02', 'cls_y2_c', 'sbj_os', 'sem_4', 'active'),
('tca_usr_teacher_02_sbj_os_cls_y2_d', 'usr_teacher_02', 'cls_y2_d', 'sbj_os', 'sem_4', 'active'),
('tca_usr_teacher_02_sbj_os_cls_y2_e', 'usr_teacher_02', 'cls_y2_e', 'sbj_os', 'sem_4', 'active'),
('tca_usr_teacher_03_sbj_toc_cls_y2_a', 'usr_teacher_03', 'cls_y2_a', 'sbj_toc', 'sem_4', 'active'),
('tca_usr_teacher_03_sbj_toc_cls_y2_b', 'usr_teacher_03', 'cls_y2_b', 'sbj_toc', 'sem_4', 'active'),
('tca_usr_teacher_03_sbj_toc_cls_y2_c', 'usr_teacher_03', 'cls_y2_c', 'sbj_toc', 'sem_4', 'active'),
('tca_usr_teacher_03_sbj_toc_cls_y2_d', 'usr_teacher_03', 'cls_y2_d', 'sbj_toc', 'sem_4', 'active'),
('tca_usr_teacher_03_sbj_toc_cls_y2_e', 'usr_teacher_03', 'cls_y2_e', 'sbj_toc', 'sem_4', 'active')
ON CONFLICT (id) DO UPDATE SET teacher_user_id = EXCLUDED.teacher_user_id, class_id = EXCLUDED.class_id, subject_id = EXCLUDED.subject_id, semester_id = EXCLUDED.semester_id;
