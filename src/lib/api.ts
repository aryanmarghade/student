import { User, StudentProfile, AnalyticsResponse, AcademicClass, Subject, Department, TeacherAssignment, NotificationItem, Marksheet } from '../types';

const TOKEN_KEY = 'vission_academy_jwt';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
    ...(options.headers as Record<string, string> || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(endpoint, {
    ...options,
    headers,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || data.message || `Request failed with status ${res.status}`);
  }

  return data as T;
}

export const api = {
  // Auth & Setup
  getSetupStatus: () => request<{ needsSetup: boolean; institutionName: string; configured: boolean }>('/api/auth/setup-status'),

  setupMasterAdmin: (payload: { full_name: string; email: string; password: string }) =>
    request<{ message: string; token: string; user: User }>('/api/auth/setup-master-admin', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  login: (email: string, password: string) =>
    request<{ token: string; user: User; must_reset_password?: boolean }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  getCurrentUser: () => request<{ user: User }>('/api/auth/me'),

  resetFirstLoginPassword: (newPassword: string) =>
    request<{ message: string; user: User }>('/api/auth/reset-first-login-password', {
      method: 'POST',
      body: JSON.stringify({ newPassword }),
    }),

  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ message: string }>('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),

  // Admin
  getAdminOverview: () => request<any>('/api/admin/overview'),
  getAuditLogs: () => request<any[]>('/api/admin/audit-logs'),

  getAdminClasses: () => request<AcademicClass[]>('/api/admin/classes'),
  createClass: (data: { name: string; department_id: string; year: number; section: string }) =>
    request<{ message: string; class: AcademicClass }>('/api/admin/classes', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  deleteClass: (id: string) =>
    request<{ message: string }>(`/api/admin/classes/${id}`, {
      method: 'DELETE',
    }),

  getAdminDepartments: () => request<Department[]>('/api/admin/departments'),
  getAdminSubjects: () => request<Subject[]>('/api/admin/subjects'),
  createSubject: (data: { name: string; code: string; department_id: string; max_marks: number }) =>
    request<{ message: string; subject: Subject }>('/api/admin/subjects', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  deleteSubject: (id: string) =>
    request<{ message: string }>(`/api/admin/subjects/${id}`, {
      method: 'DELETE',
    }),

  getAdminSemesters: () => request<any[]>('/api/admin/semesters'),

  getAdminUsers: (role?: string, search?: string) => {
    const params = new URLSearchParams();
    if (role) params.set('role', role);
    if (search) params.set('search', search);
    return request<User[]>(`/api/admin/users?${params.toString()}`);
  },

  createAdminUser: (userData: any) =>
    request<{ message: string; user: User; tempPassword?: string }>('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify(userData),
    }),

  bulkImportUsers: (csvText: string, role: string) =>
    request<{ summary: any; successRows: any[]; failedRows: any[] }>('/api/admin/users/bulk-import', {
      method: 'POST',
      body: JSON.stringify({ csvText, role }),
    }),

  toggleUserStatus: (userId: string) =>
    request<{ message: string; is_active: boolean }>(`/api/admin/users/${userId}/status`, {
      method: 'PATCH',
    }),

  resetUserPassword: (userId: string) =>
    request<{ message: string; tempPassword?: string }>(`/api/admin/users/${userId}/reset-password`, {
      method: 'POST',
    }),

  getTeacherAssignments: () =>
    request<{ all: TeacherAssignment[]; active: TeacherAssignment[]; past: TeacherAssignment[] }>('/api/admin/teacher-assignments'),

  createTeacherAssignment: (data: { teacher_user_id: string; class_id: string; subject_id: string; semester_id: string }) =>
    request<{ message: string; assignment: TeacherAssignment }>('/api/admin/teacher-assignments', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  archiveTeacherAssignment: (id: string) =>
    request<{ message: string; assignment: TeacherAssignment }>(`/api/admin/teacher-assignments/${id}/archive`, {
      method: 'PATCH',
    }),

  startNewSemester: (data: { semesterName?: string; semesterNumber?: number }) =>
    request<{ message: string; newSemester: any; archivedCount: number }>('/api/admin/start-new-semester', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getAdminMarksheets: () => request<Marksheet[]>('/api/admin/marksheets'),

  uploadMarksheet: (data: { student_id: string; semester_id: string; sgpa: number; cgpa: number; file_name?: string }) =>
    request<{ message: string; marksheet: Marksheet }>('/api/admin/marksheets', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  uploadMarksheetFile: (data: FormData) =>
    request<{ message: string; marksheet: Marksheet }>('/api/admin/marksheets/upload', {
      method: 'POST',
      body: data,
    }),

  bulkUploadMarksheetsZip: (zipBase64: string, semester_id: string) =>
    request<{ summary: any; matchedFiles: any[]; unmatchedFiles: any[] }>('/api/admin/marksheets/bulk-zip', {
      method: 'POST',
      body: JSON.stringify({ zipBase64, semester_id }),
    }),

  getAdminNotifications: () => request<NotificationItem[]>('/api/admin/notifications'),

  createNotification: (data: { title: string; body: string; target_role: string; target_class_id?: string; file_url?: string }) =>
    request<{ message: string; notification: NotificationItem }>('/api/admin/notifications', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  deleteNotification: (id: string) =>
    request<{ message: string }>(`/api/admin/notifications/${id}`, {
      method: 'DELETE',
    }),

  getAdminAnalytics: () => request<any>('/api/admin/analytics'),

  askAdminAi: (query: string) =>
    request<{ answer: string; toolCallsExecuted: any[]; resolvedIntent: string }>('/api/admin/ai-query', {
      method: 'POST',
      body: JSON.stringify({ query }),
    }),

  loadDevSeed: () => request<{ message: string }>('/api/admin/dev-seed', { method: 'POST' }),
  resetToFresh: () => request<{ message: string }>('/api/admin/reset-to-fresh', { method: 'POST' }),

  // Teacher
  getTeacherAssignmentsList: () =>
    request<{ active: TeacherAssignment[]; past: TeacherAssignment[] }>('/api/teacher/assignments'),

  getClassStudents: (classId: string) =>
    request<{ class: AcademicClass; students: any[] }>(`/api/teacher/classes/${classId}/students`),

  getMarksGrid: (classId: string, subjectId: string, semesterId?: string) => {
    const q = semesterId ? `?semester_id=${semesterId}` : '';
    return request<{ students: any[]; examColumns: any[]; grid: Record<string, any> }>(
      `/api/teacher/classes/${classId}/subjects/${subjectId}/marks${q}`
    );
  },

  saveMarksGrid: (classId: string, subjectId: string, payload: { semester_id?: string; updates: any[] }) =>
    request<{ message: string; savedCount: number; validationWarnings?: string[] }>(
      `/api/teacher/classes/${classId}/subjects/${subjectId}/marks`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    ),

  getTeacherAnalytics: (payload: {
    classId: string;
    scope?: string;
    studentIds?: string[];
    selectedSemesters?: string[];
    selectedExamTypes?: string[];
    subjectId?: string;
  }) => request<AnalyticsResponse>('/api/teacher/analytics', {
    method: 'POST',
    body: JSON.stringify(payload),
  }),

  askTeacherAi: (query: string) =>
    request<{ answer: string; toolCallsExecuted: any[]; resolvedIntent: string }>('/api/teacher/ai-query', {
      method: 'POST',
      body: JSON.stringify({ query }),
    }),

  getTeacherNotifications: () => request<NotificationItem[]>('/api/teacher/notifications'),

  markTeacherNotificationRead: (id: string) =>
    request<{ message: string }>(`/api/teacher/notifications/${id}/read`, {
      method: 'POST',
    }),

  postTeacherAnnouncement: (data: { title: string; body: string; class_id: string }) =>
    request<{ message: string; notification: NotificationItem }>('/api/teacher/announcements', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Student
  getStudentProfile: () => request<StudentProfile>('/api/student/profile'),

  updateStudentProfile: (payload: { bio?: string; linkedin_url?: string; github_url?: string }) =>
    request<{ message: string; student: any }>('/api/student/profile', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  uploadStudentPhoto: (photoDataUrl: string) =>
    request<{ message: string; profile_photo_url: string; profile_strength: number }>('/api/student/upload-photo', {
      method: 'POST',
      body: JSON.stringify({ photo_data_url: photoDataUrl }),
    }),

  uploadStudentResume: (payload: { file_name: string; file_text?: string; file_url?: string }) =>
    request<{ message: string; document: any; profile_strength: number }>('/api/student/upload-resume', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getStudentMarks: () =>
    request<{ semestersData: any[]; cgpaTrend: any[]; officialMarksheets: Marksheet[] }>('/api/student/marks'),

  downloadStudentMarksheet: async (marksheetId: string) => {
    const token = getToken();
    const res = await fetch(`/api/student/marksheets/${marksheetId}/file`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Request failed with status ${res.status}`);
    }
    return res.blob();
  },

  getStudentNotifications: () => request<NotificationItem[]>('/api/student/notifications'),

  markNotificationRead: (id: string) =>
    request<{ message: string }>(`/api/student/notifications/${id}/read`, {
      method: 'POST',
    }),

  markAllNotificationsRead: () =>
    request<{ message: string }>('/api/student/notifications/read-all', {
      method: 'POST',
    }),

  askStudentAi: (query: string) =>
    request<{ answer: string; toolCallsExecuted: any[]; resolvedIntent: string }>('/api/student/ai-query', {
      method: 'POST',
      body: JSON.stringify({ query }),
    }),

  // Student Documents Vault
  getStudentDocuments: () => request<any[]>('/api/student/documents'),
  uploadStudentDocument: (payload: { title: string; description?: string; category: string; file_name: string; file_url?: string }) =>
    request<{ message: string; document: any }>('/api/student/documents', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  deleteStudentDocument: (id: string) =>
    request<{ message: string }>(`/api/student/documents/${id}`, {
      method: 'DELETE',
    }),

  // Student Projects
  getStudentProjects: () => request<any[]>('/api/student/projects'),
  createStudentProject: (payload: any) =>
    request<{ message: string; project: any }>('/api/student/projects', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateStudentProject: (id: string, payload: any) =>
    request<{ message: string; project: any }>(`/api/student/projects/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  deleteStudentProject: (id: string) =>
    request<{ message: string }>(`/api/student/projects/${id}`, {
      method: 'DELETE',
    }),

  // Student Achievements
  getStudentAchievements: () => request<any[]>('/api/student/achievements'),
  createStudentAchievement: (payload: any) =>
    request<{ message: string; achievement: any }>('/api/student/achievements', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  deleteStudentAchievement: (id: string) =>
    request<{ message: string }>(`/api/student/achievements/${id}`, {
      method: 'DELETE',
    }),

  // Student Certifications
  getStudentCertifications: () => request<any[]>('/api/student/certifications'),
  createStudentCertification: (payload: any) =>
    request<{ message: string; certification: any }>('/api/student/certifications', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  deleteStudentCertification: (id: string) =>
    request<{ message: string }>(`/api/student/certifications/${id}`, {
      method: 'DELETE',
    }),

  // Student Hackathons
  getStudentHackathons: () => request<any[]>('/api/student/hackathons'),
  createStudentHackathon: (payload: any) =>
    request<{ message: string; hackathon: any }>('/api/student/hackathons', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  deleteStudentHackathon: (id: string) =>
    request<{ message: string }>(`/api/student/hackathons/${id}`, {
      method: 'DELETE',
    }),

  // College Events
  getCollegeEvents: () => request<any[]>('/api/student/events'),
  getAdminEvents: () => request<any[]>('/api/admin/events'),
  createAdminEvent: (payload: any) =>
    request<{ message: string; event: any }>('/api/admin/events', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  deleteAdminEvent: (id: string) =>
    request<{ message: string }>(`/api/admin/events/${id}`, {
      method: 'DELETE',
    }),

  // Faculty extensions
  getStudentFullProfileForTeacher: (studentId: string) =>
    request<any>(`/api/teacher/students/${studentId}/full-profile`),
  importTeacherMarks: (classId: string, subjectId: string, semesterId: string, entries: any[]) =>
    request<{ message: string; importedCount: number; errors: any[] }>(
      `/api/teacher/classes/${classId}/subjects/${subjectId}/import-marks`,
      {
        method: 'POST',
        body: JSON.stringify({ semester_id: semesterId, entries }),
      }
    ),
};

