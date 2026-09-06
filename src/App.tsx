import { Fragment, useEffect, useState, type FormEvent } from 'react'
import { Bar, Line, Pie } from 'react-chartjs-2'
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement, PointElement, ArcElement, Tooltip, Legend } from 'chart.js'
import './App.css'
import { apiFetch, login, type SessionUser } from './api'

type Role = 'student' | 'teacher' | 'admin'
type TeacherAssignment = { id: string; class_name: string; subject_name: string; class_id: string; subject_id: string; semester_id: string; sem_number?: number; academic_year?: string; status?: string }
type AnalyticsResponse = { raw: Array<{ studentId: string; studentName: string; rollNumber: string; semesterId: string; semesterLabel: string; examType: string; marksObtained: number; maxMarks: number; percentage: number }>; stats: { mean: number; median: number; stdDev: number; min: number; max: number; count: number }; perStudentStats: Array<{ studentId: string; studentName: string; mean: number; trend: Array<{ semesterLabel: string; avgPercentage: number }> }>; gradeDistribution: { A: number; B: number; C: number; D: number; F: number }; regression: { slope: number; intercept: number; rSquared: number; predictedNextValue: number; pointsUsed: Array<{ x: number; y: number }> } | { reason: string } }

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, ArcElement, Tooltip, Legend)

const roleLabels: Record<Role, string> = {
  student: 'Student workspace',
  teacher: 'Faculty workspace',
  admin: 'College admin workspace',
}

const roleNav: Record<Role, string[]> = {
  student: ['Overview', 'My profile', 'Academic records', 'Notifications'],
  teacher: ['Overview', 'My classes', 'Marks entry', 'Analytics'],
  admin: ['Overview', 'Users', 'Assignments', 'Marksheets', 'Notifications', 'College analytics'],
}

