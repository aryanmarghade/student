export type UserRole = 'admin' | 'teacher' | 'student';

export interface User {
  id: string;
  email: string;
  role: UserRole;
  full_name: string;
  is_active?: boolean;
  must_reset_password?: boolean;
  student_id?: string;
  class_id?: string;
  roll_number?: string;
  class_name?: string;
  profile_strength?: number;
}

export interface Department {
  id: string;
  name: string;
  code: string;
}

export interface AcademicClass {
  id: string;
  name: string;
  department_id: string;
  academic_year_id: string;
  year: number;
  section: string;
  departmentName?: string;
  studentCount?: number;
}

export interface Subject {
  id: string;
  name: string;
  code: string;
  department_id: string;
  max_marks: number;
  departmentName?: string;
}

export interface Semester {
  id: string;
  name: string;
  academic_year_id: string;
  is_active: boolean;
}

export interface TeacherAssignment {
  id: string;
  teacher_user_id: string;
  class_id: string;
  subject_id: string;
  semester_id: string;
  status: 'active' | 'past';
  className?: string;
  classYear?: number;
  classSection?: string;
  subjectName?: string;
  subjectCode?: string;
  maxMarks?: number;
  semesterName?: string;
  studentCount?: number;
}

export interface StudentProfile {
  id: string;
  roll_number: string;
  full_name: string;
  email: string;
  className: string;
  classYear: number | string;
  classSection: string;
  departmentName: string;
  linkedin_url?: string;
  github_url?: string;
  hackerrank_url?: string;
  portfolio_url?: string;
  github_data?: any;
  profile_photo_url?: string;
  resume_url?: string;
  bio?: string;
  profile_strength: number;
  resumeDocument?: {
    file_name: string;
    parsed_headings?: {
      Education?: string[];
      Skills?: string[];
      Projects?: string[];
      Experience?: string[];
      Certifications?: string[];
      Summary?: string[];
    };
  };
}

export interface StudentMarkItem {
  exam_type: string;
  marks_obtained: number;
  max_marks: number;
  percentage: number;
}

export interface StudentSubjectMarks {
  subject_id: string;
  subject_name: string;
  subject_code: string;
  marks: StudentMarkItem[];
}

export interface StudentSemesterRecord {
  semester_id: string;
  semester_name: string;
  subjects: Record<string, StudentSubjectMarks>;
}

export interface Marksheet {
  id: string;
  student_id: string;
  semester_id: string;
  semesterName?: string;
  file_url: string;
  file_name: string;
  sgpa: number;
  cgpa: number;
  created_at: string;
}

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  target_role: string;
  target_class_id?: string | null;
  file_url?: string | null;
  created_at: string;
  is_read?: boolean;
}

export interface AnalyticsStats {
  count: number;
  mean: number;
  median: number;
  stdDev: number;
  min: number;
  max: number;
}

export interface RegressionPoint {
  x: number;
  actual: number;
  trend: number;
  label: string;
}

export interface AnalyticsResponse {
  scope: 'whole_class' | 'selected_students' | 'single_student';
  totalStudentsIncluded: number;
  statistics: AnalyticsStats;
  linearRegression: {
    slope: number;
    intercept: number;
    predictedNextScore: number;
    points: RegressionPoint[];
    label: string;
  };
  charts: {
    gradeDistribution: { A: number; B: number; C: number; D: number; F: number };
    averageByExamType: Array<{ examType: string; average: number; count: number }>;
    averageByStudent: Array<{ studentId: string; rollNumber: string; name: string; average: number }>;
  };
  externalActivity?: {
    totalPosts: number;
    postsByMonth: Array<{ month: string; label?: string; count: number }>;
    githubSyncedCount: number;
    githubTotalRepos: number;
    githubTotalStars: number;
    githubTotalContributions: number;
    githubSnapshotsByMonth?: import('./types').GitHubMonthlyAggregate[];
    githubDataSource?: 'live_github_data' | 'snapshots';
  };
  rawExportData: Array<Record<string, any>>;
}

export interface ProjectItem {
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
  verification_status?: string;
  created_at: string;
}

export interface AchievementItem {
  id: string;
  student_id: string;
  title: string;
  description: string;
  organization: string;
  date?: string;
  link?: string;
  certificate_url?: string;
  verification_status?: string;
  created_at: string;
}

