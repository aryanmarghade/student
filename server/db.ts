import pg from 'pg';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
dotenv.config();

const { Pool } = pg;

// Check if a real PostgreSQL DATABASE_URL is reachable and configured
const databaseUrl = process.env.DATABASE_URL;
let pool: pg.Pool | null = null;
let useRealPostgres = false;

if (databaseUrl) {
  try {
    pool = new Pool({
      connectionString: databaseUrl,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
    });
    useRealPostgres = true;
  } catch (err) {
    console.warn('PostgreSQL pool init fallback:', err);
    useRealPostgres = false;
  }
}

// Data Record Interfaces
export interface UserRecord {
  id: string;
  email: string;
  password_hash: string;
  role: 'admin' | 'teacher' | 'student';
  full_name: string;
  is_active: boolean;
  must_reset_password: boolean;
  created_at: string;
}

export interface CollegeRecord {
  id: string;
  name: string;
  code: string;
  address: string;
}

export interface DepartmentRecord {
  id: string;
  college_id: string;
  name: string;
  code: string;
}

export interface AcademicYearRecord {
  id: string;
  year_name: string;
  is_current: boolean;
}

export interface SemesterRecord {
  id: string;
  academic_year_id: string;
  semester_number: number;
  name: string;
  is_active: boolean;
}

export interface ClassRecord {
  id: string;
  department_id: string;
  academic_year_id: string;
  name: string;
  year: number;
  section: string;
  is_archived?: boolean;
}

export interface SubjectRecord {
  id: string;
  department_id: string;
  name: string;
  code: string;
  max_marks: number;
  is_archived?: boolean;
}

export interface StudentRecord {
  id: string;
  user_id: string;
  roll_number: string;
  class_id: string;
  department_id: string;
  linkedin_url?: string;
  github_url?: string;
  profile_photo_url?: string;
  resume_url?: string;
  bio?: string;
  profile_strength: number;
}

export interface StudentDocumentRecord {
  id: string;
  student_id: string;
  title: string;
  description?: string;
  category: 'Assignment' | 'Project' | 'Certificate' | 'Achievement' | 'Hackathon' | 'Resume' | 'Academic' | 'Other';
  doc_type: string;
  file_url: string;
  file_name: string;
  parsed_headings?: Record<string, string[]>;
  status: string;
  created_at: string;
}

export interface ProjectRecord {
  id: string;
  student_id: string;
  title: string;
  description: string;
  technologies: string[];
  github_url?: string;
  live_url?: string;
  date?: string;
  team_members?: string[];
  image_url?: string;
  created_at: string;
}

export interface AchievementRecord {
  id: string;
  student_id: string;
  title: string;
  description: string;
  organization: string;
  date?: string;
  link?: string;
  certificate_url?: string;
  created_at: string;
}

export interface CertificationRecord {
  id: string;
  student_id: string;
  name: string;
  issuer: string;
  issue_date?: string;
  credential_id?: string;
  credential_url?: string;
  certificate_url?: string;
  created_at: string;
}

export interface HackathonRecord {
  id: string;
  student_id: string;
  name: string;
  organizer: string;
  date?: string;
  position_result?: string;
  team_name?: string;
  project_name?: string;
  project_description?: string;
  github_url?: string;
  demo_url?: string;
  certificate_url?: string;
  created_at: string;
}

export interface CollegeEventRecord {
  id: string;
  name: string;
  description: string;
  organizer: string;
  event_date: string;
  registration_deadline?: string;
  location: string;
  registration_link?: string;
  banner_url?: string;
  eligibility: string;
  status: 'upcoming' | 'ongoing' | 'completed';
  created_by: string;
  created_at: string;
}

export interface TeacherAssignmentRecord {
  id: string;
  teacher_user_id: string;
  class_id: string;
  subject_id: string;
  semester_id: string;
  status: 'active' | 'past';
  created_at: string;
}

export interface MarkRecord {
  id: string;
  student_id: string;
  subject_id: string;
  semester_id: string;
  teacher_user_id: string;
  exam_type: 'Internal 1' | 'Internal 2' | 'Midterm' | 'Final' | 'Assignment' | 'Practical';
  marks_obtained: number;
  max_marks: number;
  created_at: string;
}

export interface MarksheetRecord {
  id: string;
  student_id: string;
  semester_id: string;
  file_url: string;
  file_name: string;
  sgpa: number;
  cgpa: number;
  uploaded_by: string;
  created_at: string;
}

export interface NotificationRecord {
  id: string;
  title: string;
  body: string;
  target_role: 'all' | 'all_students' | 'all_teachers' | 'class';
  target_class_id?: string | null;
  file_url?: string | null;
  created_by: string;
  created_at: string;
}