function App() {
  const [session, setSession] = useState<{ token: string; user: SessionUser } | null>(() => {
    const stored = sessionStorage.getItem('student-profile-session')
    return stored ? JSON.parse(stored) as { token: string; user: SessionUser } : null
  })
  const [role, setRole] = useState<Role>(() => session?.user.role === 'super_admin' ? 'admin' : session?.user.role ?? 'teacher')
  const [activeNav, setActiveNav] = useState('Overview')
  const [liveAssignments, setLiveAssignments] = useState<TeacherAssignment[]>([])
  const [selectedAssignmentId, setSelectedAssignmentId] = useState('')
  const [liveProfileStrength, setLiveProfileStrength] = useState<number | null>(null)
  const [liveProfile, setLiveProfile] = useState<{ full_name: string; profile_photo_url: string | null; bio: string | null; linkedin_url: string | null; github_url: string | null; class_name: string | null; department_name: string | null; roll_number: string; profile_strength: number } | null>(null)
  const [liveNotifications, setLiveNotifications] = useState<Array<{ id: string; title: string; body: string | null; created_at: string; is_read: boolean }>>([])
  const [liveMarks, setLiveMarks] = useState<Array<{ subject_name: string; marks_obtained: string; max_marks: string; sem_number: number; academic_year: string }>>([])
  const [liveMarksheets, setLiveMarksheets] = useState<Array<{ id: string; file_url: string; sgpa: string | null; cgpa: string | null; sem_number: number; academic_year: string }>>([])
  const [liveAnalytics, setLiveAnalytics] = useState<{ average_percentage: string | null; top_percentage: string | null; student_count: number } | null>(null)
  const [liveAdminUsers, setLiveAdminUsers] = useState<Array<{ id: string; email: string; full_name: string; role: string; is_active: boolean; must_reset_password: boolean }>>([])
  const [liveAdminAssignments, setLiveAdminAssignments] = useState<Array<{ id: string; status: string }>>([])
  const [liveAdminOverview, setLiveAdminOverview] = useState<{ student_count: number; teacher_count: number; class_count: number; active_semester_count: number } | null>(null)
  const [dataNotice, setDataNotice] = useState('')
  const name = session?.user.fullName ?? ''
  const initials = name.split(' ').map((part) => part[0]).join('')

  useEffect(() => {
    if (!session || session.user.mustResetPassword) return
    const loadDashboardData = async () => {
      try {
        if (session.user.role === 'teacher') {
          const result = await apiFetch<{ assignments: TeacherAssignment[] }>('/api/teacher/assignments', session.token)
          setLiveAssignments(result.assignments)
          setSelectedAssignmentId((current) => current && result.assignments.some((assignment) => assignment.id === current) ? current : result.assignments[0]?.id ?? '')
        }
        if (session.user.role === 'student') {
          const result = await apiFetch<{ profile: typeof liveProfile & { profile_strength: number } }>('/api/students/me', session.token)
          setLiveProfile(result.profile)
          setLiveProfileStrength(result.profile.profile_strength)
          const notifications = await apiFetch<{ notifications: Array<{ id: string; title: string; body: string | null; created_at: string; is_read: boolean }> }>('/api/students/me/notifications', session.token)
          setLiveNotifications(notifications.notifications)
          const marks = await apiFetch<{ marks: typeof liveMarks }>('/api/students/me/marks', session.token)
          setLiveMarks(marks.marks)
          const marksheets = await apiFetch<{ marksheets: Array<{ id: string; file_url: string; sgpa: string | null; cgpa: string | null; sem_number: number; academic_year: string }> }>('/api/students/me/marksheets', session.token)
          setLiveMarksheets(marksheets.marksheets)
        }
        if (session.user.role === 'super_admin') {
          const users = await apiFetch<{ users: typeof liveAdminUsers }>('/api/admin/users', session.token)
          const assignments = await apiFetch<{ assignments: Array<{ id: string; status: string }> }>('/api/admin/assignments', session.token)
          const overview = await apiFetch<{ overview: typeof liveAdminOverview }>('/api/admin/overview', session.token)
          setLiveAdminUsers(users.users)
          setLiveAdminAssignments(assignments.assignments)
          setLiveAdminOverview(overview.overview)
        }
      } catch (error) {
        if (error instanceof Error && error.message === 'Invalid or expired token') {
          sessionStorage.removeItem('student-profile-session')
          setSession(null)
          return
        }
        setDataNotice(error instanceof Error ? error.message : 'Live data is temporarily unavailable')
      }
    }
    void loadDashboardData()
  }, [session])

  const selectedAssignment = liveAssignments.find((assignment) => assignment.id === selectedAssignmentId) ?? liveAssignments[0]
  const orderedAssignments = selectedAssignment ? [selectedAssignment, ...liveAssignments.filter((assignment) => assignment.id !== selectedAssignment.id)] : liveAssignments

  useEffect(() => {
    if (session?.user.role !== 'teacher' || !selectedAssignment) return
    const loadAnalytics = async () => {
      try {
        const analytics = await apiFetch<{ analytics: { average_percentage: string | null; top_percentage: string | null; student_count: number } }>(`/api/teacher/analytics?classId=${selectedAssignment.class_id}&subjectId=${selectedAssignment.subject_id}&semesterId=${selectedAssignment.semester_id}`, session.token)
        setLiveAnalytics(analytics.analytics)
      } catch (error) {
        setDataNotice(error instanceof Error ? error.message : 'Unable to load assignment analytics')
      }
    }
    void loadAnalytics()
  }, [session, selectedAssignment])

  if (!session) {
    return <LoginScreen onLogin={(nextSession) => {
      sessionStorage.setItem('student-profile-session', JSON.stringify(nextSession))
      setSession(nextSession)
      setRole(nextSession.user.role === 'super_admin' ? 'admin' : nextSession.user.role)
    }} />
  }

  if (session.user.mustResetPassword) {
    return <ResetPasswordScreen token={session.token} onComplete={(nextSession) => {
      sessionStorage.setItem('student-profile-session', JSON.stringify(nextSession))
      setSession(nextSession)
    }} />
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">s</span><span>student profile</span></div>
        <div className="workspace"><span className="avatar avatar-teal">{initials}</span><span><strong>{name}</strong><small>{roleLabels[role]}</small></span><span className="chevron">⌄</span></div>
        <nav aria-label="Main navigation">
          <p className="nav-label">Workspace</p>
          {roleNav[role].map((item, index) => <button className={activeNav === item ? 'nav-item active' : 'nav-item'} key={item} onClick={() => setActiveNav(item)}><span className="nav-icon">{['◒', '▦', '↗', '⌁'][index]}</span>{item}{(item === 'Analytics' || item === 'College analytics') && <span className="nav-badge">New</span>}</button>)}
          <p className="nav-label nav-spacer">Manage</p>
          <button className="nav-item" onClick={() => setActiveNav(role === 'student' ? 'My profile' : 'Users')}><span className="nav-icon">♧</span>{role === 'student' ? 'My documents' : 'Students'}</button>
          <button className="nav-item"><span className="nav-icon">⚙</span>Settings</button>
        </nav>
        <div className="sidebar-bottom"><div className="help-icon">?</div><div><strong>Need a hand?</strong><small>Visit the help center</small></div><span>↗</span></div>
      </aside>
      <main className="main-content">
        <header className="topbar"><div className="breadcrumb"><span>{roleLabels[role]}</span><b>/</b><strong>{activeNav}</strong></div><div className="top-actions"><button className="icon-button" aria-label="Notifications">♢<i></i></button><button className="profile-chip" onClick={() => { sessionStorage.removeItem('student-profile-session'); setSession(null) }}><span className="avatar avatar-orange">{initials}</span><span>{session.user.email}</span><span>↪</span></button></div></header>
        <section className="content-wrap">
          <div className="welcome-row"><div><p className="eyebrow">{new Date().toLocaleDateString()}</p><h1>Welcome back, {name.split(' ')[0]}.</h1><p className="subheading">{role === 'student' ? 'Keep your academic record and professional profile up to date.' : role === 'admin' ? 'Manage your college workspace and academic records.' : 'Review your assigned classes and student performance.'}</p></div></div>
          {dataNotice && <div className="data-notice">{dataNotice}</div>}
          <LiveDataSummary role={role} notifications={liveNotifications} marks={liveMarks} analytics={liveAnalytics} />
          <RoleStats role={role} profileStrength={liveProfileStrength} marks={liveMarks} marksheets={liveMarksheets} analytics={liveAnalytics} assignments={liveAssignments} adminOverview={liveAdminOverview} />
          {role === 'student' && activeNav === 'Academic records' ? <StudentRecordsPage marks={liveMarks} marksheets={liveMarksheets} /> : role === 'student' && activeNav === 'Notifications' ? <StudentNotificationsPage token={session.token} notifications={liveNotifications} /> : role === 'student' && activeNav === 'My profile' ? <StudentProfilePage token={session.token} profile={liveProfile} onSaved={(profile) => { setLiveProfile((current) => current ? { ...current, ...profile } : current); setLiveProfileStrength(profile.profile_strength) }} /> : role === 'student' ? <StudentOverview setActiveNav={setActiveNav} profile={liveProfile} profileStrength={liveProfileStrength} marks={liveMarks} notifications={liveNotifications} marksheets={liveMarksheets} /> : role === 'teacher' && activeNav === 'My classes' ? <TeacherAssignmentsPage assignments={liveAssignments} selectedAssignmentId={selectedAssignment?.id ?? ''} onSelect={setSelectedAssignmentId} /> : role === 'teacher' && activeNav === 'Marks entry' ? <TeacherMarksEntry token={session.token} assignments={orderedAssignments} /> : role === 'teacher' && activeNav === 'Analytics' ? <TeacherAnalyticsPage token={session.token} assignments={orderedAssignments} /> : role === 'admin' && activeNav === 'Users' ? <AdminUsersPage token={session.token} /> : role === 'admin' && activeNav === 'Assignments' ? <AdminAssignmentsPage token={session.token} /> : role === 'admin' && activeNav === 'Marksheets' ? <AdminMarksheetsPage token={session.token} /> : role === 'admin' && activeNav === 'Notifications' ? <AdminNotificationsPage token={session.token} /> : <FacultyOverview role={role} assignments={liveAssignments} analytics={liveAnalytics} adminUsers={liveAdminUsers} adminAssignments={liveAdminAssignments} setActiveNav={setActiveNav} />}
        </section>
      </main>
    </div>
  )
}

function LoginScreen({ onLogin }: { onLogin: (session: { token: string; user: SessionUser }) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setIsLoading(true)
    try {
      const result = await login(email, password)
      onLogin({ token: result.accessToken, user: result.user })
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'Unable to sign in')
    } finally {
      setIsLoading(false)
    }
  }

  return <main className="login-shell"><section className="login-panel"><div className="brand login-brand"><span className="brand-mark">s</span><span>student profile</span></div><p className="eyebrow">Northstar College</p><h1>Your academic journey, in one place.</h1><p className="login-copy">Sign in to manage your profile, academic records, and college updates.</p><form onSubmit={submit}><label>Email address<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label><label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} required /></label>{error && <p className="login-error">{error}</p>}<button className="primary-button login-button" disabled={isLoading}>{isLoading ? 'Signing in...' : 'Sign in to workspace →'}</button></form><p className="login-note">Use your college account. Your role and permissions are applied by the server.</p></section><aside className="login-aside"><div className="aside-mark">✦</div><p className="eyebrow">One connected campus</p><h2>Profiles, performance, and progress that move with you.</h2><div className="aside-points"><span><b>01</b> Build a stronger student profile</span><span><b>02</b> Keep every semester in view</span><span><b>03</b> Give faculty the right insight</span></div></aside></main>
}

