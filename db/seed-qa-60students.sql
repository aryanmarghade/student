-- =========================================================
-- Vission Academy — QA 60-Student Seed
-- File: db/seed-qa-60students.sql
-- Password for all QA students: password123
--   bcrypt hash: $2b$10$SSn2ns9e.n9NExe/81/RlesBMIdseA4q0D2NvbPRmuzy4rtC8MAdq
-- Idempotent: safe to run multiple times.
-- Uses prefix "qa60_" for all new IDs.
-- =========================================================

-- STEP 0: Missing semesters sem_6..8
INSERT INTO semesters (id, academic_year_id, semester_number, name, is_active) VALUES
  ('sem_6','ay_2025_26',6,'Semester 6',FALSE),
  ('sem_7','ay_2025_26',7,'Semester 7',FALSE),
  ('sem_8','ay_2025_26',8,'Semester 8',FALSE)
ON CONFLICT (id) DO NOTHING;

-- STEP 1: Subjects per semester range
INSERT INTO subjects (id, department_id, name, code, max_marks) VALUES
  ('qa60_s1_prog',  'dept_cs','Programming Fundamentals',     'CSE101',100),
  ('qa60_s1_math',  'dept_cs','Engineering Mathematics I',    'MTH101',100),
  ('qa60_s1_phy',   'dept_cs','Engineering Physics',          'PHY101',100),
  ('qa60_s2_ds',    'dept_cs','Data Structures',              'CSE102',100),
  ('qa60_s2_math2', 'dept_cs','Engineering Mathematics II',   'MTH102',100),
  ('qa60_s2_chem',  'dept_cs','Engineering Chemistry',        'CHE101',100),
  ('qa60_s3_dsa',   'dept_cs','Design & Analysis of Algorithms','CSE201',100),
  ('qa60_s3_dm',    'dept_cs','Discrete Mathematics',         'MTH201',100),
  ('qa60_s3_oops',  'dept_cs','Object Oriented Programming',  'CSE202',100),
  ('qa60_s4_dbms',  'dept_cs','Database Systems',             'CSE203',100),
  ('qa60_s4_os',    'dept_cs','Operating Systems',            'CSE204',100),
  ('qa60_s4_toc',   'dept_cs','Theory of Computation',        'CSE205',100),
  ('qa60_s5_cn',    'dept_cs','Computer Networks',            'CSE301',100),
  ('qa60_s5_ml',    'dept_cs','Machine Learning',             'CSE302',100),
  ('qa60_s5_se',    'dept_cs','Software Engineering',         'CSE303',100),
  ('qa60_s6_cc',    'dept_cs','Cloud Computing',              'CSE304',100),
  ('qa60_s6_ai',    'dept_cs','Artificial Intelligence',      'CSE305',100),
  ('qa60_s6_cg',    'dept_cs','Computer Graphics',            'CSE306',100),
  ('qa60_s7_iot',   'dept_cs','Internet of Things',           'CSE401',100),
  ('qa60_s7_bc',    'dept_cs','Blockchain Technology',        'CSE402',100),
  ('qa60_s7_pe',    'dept_cs','Project Elective I',           'CSE403',100),
  ('qa60_s8_cap',   'dept_cs','Capstone Project',             'CSE404',100),
  ('qa60_s8_pe2',   'dept_cs','Project Elective II',          'CSE405',100),
  ('qa60_s8_eth',   'dept_cs','Professional Ethics & Law',    'HUM401',100)
ON CONFLICT (id) DO NOTHING;

-- STEP 2: Classes - sections B and C for each year
INSERT INTO classes (id, department_id, academic_year_id, name, year, section) VALUES
  ('qa60_cls_y1b','dept_cs','ay_2025_26','CSE-1B',1,'B'),
  ('qa60_cls_y1c','dept_cs','ay_2025_26','CSE-1C',1,'C'),
  ('qa60_cls_y2b','dept_cs','ay_2025_26','CSE-2B',2,'B'),
  ('qa60_cls_y2c','dept_cs','ay_2025_26','CSE-2C',2,'C'),
  ('qa60_cls_y3b','dept_cs','ay_2025_26','CSE-3B',3,'B'),
  ('qa60_cls_y3c','dept_cs','ay_2025_26','CSE-3C',3,'C'),
  ('qa60_cls_y4b','dept_cs','ay_2025_26','CSE-4B',4,'B'),
  ('qa60_cls_y4c','dept_cs','ay_2025_26','CSE-4C',4,'C')