export interface NotificationReadRecord {
  id: string;
  notification_id: string;
  user_id: string;
  read_at: string;
}

export interface AiQueryLogRecord {
  id: string;
  user_id: string;
  query_text: string;
  resolved_intent: string;
  response_summary: string;
  tool_calls?: any;
  created_at: string;
}

export interface AuditLogRecord {
  id: string;
  user_id?: string;
  action: string;
  entity_type: string;
  entity_id?: string;
  details: string;
  created_at: string;
}

// Authentic Bcrypt hash for initial password 'password123':
export const BCRYPT_PASSWORD123 = '$2b$10$KtXAd/5CAjIrM70KIKO..expd548nXRI3xZM8.ycfT9Pz71AZSwVu';

const initialAdminEmail = (process.env.ADMIN_EMAIL || 'admin@vissionacademy.edu').trim().toLowerCase();

class MemoryDatabase {
  // 1. Initial State has ZERO fake students, ZERO fake classes, ZERO fake marks.
  // One primary Administrator account is provisioned for first-day operational onboarding.
  users: UserRecord[] = [
    {
      id: 'usr_admin_01',
      email: initialAdminEmail,
      password_hash: BCRYPT_PASSWORD123,
      role: 'admin',
      full_name: 'Dr. Arthur Vance',
      is_active: true,
      must_reset_password: false,
      created_at: new Date().toISOString()
    }
  ];

  colleges: CollegeRecord[] = [
    { id: 'col_01', name: 'Vission Academy', code: 'VA', address: 'Academic Ridge Campus, Vission Way' }
  ];

  departments: DepartmentRecord[] = [
    { id: 'dept_cs', college_id: 'col_01', name: 'Computer Science & Engineering', code: 'CSE' }
  ];

  academic_years: AcademicYearRecord[] = [
    { id: 'ay_2025_26', year_name: '2025-2026', is_current: true }
  ];

  semesters: SemesterRecord[] = [
    { id: 'sem_1', academic_year_id: 'ay_2025_26', semester_number: 1, name: 'Semester 1 (Fall 2025)', is_active: true }
  ];

  classes: ClassRecord[] = [];
  subjects: SubjectRecord[] = [];
  students: StudentRecord[] = [];
  student_documents: StudentDocumentRecord[] = [];
  projects: ProjectRecord[] = [];
  achievements: AchievementRecord[] = [];
  certifications: CertificationRecord[] = [];
  hackathons: HackathonRecord[] = [];
  events: CollegeEventRecord[] = [];
  teacher_class_assignments: TeacherAssignmentRecord[] = [];
  marks: MarkRecord[] = [];
  marksheets: MarksheetRecord[] = [];
  notifications: NotificationRecord[] = [];
  notification_reads: NotificationReadRecord[] = [];
  ai_query_logs: AiQueryLogRecord[] = [];

  audit_logs: AuditLogRecord[] = [
    {
      id: 'log_001',
      user_id: 'usr_admin_01',
      action: 'SYSTEM_INIT',
      entity_type: 'COLLEGE',
      entity_id: 'col_01',
      details: 'Vission Academy academic system deployed with clean production state.',
      created_at: new Date().toISOString()
    }
  ];

