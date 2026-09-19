import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required; PostgreSQL is the application source of truth.');

export const pool = new Pool({
  connectionString: databaseUrl,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
});

export type UserRole = 'admin' | 'teacher' | 'student';
export interface UserRecord { id: string; email: string; password_hash: string; role: UserRole; full_name: string; is_active: boolean; must_reset_password: boolean; created_at: string; }
export interface MarkRecord { id: string; student_id: string; subject_id: string; semester_id: string; teacher_user_id: string; exam_type: string; marks_obtained: number; max_marks: number; created_at: string; }
export interface MarksheetRecord { id: string; student_id: string; semester_id: string; file_url: string; file_name: string; sgpa: number; cgpa: number; uploaded_by: string; created_at: string; }
export interface StudentDocumentRecord { id: string; student_id: string; title: string; description?: string; category: string; doc_type: string; file_url: string; file_name: string; parsed_headings?: Record<string, string[]>; status: string; created_at: string; }
export interface NotificationRecord { id: string; title: string; body: string; target_role: 'all' | 'all_students' | 'all_teachers' | 'class'; target_class_id?: string | null; file_url?: string | null; created_by: string; created_at: string; }

export async function query<T = any>(sql: string, params: any[] = []): Promise<{ rows: T[]; rowCount: number }> {
  const result = await pool.query<T>(sql, params);
  return { rows: result.rows, rowCount: result.rowCount ?? result.rows.length };
}

export async function logActivity(userId: string | undefined, action: string, entityType: string, entityId: string | undefined, details: string) {
  await query(
    'INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details) VALUES ($1,$2,$3,$4,$5,$6)',
    [`log_${Date.now()}_${Math.floor(Math.random() * 1000)}`, userId || null, action, entityType, entityId || null, details],
  );
}

export async function initializeDatabase() {
  const root = process.cwd();
  const schema = await fs.readFile(path.join(root, 'db', 'schema.sql'), 'utf8');
  const qaSeed = await fs.readFile(path.join(root, 'db', 'seed-qa.sql'), 'utf8');
  const cleanup = await fs.readFile(path.join(root, 'db', 'cleanup-legacy.sql'), 'utf8');

  // Older live databases may already have legacy schema columns missing from the latest app.
  // Add the missing student profile fields and marks class-scoping column before reapplying schema/index updates.
  await pool.query(`ALTER TABLE students ADD COLUMN IF NOT EXISTS hackerrank_url TEXT;`);
  await pool.query(`ALTER TABLE students ADD COLUMN IF NOT EXISTS portfolio_url TEXT;`);
  await pool.query(`ALTER TABLE marks ADD COLUMN IF NOT EXISTS class_id VARCHAR(64);`);
  await pool.query(`ALTER TABLE marks DROP CONSTRAINT IF EXISTS marks_exam_type_check;`);
  await pool.query(schema);

  await pool.query(`UPDATE marks m SET class_id = s.class_id FROM students s WHERE m.student_id = s.id AND m.class_id IS NULL;`);
  await pool.query(`DROP INDEX IF EXISTS uq_marks_student_subject_semester_exam;`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_marks_student_class_subject_semester_exam ON marks(student_id, class_id, subject_id, semester_id, exam_type);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_marks_class_subject_semester ON marks(class_id, subject_id, semester_id);`);

  await pool.query(qaSeed);
  // Remove legacy seed.sql records that predate the QA migration — idempotent.
  await pool.query(cleanup);
}

export function id(prefix: string) { return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`; }