ON CONFLICT (id) DO NOTHING;

-- Rename existing QA classes
UPDATE classes SET name='CSE-1A' WHERE id='cls_sem_1' AND name='QA Semester 1 Class';
UPDATE classes SET name='CSE-2A' WHERE id='cls_sem_2' AND name='QA Semester 2 Class';
UPDATE classes SET name='CSE-3A' WHERE id='cls_sem_3' AND name='QA Semester 3 Class';
UPDATE classes SET name='CSE-4A' WHERE id='cls_sem_4' AND name='QA Semester 4 Class';

-- STEP 3: 4 extra QA teachers
INSERT INTO users (id, email, password_hash, role, full_name, is_active, must_reset_password) VALUES
  ('qa60_teach_05','qateacher5@test.com','$2b$10$wDkg39L/2q0pCTxUL/aAoOUKmQZDAj2o/pKd7XD0.zNd35tx2e0ie','teacher','QA Teacher 5',TRUE,FALSE),
  ('qa60_teach_06','qateacher6@test.com','$2b$10$wDkg39L/2q0pCTxUL/aAoOUKmQZDAj2o/pKd7XD0.zNd35tx2e0ie','teacher','QA Teacher 6',TRUE,FALSE),
  ('qa60_teach_07','qateacher7@test.com','$2b$10$wDkg39L/2q0pCTxUL/aAoOUKmQZDAj2o/pKd7XD0.zNd35tx2e0ie','teacher','QA Teacher 7',TRUE,FALSE),
  ('qa60_teach_08','qateacher8@test.com','$2b$10$wDkg39L/2q0pCTxUL/aAoOUKmQZDAj2o/pKd7XD0.zNd35tx2e0ie','teacher','QA Teacher 8',TRUE,FALSE)
ON CONFLICT (id) DO UPDATE SET email=EXCLUDED.email, is_active=TRUE;