function ResetPasswordScreen({ token, onComplete }: { token: string; onComplete: (session: { token: string; user: SessionUser }) => void }) {
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    if (password !== confirmation) {
      setError('Passwords do not match')
      return
    }
    setIsLoading(true)
    try {
      const result = await apiFetch<{ accessToken: string; user: SessionUser }>('/api/auth/reset-password', token, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ newPassword: password }) })
      onComplete({ token: result.accessToken, user: result.user })
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : 'Unable to reset password')
    } finally {
      setIsLoading(false)
    }
  }

  return <main className="login-shell"><section className="login-panel"><div className="brand login-brand"><span className="brand-mark">s</span><span>student profile</span></div><p className="eyebrow">Password update required</p><h1>Set a new password before continuing.</h1><p className="login-copy">Your account must use a new password before you can access the workspace.</p><form onSubmit={submit}><label>New password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} required /></label><label>Confirm new password<input type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} minLength={8} required /></label>{error && <p className="login-error">{error}</p>}<button className="primary-button login-button" disabled={isLoading}>{isLoading ? 'Updating password...' : 'Update password →'}</button></form></section><aside className="login-aside"><div className="aside-mark">✦</div><p className="eyebrow">Account security</p><h2>A quick update keeps your college account protected.</h2></aside></main>
}

function RoleStats({ role, profileStrength, marks, marksheets, analytics, assignments, adminOverview }: { role: Role; profileStrength: number | null; marks: Array<{ sem_number: number }>; marksheets: Array<{ cgpa: string | null }>; analytics: { average_percentage: string | null; top_percentage: string | null; student_count: number } | null; assignments: Array<{ class_name: string; subject_name: string }>; adminOverview: { student_count: number; teacher_count: number; class_count: number; active_semester_count: number } | null }) {
  const stats = role === 'student'
    ? [['Profile strength', profileStrength === null ? '—' : `${profileStrength}%`, 'Live', 'from your profile'], ['Current CGPA', marksheets[0]?.cgpa ?? '—', 'Official', 'latest result'], ['Semesters complete', marks.length ? String(new Set(marks.map((mark) => mark.sem_number)).size) : '—', 'Recorded', 'in academic records'], ['Unread updates', '—', 'Open inbox', 'to view status']]
    : role === 'admin'
      ? [['Total students', String(adminOverview?.student_count ?? 0), 'Live', 'in this college'], ['Faculty members', String(adminOverview?.teacher_count ?? 0), 'Live', 'in this college'], ['Classes', String(adminOverview?.class_count ?? 0), 'Live', 'in this college'], ['Active semesters', String(adminOverview?.active_semester_count ?? 0), 'Live', 'currently running']]
      : [['Assigned subjects', String(assignments.length), 'Live', 'from assignments'], ['Class average', analytics?.average_percentage ? `${analytics.average_percentage}%` : '—', 'Live', 'selected assignment'], ['Students in scope', analytics ? String(analytics.student_count) : '—', 'Live', 'selected assignment'], ['Top score', analytics?.top_percentage ? `${analytics.top_percentage}%` : '—', 'Live', 'selected assignment']]
  return <div className="stats-grid">{stats.map(([label, number, change, detail], index) => <div className="stat-card" key={label}><div className="stat-label">{label} <span className={`stat-dot ${['mint', 'purple', 'orange', 'red'][index]}`}></span></div><div className="stat-number">{number}</div><div className={`stat-foot ${change.startsWith('↑') ? 'positive' : change.startsWith('↓') ? 'warning' : 'neutral'}`}>{change} <span>{detail}</span></div></div>)}</div>
}

function AdminUsersPage({ token }: { token: string }) {
  const [users, setUsers] = useState<Array<{ id: string; email: string; full_name: string; role: string; is_active: boolean; must_reset_password: boolean }>>([])
  const [rows, setRows] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    const loadUsers = async () => {
      try {
        const result = await apiFetch<{ users: typeof users }>('/api/admin/users', token)
        setUsers(result.users)
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Unable to load users')
      }
    }
    void loadUsers()
  }, [token])

  async function importUsers() {
    const importedUsers = rows.split('\n').map((row) => row.split(',').map((value) => value.trim())).filter((row) => row.length >= 4 && row[0])
    try {
      const result = await apiFetch<{ imported: number }>('/api/admin/users/bulk-import', token, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ users: importedUsers.map(([email, fullName, password, role, rollNumber]) => ({ email, fullName, password, role, ...(role === 'student' ? { rollNumber } : {}) })) }) })
      setMessage(`${result.imported} accounts imported. Temporary passwords require reset.`)
      const refreshed = await apiFetch<{ users: typeof users }>('/api/admin/users', token)
      setUsers(refreshed.users)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Import failed')
    }
  }

  return <div className="admin-users-page"><div className="records-page-heading"><div><p className="eyebrow">Administration</p><h2>People directory</h2><p>Onboard faculty and students into your college workspace.</p></div><button className="primary-button" onClick={() => void importUsers()}>Import accounts →</button></div><section className="panel import-panel"><div><h2>Bulk onboarding</h2><p>One account per line: email, full name, temporary password, role, optional student roll number.</p></div><textarea value={rows} onChange={(event) => setRows(event.target.value)} placeholder="email, full name, temporary password, teacher or student, optional roll number" aria-label="Bulk user rows" />{message && <p className="entry-message">{message}</p>}</section><section className="panel directory-panel"><div className="panel-heading"><div><h2>Current accounts</h2><p>{users.length} accounts in this college</p></div></div><div className="directory-table"><div className="directory-header"><span>Name</span><span>Email</span><span>Role</span><span>Status</span></div>{users.map((user) => <div className="directory-row" key={user.id}><strong>{user.full_name}</strong><span>{user.email}</span><span className={`role-pill ${user.role}`}>{user.role.replace('_', ' ')}</span><span className={user.is_active ? 'status-active' : 'status-inactive'}>{user.is_active ? 'Active' : 'Inactive'}</span></div>)}</div></section></div>
}

type AdminAssignment = { id: string; teacher_name: string; class_name: string; subject_name: string; sem_number: number; status: string }

async function fetchAdminAssignments(token: string) {
  const result = await apiFetch<{ assignments: AdminAssignment[] }>('/api/admin/assignments', token)
  return result.assignments
}