export interface CertificationItem {
  id: string;
  student_id: string;
  name: string;
  issuer: string;
  issue_date?: string;
  credential_id?: string;
  credential_url?: string;
  certificate_url?: string;
  verification_status?: string;
  created_at: string;
}

export interface HackathonItem {
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
  verification_status?: string;
  created_at: string;
}

export interface DocumentItem {
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

export interface CollegeEvent {
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
  created_by?: string;
  created_at: string;
}

export interface PostAttachment {
  id: string;
  post_id: string;
  file_url: string;
  file_name: string;
  file_type: string;
  created_at: string;
}

export interface PostItem {
  id: string;
  student_id: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  external_link?: string;
  attachments?: PostAttachment[];
  created_at: string;
}

export interface TeacherStudentAnalyticsMarkItem {
  title: string;
  exam_type?: string;
  marks_obtained: number;
  max_marks: number;
  assessment_type: string;
}

export interface TeacherStudentAnalyticsGithub {
  synced: boolean;
  syncedAt?: string;
  username?: string | null;
  followers?: number | null;
  publicRepos?: number | null;
  stars?: number | null;
  forks?: number | null;
  languages?: string[];
  topRepos?: any[];
  totalContributions?: number | null;
  currentStreak?: number | null;
  longestStreak?: number | null;
  contributionsByMonth?: Array<{ month: string; count: number }> | null;
  github_url?: string;
  raw?: any;
}

export interface TeacherStudentAnalytics {
  student: {
    id: string;
    full_name: string;
    roll_number: string;
    email: string;
    className?: string;
    classYear?: number;
    classSection?: string;
    departmentName?: string;
    semesterName?: string;
    profile_photo_url?: string;
    github_url?: string;
    linkedin_url?: string;
    hackerrank_url?: string;
    profile_strength?: number;
  };
  context?: {
    classId: string;
    subjectId: string;
    semesterId: string;
    className?: string;
    subjectName?: string;
    subjectCode?: string;
    semesterName?: string;
  };
  internalMarks: TeacherStudentAnalyticsMarkItem[];
  internalSummary: {
    totalObtained: number;
    totalMax: number;
    percentage: number;
    average?: number;
    count: number;
  } | null;
  githubData: TeacherStudentAnalyticsGithub | null;
  hackerrankData: { url: string; synced: boolean } | null;
  hackerrankUrl?: string;
  linkedinUrl?: string;
  linkedinPosts: Array<{ id?: string; title: string; description?: string; category?: string; created_at: string }>;
  recentPosts?: Array<{ id?: string; title: string; description?: string; category?: string; created_at: string }>;
  postsByMonth: Array<{ month: string; label?: string; count: number }>;
  totalPosts: number;
}

// ── GitHub Monthly Snapshots ──────────────────────────────────────────────────

/** A single monthly GitHub snapshot for one student */
export interface GitHubSnapshotRecord {
  month: string;           // YYYY-MM
  syncStatus: 'synced' | 'failed' | 'not_synced';
  publicRepos: number | null;
  totalStars: number | null;
  totalContributions: number | null;  // null if GITHUB_TOKEN not configured
  syncedAt: string | null;
}

/** GitHub data returned from teacher analytics (snapshot-first, legacy fallback) */
export interface GitHubAnalyticsData {
  synced: boolean;
  dataSource: 'monthly_snapshot' | 'legacy_github_data' | 'not_synced';
  snapshotMonth?: string;
  syncedAt?: string | null;
  username?: string | null;
  followers?: number | null;
  publicRepos?: number | null;
  stars?: number | null;
  forks?: number | null;
  languages?: string[];
  topRepos?: Array<{ name: string; url: string; description?: string | null; stars: number; language?: string | null }>;
  totalContributions?: number | null;
  github_url?: string | null;
  snapshotHistory?: GitHubSnapshotRecord[];
  reason?: string;
}

/** Monthly GitHub aggregate across a class (for trend charts) */
export interface GitHubMonthlyAggregate {
  month: string;
  studentsSynced: number;
  totalRepos: number;
  totalStars: number;
  totalContributions: number;
}