-- STEP 4: Teacher class assignments
INSERT INTO teacher_class_assignments (id, teacher_user_id, class_id, subject_id, semester_id, status) VALUES
  -- Year1/SemA
  ('qa60_tca_y1a_prog','usr_teacher_01','cls_sem_1','qa60_s1_prog','sem_1','active'),
  ('qa60_tca_y1a_math','usr_teacher_01','cls_sem_1','qa60_s1_math','sem_1','active'),
  ('qa60_tca_y1a_phy', 'usr_teacher_01','cls_sem_1','qa60_s1_phy', 'sem_1','active'),
  -- Year1/SemB
  ('qa60_tca_y1b_prog','qa60_teach_05','qa60_cls_y1b','qa60_s1_prog','sem_1','active'),
  ('qa60_tca_y1b_math','qa60_teach_05','qa60_cls_y1b','qa60_s1_math','sem_1','active'),
  ('qa60_tca_y1b_phy', 'qa60_teach_05','qa60_cls_y1b','qa60_s1_phy', 'sem_1','active'),
  -- Year1/SemC
  ('qa60_tca_y1c_prog','qa60_teach_06','qa60_cls_y1c','qa60_s1_prog','sem_1','active'),
  ('qa60_tca_y1c_math','qa60_teach_06','qa60_cls_y1c','qa60_s1_math','sem_1','active'),
  ('qa60_tca_y1c_phy', 'qa60_teach_06','qa60_cls_y1c','qa60_s1_phy', 'sem_1','active'),
  -- Year2/2A hist+current
  ('qa60_tca_y2a_s1','usr_teacher_01','cls_sem_2','qa60_s1_prog','sem_1','past'),
  ('qa60_tca_y2a_s2','usr_teacher_01','cls_sem_2','qa60_s2_ds',  'sem_2','past'),
  ('qa60_tca_y2a_dsa','usr_teacher_02','cls_sem_2','qa60_s3_dsa','sem_3','active'),
  ('qa60_tca_y2a_dm', 'usr_teacher_02','cls_sem_2','qa60_s3_dm', 'sem_3','active'),
  ('qa60_tca_y2a_oop','usr_teacher_02','cls_sem_2','qa60_s3_oops','sem_3','active'),
  -- Year2/2B
  ('qa60_tca_y2b_s1','qa60_teach_05','qa60_cls_y2b','qa60_s1_prog','sem_1','past'),
  ('qa60_tca_y2b_s2','qa60_teach_05','qa60_cls_y2b','qa60_s2_ds',  'sem_2','past'),
  ('qa60_tca_y2b_dsa','qa60_teach_07','qa60_cls_y2b','qa60_s3_dsa','sem_3','active'),
  ('qa60_tca_y2b_dm', 'qa60_teach_07','qa60_cls_y2b','qa60_s3_dm', 'sem_3','active'),
  ('qa60_tca_y2b_oop','qa60_teach_07','qa60_cls_y2b','qa60_s3_oops','sem_3','active'),
  -- Year2/2C
  ('qa60_tca_y2c_s1','qa60_teach_06','qa60_cls_y2c','qa60_s1_prog','sem_1','past'),
  ('qa60_tca_y2c_s2','qa60_teach_06','qa60_cls_y2c','qa60_s2_ds',  'sem_2','past'),
  ('qa60_tca_y2c_dsa','qa60_teach_08','qa60_cls_y2c','qa60_s3_dsa','sem_3','active'),
  ('qa60_tca_y2c_dm', 'qa60_teach_08','qa60_cls_y2c','qa60_s3_dm', 'sem_3','active'),
  ('qa60_tca_y2c_oop','qa60_teach_08','qa60_cls_y2c','qa60_s3_oops','sem_3','active'),
  -- Year3/3A hist+current sem5
  ('qa60_tca_y3a_s1','usr_teacher_01','cls_sem_3','qa60_s1_prog','sem_1','past'),
  ('qa60_tca_y3a_s2','usr_teacher_01','cls_sem_3','qa60_s2_ds',  'sem_2','past'),
  ('qa60_tca_y3a_s3','usr_teacher_02','cls_sem_3','qa60_s3_dsa','sem_3','past'),
  ('qa60_tca_y3a_s4','usr_teacher_02','cls_sem_3','qa60_s4_dbms','sem_4','past'),
  ('qa60_tca_y3a_cn','usr_teacher_03','cls_sem_3','qa60_s5_cn','sem_5','active'),
  ('qa60_tca_y3a_ml','usr_teacher_03','cls_sem_3','qa60_s5_ml','sem_5','active'),
  ('qa60_tca_y3a_se','usr_teacher_03','cls_sem_3','qa60_s5_se','sem_5','active'),
  -- Year3/3B
  ('qa60_tca_y3b_s1','qa60_teach_05','qa60_cls_y3b','qa60_s1_prog','sem_1','past'),
  ('qa60_tca_y3b_s2','qa60_teach_05','qa60_cls_y3b','qa60_s2_ds',  'sem_2','past'),
  ('qa60_tca_y3b_s3','qa60_teach_07','qa60_cls_y3b','qa60_s3_dsa','sem_3','past'),
  ('qa60_tca_y3b_s4','qa60_teach_07','qa60_cls_y3b','qa60_s4_dbms','sem_4','past'),
  ('qa60_tca_y3b_cn','qa60_teach_05','qa60_cls_y3b','qa60_s5_cn','sem_5','active'),
  ('qa60_tca_y3b_ml','qa60_teach_05','qa60_cls_y3b','qa60_s5_ml','sem_5','active'),
  ('qa60_tca_y3b_se','qa60_teach_05','qa60_cls_y3b','qa60_s5_se','sem_5','active'),
  -- Year3/3C
  ('qa60_tca_y3c_s1','qa60_teach_06','qa60_cls_y3c','qa60_s1_prog','sem_1','past'),
  ('qa60_tca_y3c_s2','qa60_teach_06','qa60_cls_y3c','qa60_s2_ds',  'sem_2','past'),
  ('qa60_tca_y3c_s3','qa60_teach_08','qa60_cls_y3c','qa60_s3_dsa','sem_3','past'),
  ('qa60_tca_y3c_s4','qa60_teach_08','qa60_cls_y3c','qa60_s4_dbms','sem_4','past'),
  ('qa60_tca_y3c_cn','qa60_teach_06','qa60_cls_y3c','qa60_s5_cn','sem_5','active'),
  ('qa60_tca_y3c_ml','qa60_teach_06','qa60_cls_y3c','qa60_s5_ml','sem_5','active'),
  ('qa60_tca_y3c_se','qa60_teach_06','qa60_cls_y3c','qa60_s5_se','sem_5','active'),
  -- Year4/4A hist+current sem7
  ('qa60_tca_y4a_s1','usr_teacher_01','cls_sem_4','qa60_s1_prog','sem_1','past'),
  ('qa60_tca_y4a_s2','usr_teacher_01','cls_sem_4','qa60_s2_ds',  'sem_2','past'),
  ('qa60_tca_y4a_s3','usr_teacher_02','cls_sem_4','qa60_s3_dsa','sem_3','past'),
  ('qa60_tca_y4a_s4','usr_teacher_02','cls_sem_4','qa60_s4_dbms','sem_4','past'),
  ('qa60_tca_y4a_s5','usr_teacher_03','cls_sem_4','qa60_s5_cn','sem_5','past'),
  ('qa60_tca_y4a_s6','usr_teacher_03','cls_sem_4','qa60_s6_cc','sem_6','past'),
  ('qa60_tca_y4a_iot','usr_teacher_04','cls_sem_4','qa60_s7_iot','sem_7','active'),
  ('qa60_tca_y4a_bc', 'usr_teacher_04','cls_sem_4','qa60_s7_bc', 'sem_7','active'),
  ('qa60_tca_y4a_pe', 'usr_teacher_04','cls_sem_4','qa60_s7_pe', 'sem_7','active'),
  -- Year4/4B
  ('qa60_tca_y4b_s1','qa60_teach_05','qa60_cls_y4b','qa60_s1_prog','sem_1','past'),
  ('qa60_tca_y4b_s2','qa60_teach_05','qa60_cls_y4b','qa60_s2_ds',  'sem_2','past'),
  ('qa60_tca_y4b_s3','qa60_teach_07','qa60_cls_y4b','qa60_s3_dsa','sem_3','past'),
  ('qa60_tca_y4b_s4','qa60_teach_07','qa60_cls_y4b','qa60_s4_dbms','sem_4','past'),
  ('qa60_tca_y4b_s5','qa60_teach_05','qa60_cls_y4b','qa60_s5_cn','sem_5','past'),
  ('qa60_tca_y4b_s6','qa60_teach_07','qa60_cls_y4b','qa60_s6_cc','sem_6','past'),
  ('qa60_tca_y4b_iot','qa60_teach_07','qa60_cls_y4b','qa60_s7_iot','sem_7','active'),
  ('qa60_tca_y4b_bc', 'qa60_teach_07','qa60_cls_y4b','qa60_s7_bc', 'sem_7','active'),
  ('qa60_tca_y4b_pe', 'qa60_teach_07','qa60_cls_y4b','qa60_s7_pe', 'sem_7','active'),
  -- Year4/4C
  ('qa60_tca_y4c_s1','qa60_teach_06','qa60_cls_y4c','qa60_s1_prog','sem_1','past'),
  ('qa60_tca_y4c_s2','qa60_teach_06','qa60_cls_y4c','qa60_s2_ds',  'sem_2','past'),
  ('qa60_tca_y4c_s3','qa60_teach_08','qa60_cls_y4c','qa60_s3_dsa','sem_3','past'),
  ('qa60_tca_y4c_s4','qa60_teach_08','qa60_cls_y4c','qa60_s4_dbms','sem_4','past'),
  ('qa60_tca_y4c_s5','qa60_teach_06','qa60_cls_y4c','qa60_s5_cn','sem_5','past'),
  ('qa60_tca_y4c_s6','qa60_teach_08','qa60_cls_y4c','qa60_s6_cc','sem_6','past'),
  ('qa60_tca_y4c_iot','qa60_teach_08','qa60_cls_y4c','qa60_s7_iot','sem_7','active'),
  ('qa60_tca_y4c_bc', 'qa60_teach_08','qa60_cls_y4c','qa60_s7_bc', 'sem_7','active'),
  ('qa60_tca_y4c_pe', 'qa60_teach_08','qa60_cls_y4c','qa60_s7_pe', 'sem_7','active')
ON CONFLICT (id) DO NOTHING;