function AdminAssignmentsPage({ token }: { token: string }) {
  const [assignments, setAssignments] = useState<AdminAssignment[]>([])
  const [form, setForm] = useState({ teacherId: '', classId: '', subjectId: '', semesterId: '' })
  const [catalog, setCatalog] = useState<{ teachers: Array<{ id: string; full_name: string; email: string }>; classes: Array<{ id: string; name: string; year: number; section: string | null; department_name: string }>; subjects: Array<{ id: string; name: string; code: string | null; department_name: string }>; semesters: Array<{ id: string; sem_number: number; academic_year: string }> }>({ teachers: [], classes: [], subjects: [], semesters: [] })
  const [message, setMessage] = useState('')

  async function loadAssignments() {
    setAssignments(await fetchAdminAssignments(token))
  }

  useEffect(() => {
    void Promise.all([
      fetchAdminAssignments(token),
      apiFetch<typeof catalog>('/api/admin/catalog', token),
    ]).then(([nextAssignments, nextCatalog]) => { setAssignments(nextAssignments); setCatalog(nextCatalog) }).catch((error: unknown) => setMessage(error instanceof Error ? error.message : 'Unable to load assignments'))
  }, [token])

  async function saveAssignment() {
    try {
      await apiFetch('/api/admin/assignments', token, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      setMessage('Assignment saved and teacher access updated.')
      await loadAssignments()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save assignment')
    }
  }

  async function archiveAssignment(id: string) {
    try {
      await apiFetch(`/api/admin/assignments/${id}`, token, { method: 'DELETE' })
      await loadAssignments()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to archive assignment')
    }
  }

  return <div className="admin-users-page"><div className="records-page-heading"><div><p className="eyebrow">Administration</p><h2>Teaching assignments</h2><p>Control exactly which academic data each teacher can access.</p></div></div><section className="panel assignment-form"><div><h2>Assign a teacher</h2><p>Choose records from this college catalog. Past assignments are archived, never deleted.</p></div><div className="assignment-fields"><select value={form.teacherId} onChange={(event) => setForm((current) => ({ ...current, teacherId: event.target.value }))} aria-label="Teacher"><option value="">Select teacher</option>{catalog.teachers.map((teacher) => <option value={teacher.id} key={teacher.id}>{teacher.full_name} · {teacher.email}</option>)}</select><select value={form.classId} onChange={(event) => setForm((current) => ({ ...current, classId: event.target.value }))} aria-label="Class"><option value="">Select class</option>{catalog.classes.map((item) => <option value={item.id} key={item.id}>{item.department_name} · {item.name}</option>)}</select><select value={form.subjectId} onChange={(event) => setForm((current) => ({ ...current, subjectId: event.target.value }))} aria-label="Subject"><option value="">Select subject</option>{catalog.subjects.map((item) => <option value={item.id} key={item.id}>{item.department_name} · {item.name} {item.code ? `(${item.code})` : ''}</option>)}</select><select value={form.semesterId} onChange={(event) => setForm((current) => ({ ...current, semesterId: event.target.value }))} aria-label="Semester"><option value="">Select semester</option>{catalog.semesters.map((item) => <option value={item.id} key={item.id}>{item.academic_year} · Semester {item.sem_number}</option>)}</select><button className="primary-button" onClick={() => void saveAssignment()}>Save assignment →</button></div>{message && <p className="entry-message">{message}</p>}</section><section className="panel directory-panel"><div className="panel-heading"><div><h2>Assignment history</h2><p>{assignments.length} records · past assignments are preserved</p></div></div><div className="directory-table"><div className="directory-header assignment-grid"><span>Teacher</span><span>Class</span><span>Subject</span><span>Status</span><span></span></div>{assignments.map((assignment) => <div className="directory-row assignment-grid" key={assignment.id}><strong>{assignment.teacher_name}</strong><span>{assignment.class_name}</span><span>{assignment.subject_name} · Sem {assignment.sem_number}</span><span className={assignment.status === 'active' ? 'status-active' : 'status-inactive'}>{assignment.status}</span><button className="archive-button" disabled={assignment.status !== 'active'} onClick={() => void archiveAssignment(assignment.id)}>Archive</button></div>)}</div></section></div>
}

function AdminMarksheetsPage({ token }: { token: string }) {
  const [form, setForm] = useState({ studentId: '', semesterId: '', fileUrl: '', sgpa: '', cgpa: '' })
  const [message, setMessage] = useState('')

  async function registerMarksheet() {
    try {
      await apiFetch('/api/admin/marksheets', token, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, sgpa: form.sgpa ? Number(form.sgpa) : undefined, cgpa: form.cgpa ? Number(form.cgpa) : undefined }) })
      setMessage('Official marksheet registered successfully and is now available to the student.')
      setForm({ studentId: '', semesterId: '', fileUrl: '', sgpa: '', cgpa: '' })
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to register marksheet')
    }
  }

  return <div className="admin-users-page"><div className="records-page-heading"><div><p className="eyebrow">Administration</p><h2>Official marksheets</h2><p>Publish verified semester results to student academic records.</p></div></div><section className="panel import-panel"><div><h2>Register a marksheet</h2><p>Upload the file to storage first, then register its secure URL here.</p></div><div className="marksheet-fields"><input value={form.studentId} onChange={(event) => setForm((current) => ({ ...current, studentId: event.target.value }))} placeholder="Student ID" aria-label="Student ID" /><input value={form.semesterId} onChange={(event) => setForm((current) => ({ ...current, semesterId: event.target.value }))} placeholder="Semester ID" aria-label="Semester ID" /><input value={form.fileUrl} onChange={(event) => setForm((current) => ({ ...current, fileUrl: event.target.value }))} placeholder="Secure file URL" aria-label="Secure file URL" /><input type="number" min="0" max="10" step="0.01" value={form.sgpa} onChange={(event) => setForm((current) => ({ ...current, sgpa: event.target.value }))} placeholder="SGPA" aria-label="SGPA" /><input type="number" min="0" max="10" step="0.01" value={form.cgpa} onChange={(event) => setForm((current) => ({ ...current, cgpa: event.target.value }))} placeholder="CGPA" aria-label="CGPA" /></div><button className="primary-button" onClick={() => void registerMarksheet()}>Publish marksheet →</button>{message && <p className="entry-message">{message}</p>}</section></div>
}

function AdminNotificationsPage({ token }: { token: string }) {
  const [form, setForm] = useState({ title: '', body: '', targetRole: 'all', targetClassId: '', fileUrl: '' })
  const [message, setMessage] = useState('')

  async function publishNotification() {
    try {
      await apiFetch('/api/admin/notifications', token, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, targetClassId: form.targetClassId || undefined, fileUrl: form.fileUrl || undefined }) })
      setMessage('Notification published to the selected audience.')
      setForm({ title: '', body: '', targetRole: 'all', targetClassId: '', fileUrl: '' })
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to publish notification')
    }
  }

  return <div className="admin-users-page"><div className="records-page-heading"><div><p className="eyebrow">Administration</p><h2>College communications</h2><p>Send timely, targeted updates to students and faculty.</p></div></div><section className="panel notification-composer"><div><h2>Compose notification</h2><p>Choose a role, optionally narrow it to a class, and publish.</p></div><input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="Notification title" aria-label="Notification title" /><textarea value={form.body} onChange={(event) => setForm((current) => ({ ...current, body: event.target.value }))} placeholder="Write the announcement..." aria-label="Notification body" /><div className="notification-options"><select value={form.targetRole} onChange={(event) => setForm((current) => ({ ...current, targetRole: event.target.value }))} aria-label="Target role"><option value="all">Everyone</option><option value="students">Students</option><option value="teachers">Teachers</option></select><input value={form.targetClassId} onChange={(event) => setForm((current) => ({ ...current, targetClassId: event.target.value }))} placeholder="Optional class ID" aria-label="Optional class ID" /><input value={form.fileUrl} onChange={(event) => setForm((current) => ({ ...current, fileUrl: event.target.value }))} placeholder="Optional attachment URL" aria-label="Optional attachment URL" /></div><button className="primary-button" onClick={() => void publishNotification()}>Publish notification →</button>{message && <p className="entry-message">{message}</p>}</section></div>
}

