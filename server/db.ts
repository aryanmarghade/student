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
export interface MarkRecord { id: string; student_id: string; subject_id: string; semester_id: string; teacher_user_id: string; exam_type: 'Internal 1' | 'Internal 2' | 'Midterm' | 'Final' | 'Assignment' | 'Practical'; marks_obtained: number; max_marks: number; created_at: string; }
export interface MarksheetRecord { id: string; student_id: string; semester_id: string; file_url: string; file_name: string; sgpa: number; cgpa: number; uploaded_by: string; created_at: string; }
export interface StudentDocumentRecord { id: string; student_id: string; title: string; description?: string; category: string; doc_type: string; file_url: string; file_name: string; parsed_headings?: Record<string, string[]>; status: string; created_at: string; }
export interface NotificationRecord { id: string; title: string; body: string; target_role: 'all' | 'all_students' | 'all_teachers' | 'class'; target_class_id?: string | null; file_url?: string | null; created_by: string; created_at: string; }

export const BCRYPT_PASSWORD123 = '$2b$10$KtXAd/5CAjIrM70KIKO..expd548nXRI3xZM8.ycfT9Pz71AZSwVu';

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
  await pool.query(schema);
  await pool.query(qaSeed);
  // Remove legacy seed.sql records that predate the QA migration — idempotent.
  await pool.query(cleanup);
}

export function id(prefix: string) { return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`; }
