import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';
import pg from 'pg';

const envFile = process.env.DOTENV_CONFIG_PATH || (process.env.NODE_ENV === 'test' ? '.env.test' : '.env');
dotenv.config({ path: path.resolve(process.cwd(), envFile) });

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required; PostgreSQL is the application source of truth.');

export interface DbSslConfig {
  rejectUnauthorized: boolean;
  ca?: string;
}

export function parseDbSslConfig(env: NodeJS.ProcessEnv = process.env): DbSslConfig | undefined {
  const dbUrl = env.DATABASE_URL || '';
  const dbSsl = (env.DB_SSL || '').toLowerCase();
  const dbSslInsecure = env.DB_SSL_INSECURE === 'true' || env.DB_REJECT_UNAUTHORIZED === 'false';
  const caCert = env.DB_SSL_CA;

  const isSslRequested =
    dbSsl === 'true' ||
    dbSsl === 'require' ||
    dbSsl === 'verify-full' ||
    dbSsl === 'verify-ca' ||
    dbUrl.includes('sslmode=require') ||
    dbUrl.includes('sslmode=verify-full') ||
    dbUrl.includes('sslmode=verify-ca');

  if (!isSslRequested) {
    return undefined;
  }

  // If DB_SSL_INSECURE is explicitly set, allow rejectUnauthorized: false with warning
  if (dbSslInsecure) {
    if (env.NODE_ENV === 'production') {
      console.warn('[SECURITY WARNING] Database SSL configured with rejectUnauthorized: false in production via DB_SSL_INSECURE flag.');
    }
    return {
      rejectUnauthorized: false,
      ...(caCert ? { ca: caCert } : {})
    };
  }

  // Secure default: rejectUnauthorized is strictly true
  return {
    rejectUnauthorized: true,
    ...(caCert ? { ca: caCert } : {})
  };
}

export const pool = new Pool({
  connectionString: databaseUrl,
  ssl: parseDbSslConfig(process.env),
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
  const lockedSeed = await fs.readFile(path.join(root, 'db', 'seed-locked-academic.sql'), 'utf8');

  // Older live databases may already have legacy schema columns missing from the latest app.
  // Add the missing student profile fields and marks class-scoping column before reapplying schema/index updates.
  await pool.query(`ALTER TABLE students ADD COLUMN IF NOT EXISTS hackerrank_url TEXT;`);
  await pool.query(`ALTER TABLE students ADD COLUMN IF NOT EXISTS portfolio_url TEXT;`);
  await pool.query(`ALTER TABLE marks ADD COLUMN IF NOT EXISTS class_id VARCHAR(64);`);
  await pool.query(`ALTER TABLE marks ALTER COLUMN marks_obtained DROP NOT NULL;`);
  await pool.query(`ALTER TABLE posts ADD COLUMN IF NOT EXISTS verification_status VARCHAR(64) DEFAULT 'Published';`);
  await pool.query(`ALTER TABLE teacher_analytics_visibility ADD COLUMN IF NOT EXISTS sports_enabled BOOLEAN DEFAULT TRUE;`);
  await pool.query(`ALTER TABLE placement_analytics_visibility ADD COLUMN IF NOT EXISTS sports_enabled BOOLEAN DEFAULT TRUE;`);
  await pool.query(`ALTER TABLE subjects ADD COLUMN IF NOT EXISTS credits INT DEFAULT 3;`);
  await pool.query(`ALTER TABLE assessment_definitions ADD COLUMN IF NOT EXISTS weight NUMERIC(5, 2) DEFAULT 1.0;`);
  await pool.query(`ALTER TABLE assessment_definitions ADD COLUMN IF NOT EXISTS assessment_date DATE;`);
  await pool.query(`ALTER TABLE assessment_definitions ADD COLUMN IF NOT EXISTS answer_key TEXT;`);
  await pool.query(`ALTER TABLE assessment_definitions ADD COLUMN IF NOT EXISTS rubric_criteria JSONB DEFAULT '[]';`);
  await pool.query(`ALTER TABLE marks ADD COLUMN IF NOT EXISTS assessment_definition_id VARCHAR(64);`);
  await pool.query(`ALTER TABLE marks ADD COLUMN IF NOT EXISTS status VARCHAR(32) DEFAULT 'entered';`);
  await pool.query(`ALTER TABLE marks ADD COLUMN IF NOT EXISTS suggested_marks NUMERIC(5, 2);`);
  await pool.query(`ALTER TABLE marks ADD COLUMN IF NOT EXISTS suggested_by_ai BOOLEAN DEFAULT FALSE;`);
  await pool.query(`ALTER TABLE marks ADD COLUMN IF NOT EXISTS ai_justification TEXT;`);
  await pool.query(`ALTER TABLE marks ADD COLUMN IF NOT EXISTS ai_criterion_scores JSONB DEFAULT '[]';`);
  await pool.query(`ALTER TABLE marks ADD COLUMN IF NOT EXISTS teacher_override_reason TEXT;`);
  await pool.query(`ALTER TABLE marks ADD COLUMN IF NOT EXISTS teacher_feedback TEXT;`);
  await pool.query(`ALTER TABLE marks ADD COLUMN IF NOT EXISTS feedback_published BOOLEAN DEFAULT FALSE;`);
  await pool.query(`ALTER TABLE marks ADD COLUMN IF NOT EXISTS reviewed_by VARCHAR(64);`);
  await pool.query(`ALTER TABLE marks ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP WITH TIME ZONE;`);
  await pool.query(`ALTER TABLE marks ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;`);

  // Deduplicate active teacher assignments before creating unique index (retain oldest record)
  await pool.query(`
    DELETE FROM teacher_class_assignments t1
    USING teacher_class_assignments t2
    WHERE t1.status = 'active'
      AND t2.status = 'active'
      AND t1.teacher_user_id = t2.teacher_user_id
      AND t1.class_id = t2.class_id
      AND t1.subject_id = t2.subject_id
      AND t1.semester_id = t2.semester_id
      AND (t1.created_at > t2.created_at OR (t1.created_at = t2.created_at AND t1.id > t2.id));
  `);

  await pool.query(schema);

  await pool.query(`UPDATE marks m SET class_id = s.class_id FROM students s WHERE m.student_id = s.id AND m.class_id IS NULL;`);
  await pool.query(`DROP INDEX IF EXISTS uq_marks_student_subject_semester_exam;`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_marks_student_class_subject_semester_exam ON marks(student_id, class_id, subject_id, semester_id, exam_type);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_marks_class_subject_semester ON marks(class_id, subject_id, semester_id);`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_tca_active_assignment ON teacher_class_assignments (teacher_user_id, class_id, subject_id, semester_id) WHERE status = 'active';`);

  if (process.env.NODE_ENV !== 'production') {
    await pool.query(lockedSeed);
  }
}

export function id(prefix: string) { return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`; }