function TeacherAssignmentsPage({ assignments, selectedAssignmentId, onSelect }: { assignments: TeacherAssignment[]; selectedAssignmentId: string; onSelect: (id: string) => void }) {
  const activeAssignments = assignments.filter((assignment) => assignment.status === 'active')
  const pastAssignments = assignments.filter((assignment) => assignment.status === 'past')
  return <div className="admin-users-page"><div className="records-page-heading"><div><p className="eyebrow">Teacher workspace</p><h2>My classes</h2><p>Every class shown here was granted by a college admin. Selecting one re-scopes marks and analytics.</p></div></div><section className="panel directory-panel"><div className="panel-heading"><div><h2>Current teaching</h2><p>{activeAssignments.length} assigned combinations</p></div></div><div className="class-list">{activeAssignments.length ? activeAssignments.map((assignment) => <button className={assignment.id === selectedAssignmentId ? 'class-row selected' : 'class-row'} key={assignment.id} onClick={() => onSelect(assignment.id)}><span className="class-icon class-0">C</span><span className="class-name"><strong>{assignment.class_name} · {assignment.subject_name}</strong><small>{assignment.academic_year ?? 'Academic year unavailable'} · Semester {assignment.sem_number ?? '—'}</small></span><span className="row-arrow">›</span></button>) : <div className="empty-records">No active assignments.</div>}</div></section><section className="panel directory-panel"><div className="panel-heading"><div><h2>Teaching history</h2><p>{pastAssignments.length} past combinations retained for audit access</p></div></div><div className="class-list">{pastAssignments.length ? pastAssignments.map((assignment) => <button className={assignment.id === selectedAssignmentId ? 'class-row selected' : 'class-row'} key={assignment.id} onClick={() => onSelect(assignment.id)}><span className="class-icon class-1">H</span><span className="class-name"><strong>{assignment.class_name} · {assignment.subject_name}</strong><small>{assignment.academic_year ?? 'Academic year unavailable'} · Semester {assignment.sem_number ?? '—'}</small></span><span className="row-arrow">›</span></button>) : <div className="empty-records">No past assignments.</div>}</div></section></div>
}

