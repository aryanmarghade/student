import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs/promises';
import { seedDemoAnalytics } from './seed-demo-analytics.js';

dotenv.config({ path: path.resolve(process.cwd(), '.env.demo'), override: true });

export async function setupDemoDb(options: { drop?: boolean } = {}) {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL must be defined in .env.demo for demo database setup.');
  }

  const parsedUrl = new URL(databaseUrl);
  const targetDbName = parsedUrl.pathname.replace(/^\//, '');

  if (!targetDbName.includes('demo')) {
    throw new Error(`Safety Guard: Refusing to setup database "${targetDbName}" because its name does not contain "demo".`);
  }

  // Maintenance connection to create target DB if not exists
  const maintenanceUrl = new URL(databaseUrl);
  maintenanceUrl.pathname = '/postgres';

  const maintenancePool = new pg.Pool({ connectionString: maintenanceUrl.toString() });
  try {
    if (options.drop) {
      console.log(`[demo:db:setup] Dropping database ${targetDbName} if exists...`);
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
      console.log(`[demo:db:setup] Creating database ${targetDbName}...`);
      await maintenancePool.query(`CREATE DATABASE ${targetDbName};`);
    }
  } finally {
    await maintenancePool.end();
  }

  // Connect to target demo DB
  const demoPool = new pg.Pool({ connectionString: databaseUrl });
  try {
    console.log(`[demo:db:setup] Applying schema from db/schema.sql...`);
    const schemaSql = await fs.readFile(path.resolve(process.cwd(), 'db/schema.sql'), 'utf8');
    await demoPool.query(schemaSql);

    console.log(`[demo:db:setup] Seeding standard academic baseline structures...`);
    await demoPool.query(`
      INSERT INTO colleges (id, name, code) VALUES ('col_01', 'Vission Academy of Engineering & Technology', 'VA01') ON CONFLICT (id) DO NOTHING;
      INSERT INTO departments (id, college_id, name, code) VALUES 
      ('dept_cs', 'col_01', 'Computer Science and Engineering', 'CSE'),
      ('dept_it', 'col_01', 'Information Technology', 'IT'),
      ('dept_ece', 'col_01', 'Electronics & Communication Engineering', 'ECE'),
      ('dept_me', 'col_01', 'Mechanical Engineering', 'ME')
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO academic_years (id, year_name, is_current) VALUES
      ('ay_2023_27', '2023-2027', false),
      ('ay_2024_28', '2024-2028', false),
      ('ay_2025_29', '2025-2029', true),
      ('ay_2026_30', '2026-2030', false)
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
      ('cls_y1_a', 'CSE Year 1 Section A (Sem 2)', 'dept_cs', 'ay_2026_30', 1, 'A'),
      ('cls_y2_a', 'CSE Year 2 Section A (Sem 3)', 'dept_cs', 'ay_2025_29', 2, 'A'),
      ('cls_y3_a', 'CSE Year 3 Section A (Sem 5)', 'dept_cs', 'ay_2024_28', 3, 'A'),
      ('cls_y4_a', 'CSE Year 4 Section A (Sem 7)', 'dept_cs', 'ay_2023_27', 4, 'A')
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO subjects (id, department_id, name, code, max_marks, credits) VALUES
      ('sbj_math1', 'dept_cs', 'Mathematics & Linear Algebra', 'MTH101', 100, 4),
      ('sbj_cprog', 'dept_cs', 'Computer Programming & C', 'CS101', 100, 4),
      ('sbj_algo', 'dept_cs', 'Algorithms & Data Structures', 'CS102', 100, 4),
      ('sbj_dbms', 'dept_cs', 'Database Management Systems', 'CS103', 100, 3)
      ON CONFLICT (id) DO NOTHING;
    `);

    console.log(`[demo:db:setup] Triggering demo analytics dataset seeding...`);
    await seedDemoAnalytics();
    console.log(`[demo:db:setup] ✅ Demo database "${targetDbName}" setup completed successfully.`);
  } finally {
    await demoPool.end();
  }
}

if (process.argv[1] && process.argv[1].includes('setup-demo-db')) {
  const shouldDrop = process.argv.includes('--drop');
  setupDemoDb({ drop: shouldDrop })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[demo:db:setup] Setup failed:', err);
      process.exit(1);
    });
}