  logActivity(userId: string | undefined, action: string, entityType: string, entityId: string | undefined, details: string) {
    const log: AuditLogRecord = {
      id: `log_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      user_id: userId,
      action,
      entity_type: entityType,
      entity_id: entityId,
      details,
      created_at: new Date().toISOString()
    };
    this.audit_logs.unshift(log);
    // Keep last 200 logs
    if (this.audit_logs.length > 200) {
      this.audit_logs.pop();
    }
    return log;
  }

  // Clear database to clean state with only administrator
  seedDevData() {
    this.resetToFresh();
    this.logActivity('usr_admin_01', 'SYSTEM_CLEAN', 'SYSTEM', undefined, 'Production database initialized with clean records.');
  }

  async seedInstitutionData() {
    const hasNonAdminUsers = this.users.some(u => u.role !== 'admin');
    const hasClasses = this.classes.length > 0;
    const hasSubjects = this.subjects.length > 0;
    const hasAssignments = this.teacher_class_assignments.length > 0;

    if (hasNonAdminUsers || hasClasses || hasSubjects || hasAssignments) {
      return;
    }

    const teacherUsers = [
      { id: 'usr_teacher_01', email: 'qateacher1@test.com', full_name: 'QA Teacher 1', password: 'TestTeacher123!' },
      { id: 'usr_teacher_02', email: 'qateacher2@test.com', full_name: 'QA Teacher 2', password: 'TestTeacher123!' },
      { id: 'usr_teacher_03', email: 'qateacher3@test.com', full_name: 'QA Teacher 3', password: 'TestTeacher123!' },
      { id: 'usr_teacher_04', email: 'qateacher4@test.com', full_name: 'QA Teacher 4', password: 'TestTeacher123!' }
    ];

    const studentUsers = [
      { id: 'usr_student_01', email: 'qastudent01@test.com', full_name: 'QA Student 01', password: 'TestStudent123!', roll_number: 'QA-S1-001', class_name: 'QA Semester 1 Class', semester_id: 'sem_1' },
      { id: 'usr_student_02', email: 'qastudent02@test.com', full_name: 'QA Student 02', password: 'TestStudent123!', roll_number: 'QA-S1-002', class_name: 'QA Semester 1 Class', semester_id: 'sem_1' },
      { id: 'usr_student_03', email: 'qastudent03@test.com', full_name: 'QA Student 03', password: 'TestStudent123!', roll_number: 'QA-S2-001', class_name: 'QA Semester 2 Class', semester_id: 'sem_2' },
      { id: 'usr_student_04', email: 'qastudent04@test.com', full_name: 'QA Student 04', password: 'TestStudent123!', roll_number: 'QA-S2-002', class_name: 'QA Semester 2 Class', semester_id: 'sem_2' },
      { id: 'usr_student_05', email: 'qastudent05@test.com', full_name: 'QA Student 05', password: 'TestStudent123!', roll_number: 'QA-S2-003', class_name: 'QA Semester 2 Class', semester_id: 'sem_2' },
      { id: 'usr_student_06', email: 'qastudent06@test.com', full_name: 'QA Student 06', password: 'TestStudent123!', roll_number: 'QA-S3-001', class_name: 'QA Semester 3 Class', semester_id: 'sem_3' },
      { id: 'usr_student_07', email: 'qastudent07@test.com', full_name: 'QA Student 07', password: 'TestStudent123!', roll_number: 'QA-S3-002', class_name: 'QA Semester 3 Class', semester_id: 'sem_3' },
      { id: 'usr_student_08', email: 'qastudent08@test.com', full_name: 'QA Student 08', password: 'TestStudent123!', roll_number: 'QA-S4-001', class_name: 'QA Semester 4 Class', semester_id: 'sem_4' },
      { id: 'usr_student_09', email: 'qastudent09@test.com', full_name: 'QA Student 09', password: 'TestStudent123!', roll_number: 'QA-S4-002', class_name: 'QA Semester 4 Class', semester_id: 'sem_4' },
      { id: 'usr_student_10', email: 'qastudent10@test.com', full_name: 'QA Student 10', password: 'TestStudent123!', roll_number: 'QA-S4-003', class_name: 'QA Semester 4 Class', semester_id: 'sem_4' }
    ];

    this.departments = [
      { id: 'dept_cs', college_id: 'col_01', name: 'Computer Science & Engineering', code: 'CSE' }
    ];

    this.academic_years = [
      { id: 'ay_2025_26', year_name: '2025-2026', is_current: true }
    ];

    this.semesters = [
      { id: 'sem_1', academic_year_id: 'ay_2025_26', semester_number: 1, name: 'Semester 1', is_active: true },
      { id: 'sem_2', academic_year_id: 'ay_2025_26', semester_number: 2, name: 'Semester 2', is_active: false },
      { id: 'sem_3', academic_year_id: 'ay_2025_26', semester_number: 3, name: 'Semester 3', is_active: false },
      { id: 'sem_4', academic_year_id: 'ay_2025_26', semester_number: 4, name: 'Semester 4', is_active: false }
    ];

    this.classes = [
      { id: 'cls_sem_1', department_id: 'dept_cs', academic_year_id: 'ay_2025_26', name: 'QA Semester 1 Class', year: 1, section: 'A' },
      { id: 'cls_sem_2', department_id: 'dept_cs', academic_year_id: 'ay_2025_26', name: 'QA Semester 2 Class', year: 2, section: 'A' },
      { id: 'cls_sem_3', department_id: 'dept_cs', academic_year_id: 'ay_2025_26', name: 'QA Semester 3 Class', year: 3, section: 'A' },
      { id: 'cls_sem_4', department_id: 'dept_cs', academic_year_id: 'ay_2025_26', name: 'QA Semester 4 Class', year: 4, section: 'A' }
    ];

    this.subjects = [
      { id: 'sbj_algorithms', department_id: 'dept_cs', name: 'Algorithms', code: 'ALG101', max_marks: 100 },
      { id: 'sbj_dbms', department_id: 'dept_cs', name: 'Database Management', code: 'DBMS201', max_marks: 100 },
      { id: 'sbj_os', department_id: 'dept_cs', name: 'Operating Systems', code: 'OS301', max_marks: 100 },
      { id: 'sbj_networks', department_id: 'dept_cs', name: 'Computer Networks', code: 'NET401', max_marks: 100 }
    ];

    const teacherRecords: UserRecord[] = teacherUsers.map((teacher) => ({
      id: teacher.id,
      email: teacher.email,
      password_hash: bcrypt.hashSync(teacher.password, 10),
      role: 'teacher',
      full_name: teacher.full_name,
      is_active: true,
      must_reset_password: false,
      created_at: new Date().toISOString()
    }));

    const studentRecords: UserRecord[] = studentUsers.map((student) => ({
      id: student.id,
      email: student.email,
      password_hash: bcrypt.hashSync(student.password, 10),
      role: 'student',
      full_name: student.full_name,
      is_active: true,
      must_reset_password: false,
      created_at: new Date().toISOString()
    }));

    this.users = [...this.users.filter(u => u.role === 'admin'), ...teacherRecords, ...studentRecords];

    const classMap = Object.fromEntries(this.classes.map(c => [c.name, c.id]));
    this.students = studentUsers.map((student, index) => ({
      id: `std_${String(index + 1).padStart(2, '0')}`,
      user_id: student.id,
      roll_number: student.roll_number,
      class_id: classMap[student.class_name],
      department_id: 'dept_cs',
      profile_strength: 20
    }));

    this.teacher_class_assignments = [
      { id: 'tca_01', teacher_user_id: 'usr_teacher_01', class_id: 'cls_sem_1', subject_id: 'sbj_algorithms', semester_id: 'sem_1', status: 'active', created_at: new Date().toISOString() },
      { id: 'tca_02', teacher_user_id: 'usr_teacher_02', class_id: 'cls_sem_2', subject_id: 'sbj_dbms', semester_id: 'sem_2', status: 'active', created_at: new Date().toISOString() },
      { id: 'tca_03', teacher_user_id: 'usr_teacher_03', class_id: 'cls_sem_3', subject_id: 'sbj_os', semester_id: 'sem_3', status: 'active', created_at: new Date().toISOString() },
      { id: 'tca_04', teacher_user_id: 'usr_teacher_04', class_id: 'cls_sem_4', subject_id: 'sbj_networks', semester_id: 'sem_4', status: 'active', created_at: new Date().toISOString() }
    ];

    this.logActivity('usr_admin_01', 'SYSTEM_SEED', 'SYSTEM', undefined, 'Institutional QA data seeded for teachers, classes, and students.');
  }

  // Reset back to completely fresh state with only the administrator
  resetToFresh() {
    this.classes = [];
    this.subjects = [];
    this.students = [];
    this.student_documents = [];
    this.projects = [];
    this.achievements = [];
    this.certifications = [];
    this.hackathons = [];
    this.events = [];
    this.teacher_class_assignments = [];
    this.marks = [];
    this.marksheets = [];
    this.notifications = [];
    this.notification_reads = [];
    this.ai_query_logs = [];
    this.users = this.users.filter(u => u.role === 'admin');
    this.logActivity('usr_admin_01', 'SYSTEM_RESET', 'SYSTEM', undefined, 'Database reset to clean production state.');
  }
}

export const memDb = new MemoryDatabase();

// Unified SQL query helper
export async function query(sql: string, params: any[] = []): Promise<{ rows: any[]; rowCount: number }> {
  if (useRealPostgres && pool) {
    try {
      const res = await pool.query(sql, params);
      return { rows: res.rows, rowCount: res.rowCount ?? res.rows.length };
    } catch (err) {
      console.error('PostgreSQL execution error:', err);
      throw err;
    }
  }

  const normalized = sql.trim().replace(/\s+/g, ' ');

  if (/SELECT.*FROM users WHERE email =/i.test(normalized)) {
    const email = params[0];
    const u = memDb.users.find(x => x.email.toLowerCase() === String(email).toLowerCase());
    return { rows: u ? [u] : [], rowCount: u ? 1 : 0 };
  }

  if (/SELECT.*FROM users WHERE id =/i.test(normalized)) {
    const id = params[0];
    const u = memDb.users.find(x => x.id === id);
    return { rows: u ? [u] : [], rowCount: u ? 1 : 0 };
  }

  return { rows: [], rowCount: 0 };
}