function TeacherMarksEntry({ token, assignments }: { token: string; assignments: TeacherAssignment[] }) {
  const [assignmentIndex, setAssignmentIndex] = useState(0)
  const [students, setStudents] = useState<Array<{ id: string; full_name: string; roll_number: string }>>([])
  const [marks, setMarks] = useState<Record<string, string>>({})
  const [examType, setExamType] = useState('midterm')
  const [message, setMessage] = useState('')
  const assignment = assignments[assignmentIndex]

  useEffect(() => {
    if (!assignment) return
    const loadStudents = async () => {
      try {
        const result = await apiFetch<{ students: Array<{ id: string; full_name: string; roll_number: string }> }>(`/api/teacher/classes/${assignment.class_id}/students?subjectId=${assignment.subject_id}&semesterId=${assignment.semester_id}`, token)
        setStudents(result.students)
        setMarks(Object.fromEntries(result.students.map((student) => [student.id, ''])))
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Unable to load students')
      }
    }
    void loadStudents()
  }, [assignment, token])

  async function submitMarks() {
    if (!assignment) return
    const entries = students.filter((student) => marks[student.id] !== '').map((student) => ({ studentId: student.id, marksObtained: Number(marks[student.id]), maxMarks: 100 }))
    if (!entries.length || entries.some((entry) => !Number.isFinite(entry.marksObtained) || entry.marksObtained < 0 || entry.marksObtained > 100)) {
      setMessage('Enter marks from 0 to 100 for at least one student.')
      return
    }
    try {
      const result = await apiFetch<{ saved: number }>('/api/teacher/marks', token, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ classId: assignment.class_id, subjectId: assignment.subject_id, semesterId: assignment.semester_id, examType, marks: entries }) })
      setMessage(`${result.saved} mark${result.saved === 1 ? '' : 's'} saved successfully.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save marks')
    }
  }

  if (!assignment) return <div className="empty-workspace"><p className="eyebrow">Marks entry</p><h2>No active assignments yet.</h2><p>Your college admin needs to assign a class and subject before marks can be entered.</p></div>
  return <div className="marks-entry-page"><div className="records-page-heading"><div><p className="eyebrow">Marks entry</p><h2>{assignment.class_name} · {assignment.subject_name}</h2><p>Only students inside your assigned class are available here.</p></div><div className="marks-entry-actions"><select value={assignmentIndex} onChange={(event) => setAssignmentIndex(Number(event.target.value))}>{assignments.map((item, index) => <option value={index} key={`${item.class_id}-${item.subject_id}`}>{item.class_name} · {item.subject_name}</option>)}</select><select value={examType} onChange={(event) => setExamType(event.target.value)}><option value="internal1">Internal 1</option><option value="internal2">Internal 2</option><option value="midterm">Midterm</option><option value="final">Final</option><option value="assignment">Assignment</option><option value="practical">Practical</option></select></div></div><section className="panel entry-panel"><div className="entry-toolbar"><span>{students.length} students in scope</span><button className="primary-button" onClick={() => void submitMarks()}>Save marks →</button></div>{message && <p className="entry-message">{message}</p>}<div className="entry-table"><div className="entry-header"><span>Student</span><span>Roll number</span><span>Marks / 100</span></div>{students.length ? students.map((student) => <div className="entry-row" key={student.id}><span><strong>{student.full_name}</strong></span><span>{student.roll_number}</span><input type="number" min="0" max="100" value={marks[student.id] ?? ''} onChange={(event) => setMarks((current) => ({ ...current, [student.id]: event.target.value }))} placeholder="0" /></div>) : <div className="empty-records">No students returned for this assignment.</div>}</div></section></div>
}

function TeacherAnalyticsPage({ token, assignments }: { token: string; assignments: TeacherAssignment[] }) {
  const [assignmentId, setAssignmentId] = useState(assignments[0]?.id ?? '')
  const [mode, setMode] = useState<'class' | 'students' | 'student'>('class')
  const [examTypes, setExamTypes] = useState(['internal1', 'internal2', 'midterm', 'final', 'assignment', 'practical'])
  const [students, setStudents] = useState<Array<{ id: string; full_name: string; roll_number: string }>>([])
  const [selectedStudents, setSelectedStudents] = useState<string[]>([])
  const [data, setData] = useState<AnalyticsResponse | null>(null)
  const [message, setMessage] = useState('')
  const assignment = assignments.find((item) => item.id === assignmentId) ?? assignments[0]
  const availableExams = ['internal1', 'internal2', 'midterm', 'final', 'assignment', 'practical']

  useEffect(() => {
    if (!assignment) return
    const loadStudents = async () => {
      try {
        const result = await apiFetch<{ students: typeof students }>(`/api/teacher/classes/${assignment.class_id}/students?subjectId=${assignment.subject_id}&semesterId=${assignment.semester_id}`, token)
        setStudents(result.students)
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Unable to load students')
      }
    }
    void loadStudents()
  }, [assignment, token])

  useEffect(() => {
    if (!assignment || !examTypes.length) return
    const loadAnalytics = async () => {
      try {
        const result = await apiFetch<AnalyticsResponse>('/api/teacher/analytics/query', token, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ classId: assignment.class_id, subjectId: assignment.subject_id, studentIds: mode === 'class' ? null : selectedStudents, semesterIds: [assignment.semester_id], examTypes }) })
        setData(result)
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Unable to load analytics')
      }
    }
    void loadAnalytics()
  }, [assignment, examTypes, mode, selectedStudents, token])

  function exportCsv() {
    if (!data) return
    const rows = [['student', 'roll', 'semester', 'exam', 'marks', 'max', 'percentage'], ...data.raw.map((row) => [row.studentName, row.rollNumber, row.semesterLabel, row.examType, row.marksObtained, row.maxMarks, row.percentage])]
    const blob = new Blob([rows.map((row) => row.join(',')).join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'analytics.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  const examAverages = availableExams.map((exam) => { const rows = data?.raw.filter((row) => row.examType === exam) ?? []; return rows.length ? rows.reduce((sum, row) => sum + row.percentage, 0) / rows.length : 0 })
  const semesterLabels = data?.perStudentStats[0]?.trend.map((item) => item.semesterLabel) ?? []
  const semesterValues = data?.perStudentStats[0]?.trend.map((item) => item.avgPercentage) ?? []
  return <div className="analytics-page"><div className="records-page-heading"><div><p className="eyebrow">Teacher analytics</p><h2>Filtered academic performance</h2><p>Every filter is re-queried and re-authorized by the server.</p></div><button className="primary-button" onClick={exportCsv} disabled={!data?.raw.length}>Export CSV</button></div><section className="panel analytics-scope"><div className="assignment-fields"><select value={assignment?.id ?? ''} onChange={(event) => setAssignmentId(event.target.value)} aria-label="Class and subject">{assignments.map((item) => <option value={item.id} key={item.id}>{item.class_name} · {item.subject_name} · {item.academic_year ?? 'year'}</option>)}</select><select value={mode} onChange={(event) => setMode(event.target.value as typeof mode)} aria-label="Scope mode"><option value="class">Whole Class</option><option value="students">Select Students</option><option value="student">Single Student</option></select></div><div className="suggestion-row">{availableExams.map((exam) => <button className={examTypes.includes(exam) ? 'selected' : ''} key={exam} onClick={() => setExamTypes((current) => current.includes(exam) ? current.filter((item) => item !== exam) : [...current, exam])}>{exam}</button>)}</div>{mode !== 'class' && <div className="suggestion-row">{students.map((student) => <button className={selectedStudents.includes(student.id) ? 'selected' : ''} key={student.id} onClick={() => setSelectedStudents((current) => mode === 'student' ? [student.id] : current.includes(student.id) ? current.filter((id) => id !== student.id) : [...current, student.id])}>{student.full_name} · {student.roll_number}</button>)}</div>}</section>{data && <><div className="record-kpis"><div className="record-kpi"><span>Mean</span><strong>{data.stats.mean.toFixed(2)}%</strong></div><div className="record-kpi"><span>Median</span><strong>{data.stats.median.toFixed(2)}%</strong></div><div className="record-kpi"><span>Std dev</span><strong>{data.stats.stdDev.toFixed(2)}</strong></div><div className="record-kpi"><span>Records</span><strong>{data.stats.count}</strong></div></div><div className="analytics-grid"><section className="panel"><h2>Exam performance</h2><Bar data={{ labels: availableExams, datasets: [{ label: 'Average %', data: examAverages, backgroundColor: '#1f8a70' }] }} /></section><section className="panel"><h2>Grade distribution</h2><Pie data={{ labels: Object.keys(data.gradeDistribution), datasets: [{ data: Object.values(data.gradeDistribution), backgroundColor: ['#1f8a70', '#78c091', '#e1b866', '#dd875f', '#b95050'] }] }} /></section><section className="panel"><h2>Semester trend</h2><Line data={{ labels: semesterLabels, datasets: [{ label: 'Average %', data: semesterValues, borderColor: '#1f8a70', tension: 0.25 }] }} /></section><section className="panel"><h2>Regression</h2><p>{'reason' in data.regression ? 'Insufficient data for a trend line.' : `Predicted next value: ${data.regression.predictedNextValue.toFixed(2)}% · R² ${data.regression.rSquared.toFixed(2)}`}</p></section></div></>}{message && <p className="entry-message">{message}</p>}</div>
}

function StudentRecordsPage({ marks, marksheets }: { marks: Array<{ subject_name: string; marks_obtained: string; max_marks: string; sem_number: number; academic_year: string }>; marksheets: Array<{ id: string; file_url: string; sgpa: string | null; cgpa: string | null; sem_number: number; academic_year: string }> }) {
  const semesterOptions = [...new Set([...marks.map((mark) => `${mark.sem_number}|${mark.academic_year}`), ...marksheets.map((marksheet) => `${marksheet.sem_number}|${marksheet.academic_year}`)])]
  const [selectedSemester, setSelectedSemester] = useState(semesterOptions[0] ?? 'all')
  const filteredMarks = selectedSemester === 'all' ? marks : marks.filter((mark) => `${mark.sem_number}|${mark.academic_year}` === selectedSemester)
  const filteredMarksheets = selectedSemester === 'all' ? marksheets : marksheets.filter((marksheet) => `${marksheet.sem_number}|${marksheet.academic_year}` === selectedSemester)
  const average = filteredMarks.length ? Math.round(filteredMarks.reduce((total, mark) => total + (Number(mark.marks_obtained) / Number(mark.max_marks)) * 100, 0) / filteredMarks.length) : 0
  const latestMarksheet = filteredMarksheets[0] ?? marksheets[0]
  return <div className="records-page"><div className="records-page-heading"><div><p className="eyebrow">Academic records</p><h2>Progress across every semester</h2><p>Marks and official results linked to your college record.</p></div><select className="select-button" value={selectedSemester} onChange={(event) => setSelectedSemester(event.target.value)} aria-label="Semester"><option value="all">All semesters</option>{semesterOptions.map((option) => { const [semester, year] = option.split('|'); return <option value={option} key={option}>Semester {semester} · {year}</option> })}</select></div><div className="record-kpis"><div className="record-kpi"><span>Current SGPA</span><strong>{latestMarksheet?.sgpa ?? '—'}</strong><small>Latest official result</small></div><div className="record-kpi"><span>Current CGPA</span><strong>{latestMarksheet?.cgpa ?? '—'}</strong><small>Across completed semesters</small></div><div className="record-kpi"><span>Marks average</span><strong>{filteredMarks.length ? `${average}%` : '—'}</strong><small>{filteredMarks.length} records loaded</small></div></div><section className="panel marks-table-panel"><div className="panel-heading"><div><h2>Stored marks</h2><p>Assessment records from your college database</p></div></div><div className="marks-table">{filteredMarks.length ? filteredMarks.map((mark) => <div className="marks-row" key={`${mark.subject_name}-${mark.sem_number}-${mark.marks_obtained}`}><span><strong>{mark.subject_name}</strong><small>Semester {mark.sem_number} · {mark.academic_year}</small></span><b>{mark.marks_obtained} <small>/ {mark.max_marks}</small></b><i>{Math.round(Number(mark.marks_obtained) / Number(mark.max_marks) * 100)}%</i></div>) : <div className="empty-records">Your marks will appear here once faculty publish them.</div>}</div></section><section className="panel marksheet-panel"><div className="panel-heading"><div><h2>Official marksheets</h2><p>Download verified semester documents</p></div></div><div className="marksheet-list">{filteredMarksheets.length ? filteredMarksheets.map((marksheet) => <a className="marksheet-row" href={marksheet.file_url} target="_blank" rel="noreferrer" key={marksheet.id}><span className="document-icon">PDF</span><span><strong>Semester {marksheet.sem_number} marksheet</strong><small>{marksheet.academic_year} · SGPA {marksheet.sgpa ?? 'Pending'}</small></span><b>↗</b></a>) : <div className="empty-records">Official marksheets will be available after the college uploads them.</div>}</div></section></div>
}

function StudentNotificationsPage({ token, notifications: initialNotifications }: { token: string; notifications: Array<{ id: string; title: string; body: string | null; created_at: string; is_read: boolean }> }) {
  const [notifications, setNotifications] = useState(initialNotifications)
  async function markRead(id: string) {
    await apiFetch(`/api/students/me/notifications/${id}/read`, token, { method: 'POST' })
    setNotifications((current) => current.map((notification) => notification.id === id ? { ...notification, is_read: true } : notification))
  }
  async function markAllRead() {
    await apiFetch('/api/students/me/notifications/read-all', token, { method: 'POST' })
    setNotifications((current) => current.map((notification) => ({ ...notification, is_read: true })))
  }
  const unreadCount = notifications.filter((notification) => !notification.is_read).length
  return <div className="notifications-page"><div className="records-page-heading"><div><p className="eyebrow">Student inbox</p><h2>College notifications</h2><p>Stay current with announcements for your role and class.</p></div><div className="notification-heading-actions"><span className="notification-count">{unreadCount} unread</span>{unreadCount > 0 && <button className="text-button" onClick={() => void markAllRead()}>Mark all read →</button>}</div></div><section className="panel notification-list">{notifications.length ? notifications.map((notification) => <article className={notification.is_read ? 'notification-row' : 'notification-row unread'} key={notification.id}><div className="notification-status">{notification.is_read ? '✓' : '!'}</div><div><h3>{notification.title}</h3><p>{notification.body ?? 'College announcement'}</p><time>{new Date(notification.created_at).toLocaleDateString()}</time></div>{!notification.is_read && <button onClick={() => void markRead(notification.id)}>Mark read</button>}</article>) : <div className="empty-records">You are all caught up. New college updates will appear here.</div>}</section></div>
}

function LiveDataSummary({ role, notifications, marks, analytics }: { role: Role; notifications: Array<{ title: string; is_read: boolean }>; marks: Array<{ subject_name: string; marks_obtained: string; max_marks: string }>; analytics: { average_percentage: string | null; top_percentage: string | null; student_count: number } | null }) {
  if (role === 'student' && notifications.length) {
    const unreadCount = notifications.filter((notification) => !notification.is_read).length
    return <div className="live-summary"><span className="live-pulse"></span><strong>{unreadCount} unread update{unreadCount === 1 ? '' : 's'}</strong><span>{marks.length} academic records loaded</span></div>
  }
  if (role === 'teacher' && analytics) {
    return <div className="live-summary"><span className="live-pulse"></span><strong>Live class average {analytics.average_percentage ?? 0}%</strong><span>{analytics.student_count} students · top score {analytics.top_percentage ?? 0}%</span></div>
  }
  return null
}

function StudentProfilePage({ token, profile, onSaved }: { token: string; profile: { full_name: string; profile_photo_url: string | null; bio: string | null; linkedin_url: string | null; github_url: string | null; profile_strength: number } | null; onSaved: (profile: { full_name: string; profile_photo_url: string | null; bio: string | null; linkedin_url: string | null; github_url: string | null; profile_strength: number }) => void }) {
  const [form, setForm] = useState({ profilePhotoUrl: profile?.profile_photo_url ?? '', linkedinUrl: profile?.linkedin_url ?? '', githubUrl: profile?.github_url ?? '', bio: profile?.bio ?? '' })
  const [message, setMessage] = useState('')
  const [uploading, setUploading] = useState(false)
  const [documents, setDocuments] = useState<Array<{ id: string; doc_type: string; file_name: string | null; parsed_headings: Array<{ heading: string; content: string }> | null; status: string }>>([])
  useEffect(() => { void apiFetch<{ documents: typeof documents }>('/api/students/me/documents', token).then((result) => setDocuments(result.documents)).catch(() => undefined) }, [token])
  async function saveProfile() {
    try {
      const result = await apiFetch<{ profile: typeof profile }>('/api/students/me', token, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      if (result.profile) onSaved({ ...result.profile, full_name: profile?.full_name ?? '' })
      setMessage('Profile saved.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save profile')
    }
  }
  async function uploadDocument(file: File, docType: 'photo' | 'resume_pdf' | 'resume_docx') {
    setUploading(true)
    try {
      const presigned = await apiFetch<{ uploadUrl: string; objectKey: string }>('/api/students/me/documents/presign', token, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ docType, fileName: file.name, mimeType: file.type, sizeBytes: file.size }) })
      const upload = await fetch(presigned.uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file })
      if (!upload.ok) throw new Error('File upload failed')
      await apiFetch('/api/students/me/documents', token, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ docType, fileName: file.name, fileUrl: presigned.uploadUrl.split('?')[0], objectKey: presigned.objectKey, mimeType: file.type, sizeBytes: file.size, parsedHeadings: [] }) })
      const refreshed = await apiFetch<{ profile: typeof profile }>('/api/students/me', token)
      if (refreshed.profile) onSaved(refreshed.profile)
      setMessage(`${file.name} uploaded and queued for parsing.`)
      const refreshedDocuments = await apiFetch<{ documents: typeof documents }>('/api/students/me/documents', token)
      setDocuments(refreshedDocuments.documents)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to upload document')
    } finally {
      setUploading(false)
    }
  }
  return <div className="admin-users-page"><div className="records-page-heading"><div><p className="eyebrow">Your profile</p><h2>{profile?.full_name ?? 'Student profile'}</h2><p>Links and bio are saved to your college record.</p></div></div><section className="panel import-panel"><div><h2>Profile details</h2><p>Links and bio are saved to your college record.</p></div><input value={form.profilePhotoUrl} onChange={(event) => setForm((current) => ({ ...current, profilePhotoUrl: event.target.value }))} placeholder="Profile photo URL" aria-label="Profile photo URL" /><input value={form.linkedinUrl} onChange={(event) => setForm((current) => ({ ...current, linkedinUrl: event.target.value }))} placeholder="LinkedIn URL" aria-label="LinkedIn URL" /><input value={form.githubUrl} onChange={(event) => setForm((current) => ({ ...current, githubUrl: event.target.value }))} placeholder="GitHub URL" aria-label="GitHub URL" /><textarea value={form.bio} onChange={(event) => setForm((current) => ({ ...current, bio: event.target.value }))} placeholder="Short bio" aria-label="Bio" /><button className="primary-button" onClick={() => void saveProfile()}>Save profile →</button></section><section className="panel import-panel"><div><h2>Documents</h2><p>Uploads require configured object storage. Resume headings are extracted asynchronously after upload.</p></div><label>Profile photo<input type="file" accept="image/jpeg,image/png" disabled={uploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadDocument(file, 'photo') }} /></label><label>Resume<input type="file" accept="application/pdf,.docx" disabled={uploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadDocument(file, file.type === 'application/pdf' ? 'resume_pdf' : 'resume_docx') }} /></label>{documents.map((document) => <div className="activity-row" key={document.id}><strong>{document.file_name ?? document.doc_type}</strong><small>{document.status} · {document.parsed_headings?.map((heading) => heading.heading).join(', ') || 'Parsing headings'}</small></div>)}{message && <p className="entry-message">{message}</p>}</section></div>
}

function StudentOverview({ setActiveNav, profile, profileStrength, marks, notifications, marksheets }: { setActiveNav: (nav: string) => void; profile: { full_name: string; profile_photo_url: string | null; bio: string | null; linkedin_url: string | null; github_url: string | null; class_name: string | null; department_name: string | null; roll_number: string } | null; profileStrength: number | null; marks: Array<{ subject_name: string; marks_obtained: string; max_marks: string }>; notifications: Array<{ title: string; body: string | null }>; marksheets: Array<{ sgpa: string | null }> }) {
  const latestMarksheet = marksheets[0]
  return <div className="student-grid"><section className="panel profile-panel"><div className="profile-hero"><div className="profile-photo">{profile?.profile_photo_url ? <img src={profile.profile_photo_url} alt="Profile" /> : profile?.full_name?.split(' ').map((part) => part[0]).join('')}</div><div><p className="eyebrow">Professional profile</p><h2>{profile?.full_name ?? 'Profile unavailable'}</h2><p>{profile?.class_name ?? 'Class not assigned'} · {profile?.department_name ?? 'Department not assigned'}</p></div><button className="select-button" onClick={() => setActiveNav('My profile')}>Edit profile</button></div><div className="profile-progress"><div><strong>{profileStrength ?? 0}%</strong><span>Profile strength</span></div><div className="progress-track"><i style={{ width: `${profileStrength ?? 0}%` }}></i></div><small>{profile?.bio ? 'Profile bio added' : 'Add a bio to improve your profile'}</small></div><div className="profile-links"><span>{profile?.linkedin_url ? 'LinkedIn connected' : 'LinkedIn not added'}</span><span>{profile?.github_url ? 'GitHub connected' : 'GitHub not added'}</span><span>{profile?.profile_photo_url ? 'Photo added' : 'Photo not added'}</span></div></section><section className="panel records-panel"><div className="panel-heading"><div><h2>Academic snapshot</h2><p>Records currently stored for your account</p></div><button className="text-button" onClick={() => setActiveNav('Academic records')}>View records →</button></div><div className="grade-row"><div className="grade-circle">{latestMarksheet?.sgpa ?? '—'}<small>SGPA</small></div><div><strong>{marks.length} mark records</strong><p>{profile?.roll_number ?? 'Roll number not assigned'}</p><span className="positive">Live database records</span></div></div><div className="subject-mini">{marks.slice(0, 4).map((mark) => <Fragment key={mark.subject_name}><span>{mark.subject_name}</span><b>{mark.marks_obtained}/{mark.max_marks}</b></Fragment>)}</div></section><section className="panel activity-panel"><div className="panel-heading"><div><h2>Notifications</h2><p>{notifications.length} updates in your inbox</p></div><button className="text-button" onClick={() => setActiveNav('Notifications')}>View all</button></div><div className="activity-list">{notifications.slice(0, 3).map((notification) => <div className="activity-row" key={notification.title}><span className="activity-icon blue">!</span><span><strong>{notification.title}</strong><small>{notification.body ?? 'College update'}</small></span></div>)}</div></section></div>
}

function FacultyOverview({ role, assignments, analytics, adminUsers, adminAssignments, setActiveNav }: { role: Role; assignments: Array<{ class_name: string; subject_name: string; status?: string }>; analytics: { average_percentage: string | null; top_percentage: string | null; student_count: number } | null; adminUsers: Array<{ full_name: string; role: string }>; adminAssignments: Array<{ status: string }>; setActiveNav: (nav: string) => void }) {
  const isAdmin = role === 'admin'
  const groups = isAdmin ? adminUsers.filter((user) => user.role === 'teacher').map((user) => `${user.full_name} · Faculty`) : assignments.map((assignment) => `${assignment.class_name} · ${assignment.subject_name}`)
  return <><div className="dashboard-grid"><section className="panel performance-panel"><div className="panel-heading"><div><h2>{isAdmin ? 'College workspace' : 'Assignment performance'}</h2><p>{isAdmin ? `${adminUsers.length} accounts · ${adminAssignments.length} assignments` : 'Live values from your selected assignment'}</p></div></div><div className="record-kpis"><div className="record-kpi"><span>{isAdmin ? 'Accounts' : 'Class average'}</span><strong>{isAdmin ? adminUsers.length : analytics?.average_percentage ? `${analytics.average_percentage}%` : '—'}</strong><small>Database value</small></div><div className="record-kpi"><span>{isAdmin ? 'Active assignments' : 'Students in scope'}</span><strong>{isAdmin ? adminAssignments.filter((assignment) => assignment.status === 'active').length : analytics?.student_count ?? '—'}</strong><small>Database value</small></div><div className="record-kpi"><span>{isAdmin ? 'Teachers' : 'Top score'}</span><strong>{isAdmin ? adminUsers.filter((user) => user.role === 'teacher').length : analytics?.top_percentage ? `${analytics.top_percentage}%` : '—'}</strong><small>Database value</small></div></div></section><section className="panel classes-panel"><div className="panel-heading"><div><h2>{isAdmin ? 'Faculty accounts' : 'Your assignments'}</h2><p>{isAdmin ? 'Real accounts created in this college' : 'Only classes assigned to your account'}</p></div></div><div className="class-list">{groups.length ? groups.map((item) => <div className="class-row" key={item}><span className="class-icon class-0">{isAdmin ? 'F' : 'C'}</span><span className="class-name"><strong>{item.split(' · ')[0]}</strong><small>{item.split(' · ')[1]}</small></span><span className="row-arrow">›</span></div>) : <div className="empty-records">No records are assigned yet.</div>}</div><button className="text-button" onClick={() => setActiveNav(isAdmin ? 'Users' : 'My classes')}>View details <span>→</span></button></section></div></>
}

export default App
