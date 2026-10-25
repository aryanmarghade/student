import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs/promises';
import bcrypt from 'bcryptjs';

dotenv.config({ path: path.resolve(process.cwd(), '.env.test') });

export async function setupTestDb(options: { drop?: boolean } = {}) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL must be defined in .env.test for test database setup.');
  }

  // Parse target DB name from DATABASE_URL
  const parsedUrl = new URL(databaseUrl);
  const targetDbName = parsedUrl.pathname.replace(/^\//, '');

  if (!targetDbName.includes('test')) {
    throw new Error(`Safety Guard: Refusing to setup database "${targetDbName}" because its name does not contain "test".`);
  }

  // Connect to postgres maintenance DB to drop/create target DB if requested
  const maintenanceUrl = new URL(databaseUrl);
  maintenanceUrl.pathname = '/postgres';

  const maintenancePool = new pg.Pool({ connectionString: maintenanceUrl.toString() });
  try {
    if (options.drop) {
      console.log(`[test:db:setup] Dropping database ${targetDbName} if exists...`);
      await maintenancePool.query(`
        SELECT pg_terminate_backend(pg_stat_activity.pid)
        FROM pg_stat_activity
        WHERE pg_stat_activity.datname = $1 AND pid <> pg_backend_pid();
      `, [targetDbName]);
      await maintenancePool.query(`DROP DATABASE IF EXISTS ${targetDbName};`);
    }

    const checkRes = await maintenancePool.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [targetDbName]
    );

    if (checkRes.rowCount === 0) {
      console.log(`[test:db:setup] Creating database ${targetDbName}...`);
      await maintenancePool.query(`CREATE DATABASE ${targetDbName};`);
    }
  } finally {
    await maintenancePool.end();
  }

  // Connect to target test DB
  const testPool = new pg.Pool({ connectionString: databaseUrl });
  try {
    console.log(`[test:db:setup] Applying schema from db/schema.sql...`);
    const schemaSql = await fs.readFile(path.resolve(process.cwd(), 'db/schema.sql'), 'utf8');
    await testPool.query(schemaSql);

    console.log(`[test:db:setup] Seeding fake academic structures & accounts...`);
    // Seed Academic hierarchy
    await testPool.query(`
      INSERT INTO colleges (id, name, code) VALUES ('col_01', 'Test Engineering College', 'TEC01') ON CONFLICT (id) DO NOTHING;
      INSERT INTO departments (id, college_id, name, code) VALUES ('dept_cs', 'col_01', 'Computer Science and Engineering', 'CSE') ON CONFLICT (id) DO NOTHING;
      
      INSERT INTO academic_years (id, year_name, is_current) VALUES
      ('ay_2023_27', '2023-2027', false),
      ('ay_2024_28', '2024-2028', false),
      ('ay_2025_29', '2025-2029', true),
      ('ay_2026_30', '2026-2030', false),
      ('ay_2025_26', '2025-2026', false)
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO semesters (id, semester_number, name, academic_year_id, is_active) VALUES
      ('sem_1', 1, 'Semester 1', 'ay_2025_29', false),
      ('sem_2', 2, 'Semester 2', 'ay_2026_30', true),
      ('sem_3', 3, 'Semester 3', 'ay_2025_29', true),
      ('sem_4', 4, 'Semester 4', 'ay_2025_29', false),
      ('sem_5', 5, 'Semester 5', 'ay_2024_28', true),
      ('sem_6', 6, 'Semester 6', 'ay_2024_28', false),
      ('sem_7', 7, 'Semester 7', 'ay_2023_27', true),
      ('sem_8', 8, 'Semester 8', 'ay_2023_27', false)
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO classes (id, name, department_id, academic_year_id, year, section) VALUES
      ('cls_sem_1', 'CSE Year 1 Class A (Sem 1)', 'dept_cs', 'ay_2025_26', 1, 'A'),
      ('cls_sem_2', 'CSE Year 2 Class A (Sem 3)', 'dept_cs', 'ay_2025_26', 2, 'A'),
      ('cls_sem_3', 'CSE Year 3 Class A (Sem 5)', 'dept_cs', 'ay_2025_26', 3, 'A'),
      ('cls_sem_4', 'CSE Year 4 Class A (Sem 7)', 'dept_cs', 'ay_2025_26', 4, 'A'),
      ('cls_y1_a', 'CSE Year 1 Section A (Sem 2)', 'dept_cs', 'ay_2026_30', 1, 'A'),
      ('cls_y1_b', 'CSE Year 1 Section B (Sem 2)', 'dept_cs', 'ay_2026_30', 1, 'B'),
      ('cls_y1_c', 'CSE Year 1 Section C (Sem 2)', 'dept_cs', 'ay_2026_30', 1, 'C'),
      ('cls_y1_d', 'CSE Year 1 Section D (Sem 2)', 'dept_cs', 'ay_2026_30', 1, 'D'),
      ('cls_y1_e', 'CSE Year 1 Section E (Sem 2)', 'dept_cs', 'ay_2026_30', 1, 'E'),
      ('cls_y2_a', 'CSE Year 2 Section A (Sem 3)', 'dept_cs', 'ay_2025_29', 2, 'A'),
      ('cls_y2_b', 'CSE Year 2 Section B (Sem 3)', 'dept_cs', 'ay_2025_29', 2, 'B'),
      ('cls_y2_c', 'CSE Year 2 Section C (Sem 3)', 'dept_cs', 'ay_2025_29', 2, 'C'),
      ('cls_y2_d', 'CSE Year 2 Section D (Sem 3)', 'dept_cs', 'ay_2025_29', 2, 'D'),
      ('cls_y2_e', 'CSE Year 2 Section E (Sem 3)', 'dept_cs', 'ay_2025_29', 2, 'E'),
      ('cls_y3_a', 'CSE Year 3 Section A (Sem 5)', 'dept_cs', 'ay_2024_28', 3, 'A'),
      ('cls_y3_b', 'CSE Year 3 Section B (Sem 5)', 'dept_cs', 'ay_2024_28', 3, 'B'),
      ('cls_y3_c', 'CSE Year 3 Section C (Sem 5)', 'dept_cs', 'ay_2024_28', 3, 'C'),
      ('cls_y3_d', 'CSE Year 3 Section D (Sem 5)', 'dept_cs', 'ay_2024_28', 3, 'D'),
      ('cls_y3_e', 'CSE Year 3 Section E (Sem 5)', 'dept_cs', 'ay_2024_28', 3, 'E'),
      ('cls_y4_a', 'CSE Year 4 Section A (Sem 7)', 'dept_cs', 'ay_2023_27', 4, 'A'),
      ('cls_y4_b', 'CSE Year 4 Section B (Sem 7)', 'dept_cs', 'ay_2023_27', 4, 'B'),
      ('cls_y4_c', 'CSE Year 4 Section C (Sem 7)', 'dept_cs', 'ay_2023_27', 4, 'C'),
      ('cls_y4_d', 'CSE Year 4 Section D (Sem 7)', 'dept_cs', 'ay_2023_27', 4, 'D'),
      ('cls_y4_e', 'CSE Year 4 Section E (Sem 7)', 'dept_cs', 'ay_2023_27', 4, 'E')
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO subjects (id, department_id, name, code, max_marks, credits) VALUES
      ('sbj_math1', 'dept_cs', 'Maths 1', 'MTH101', 100, 4),
      ('sbj_cprog', 'dept_cs', 'C Programming', 'CS101', 100, 4),
      ('sbj_algo', 'dept_cs', 'Algorithms & Data Structures', 'CS102', 100, 4),
      ('sbj_dbms', 'dept_cs', 'Database Systems', 'CS103', 100, 3)
      ON CONFLICT (id) DO NOTHING;
    `);

    // Seed fake users for all 4 roles
    const hash = await bcrypt.hash('TestPass123!', 10);
    await testPool.query(`
      INSERT INTO users (id, email, password_hash, role, full_name, is_active, must_reset_password) VALUES
      ('usr_admin_test', 'admin.test@vissionacademy.edu', $1, 'admin', 'Test Administrator', true, false),
      ('usr_admin_01', 'admin@visionacademy.edu', $1, 'admin', 'Default Admin', true, false),
      ('usr_teacher_test', 'teacher.test@vissionacademy.edu', $1, 'teacher', 'Test Teacher', true, false),
      ('usr_placement_test', 'placement.test@vissionacademy.edu', $1, 'placement', 'Test Placement Officer', true, false),
      ('usr_student_test', 'student.test@vissionacademy.edu', $1, 'student', 'Test Student One', true, false),
      ('usr_student_test_02', 'student2.test@vissionacademy.edu', $1, 'student', 'Test Student Two', true, false)
      ON CONFLICT (id) DO NOTHING;
    `, [hash]);

    // Student records
    await testPool.query(`
      INSERT INTO students (id, user_id, roll_number, class_id, department_id, bio, profile_strength) VALUES
      ('std_test_01', 'usr_student_test', 'TEST2026001', 'cls_y1_a', 'dept_cs', 'Fake student for automated testing.', 80),
      ('std_test_02', 'usr_student_test_02', 'TEST2026002', 'cls_y1_a', 'dept_cs', 'Second fake student for automated tests.', 75)
      ON CONFLICT (id) DO NOTHING;
    `);

    // Teacher assignments
    await testPool.query(`
      INSERT INTO teacher_class_assignments (id, teacher_user_id, class_id, subject_id, semester_id, status) VALUES
      ('tca_test_01', 'usr_teacher_test', 'cls_y1_a', 'sbj_math1', 'sem_1', 'active')
      ON CONFLICT (id) DO NOTHING;
    `);

    // Visibility records
    await testPool.query(`
      INSERT INTO teacher_analytics_visibility (teacher_user_id, academic_enabled, github_enabled, hackerrank_enabled, linkedin_enabled, leetcode_enabled, hackathon_enabled, sports_enabled) VALUES
      ('usr_teacher_test', true, true, true, true, true, true, true)
      ON CONFLICT (teacher_user_id) DO NOTHING;

      INSERT INTO placement_analytics_visibility (placement_user_id, academic_enabled, github_enabled, hackerrank_enabled, linkedin_enabled, leetcode_enabled, hackathon_enabled, sports_enabled) VALUES
      ('usr_placement_test', true, true, true, true, true, true, true)
      ON CONFLICT (placement_user_id) DO NOTHING;
    `);

    console.log(`[test:db:setup] Test database "${targetDbName}" setup completed successfully.`);
  } finally {
    await testPool.end();
  }
}

// Allow direct CLI execution: `npx tsx scripts/setup-test-db.ts [--drop]`
if (process.argv[1] && process.argv[1].includes('setup-test-db')) {
  const shouldDrop = process.argv.includes('--drop');
  setupTestDb({ drop: shouldDrop })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[test:db:setup] Setup failed:', err);
      process.exit(1);
    });
}
