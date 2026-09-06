import { useEffect, useState, type FormEvent } from 'react'
import './App.css'
import { apiFetch, login, type SessionUser } from './api'

type Role = 'student' | 'teacher' | 'admin'

const roleLabels: Record<Role, string> = {
  student: 'Student workspace',
  teacher: 'Faculty workspace',
  admin: 'College admin workspace',
}

const roleNames: Record<Role, string> = {
  student: 'Priya Sharma',
  teacher: 'Alex Kumar',
  admin: 'Meera Nair',
}

const roleNav: Record<Role, string[]> = {
  student: ['Overview', 'My profile', 'Academic records', 'Notifications'],
  teacher: ['Overview', 'My classes', 'Marks entry', 'Analytics'],
  admin: ['Overview', 'Users', 'Assignments', 'Marksheets', 'College analytics'],
}

const bars = [74, 82, 61, 88, 69, 79, 92, 76, 84, 70, 87, 80]

function App() {
  const [session, setSession] = useState<{ token: string; user: SessionUser } | null>(() => {
    const stored = sessionStorage.getItem('student-profile-session')
    return stored ? JSON.parse(stored) as { token: string; user: SessionUser } : null
  })
  const [role, setRole] = useState<Role>(() => session?.user.role === 'super_admin' ? 'admin' : session?.user.role ?? 'teacher')
  const [activeNav, setActiveNav] = useState('Overview')
  const [showPast, setShowPast] = useState(false)
  const [liveClasses, setLiveClasses] = useState<string[] | null>(null)
  const [liveAssignments, setLiveAssignments] = useState<Array<{ class_name: string; subject_name: string; class_id: string; subject_id: string; semester_id: string }>>([])
  const [liveProfileStrength, setLiveProfileStrength] = useState<number | null>(null)
  const [liveNotifications, setLiveNotifications] = useState<Array<{ id: string; title: string; body: string | null; created_at: string; is_read: boolean }>>([])
  const [liveMarks, setLiveMarks] = useState<Array<{ subject_name: string; marks_obtained: string; max_marks: string }>>([])
  const [liveMarksheets, setLiveMarksheets] = useState<Array<{ id: string; file_url: string; sgpa: string | null; cgpa: string | null; sem_number: number; academic_year: string }>>([])
  const [liveAnalytics, setLiveAnalytics] = useState<{ average_percentage: string | null; top_percentage: string | null; student_count: number } | null>(null)
  const [dataNotice, setDataNotice] = useState('')
  const name = roleNames[role]
  const initials = name.split(' ').map((part) => part[0]).join('')
  const assignedClasses = showPast
    ? ['CSE 2A · Data Structures', 'CSE 3B · Database Systems', 'CSE 1A · Programming Lab']
    : ['CSE 3B · Database Systems', 'CSE 3A · Web Engineering']

  useEffect(() => {
    if (!session) return
    const loadDashboardData = async () => {
      try {
        if (session.user.role === 'teacher') {
          const result = await apiFetch<{ assignments: Array<{ class_name: string; subject_name: string; class_id: string; subject_id: string; semester_id: string }> }>('/api/teacher/assignments', session.token)
          setLiveAssignments(result.assignments)
          const classes = result.assignments.map((assignment) => `${assignment.class_name} · ${assignment.subject_name}`)
          if (classes.length) setLiveClasses(classes)
          const firstAssignment = result.assignments[0]
          if (firstAssignment) {
            const analytics = await apiFetch<{ analytics: { average_percentage: string | null; top_percentage: string | null; student_count: number } }>(`/api/teacher/analytics?classId=${firstAssignment.class_id}&subjectId=${firstAssignment.subject_id}&semesterId=${firstAssignment.semester_id}`, session.token)
            setLiveAnalytics(analytics.analytics)
          }
        }
        if (session.user.role === 'student') {
          const result = await apiFetch<{ profile: { profile_strength: number } }>('/api/students/me', session.token)
          setLiveProfileStrength(result.profile.profile_strength)
          const notifications = await apiFetch<{ notifications: Array<{ id: string; title: string; body: string | null; created_at: string; is_read: boolean }> }>('/api/students/me/notifications', session.token)
          setLiveNotifications(notifications.notifications)
          const marks = await apiFetch<{ marks: Array<{ subject_name: string; marks_obtained: string; max_marks: string }> }>('/api/students/me/marks', session.token)
          setLiveMarks(marks.marks)
          const marksheets = await apiFetch<{ marksheets: Array<{ id: string; file_url: string; sgpa: string | null; cgpa: string | null; sem_number: number; academic_year: string }> }>('/api/students/me/marksheets', session.token)
          setLiveMarksheets(marksheets.marksheets)
        }
      } catch (error) {
        setDataNotice(error instanceof Error ? error.message : 'Live data is temporarily unavailable')
      }
    }
    void loadDashboardData()
  }, [session])

  if (!session) {
    return <LoginScreen onLogin={(nextSession) => {
      sessionStorage.setItem('student-profile-session', JSON.stringify(nextSession))
      setSession(nextSession)
      setRole(nextSession.user.role === 'super_admin' ? 'admin' : nextSession.user.role)
    }} />
  }

  function changeRole(nextRole: Role) {
    setRole(nextRole)
    setActiveNav('Overview')
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
        <header className="topbar"><div className="breadcrumb"><span>{roleLabels[role]}</span><b>/</b><strong>{activeNav}</strong></div><div className="top-actions"><div className="role-switcher" aria-label="Preview role"><button className={role === 'student' ? 'selected' : ''} onClick={() => changeRole('student')}>Student</button><button className={role === 'teacher' ? 'selected' : ''} onClick={() => changeRole('teacher')}>Teacher</button><button className={role === 'admin' ? 'selected' : ''} onClick={() => changeRole('admin')}>Admin</button></div><button className="icon-button" aria-label="Notifications">♢<i></i></button><button className="profile-chip" onClick={() => { sessionStorage.removeItem('student-profile-session'); setSession(null) }}><span className="avatar avatar-orange">{initials}</span><span>{session.user.email}</span><span>↪</span></button></div></header>
        <section className="content-wrap">
          <div className="welcome-row"><div><p className="eyebrow">Monday, September 8, 2025</p><h1>{role === 'student' ? `Welcome back, ${name.split(' ')[0]}.` : role === 'admin' ? 'Good morning, Meera.' : 'Good morning, Alex.'}</h1><p className="subheading">{role === 'student' ? 'Keep your academic record and professional profile up to date.' : role === 'admin' ? 'A clear view of your college operations, all in one place.' : 'Here is what is happening across your assigned classes today.'}</p></div><button className="primary-button">＋ {role === 'student' ? 'Update profile' : role === 'admin' ? 'Import users' : 'Enter marks'}</button></div>
          {dataNotice && <div className="data-notice">Using preview data: {dataNotice}</div>}
          <LiveDataSummary role={role} notifications={liveNotifications} marks={liveMarks} analytics={liveAnalytics} />
          <RoleStats role={role} profileStrength={liveProfileStrength} />
          {role === 'student' && activeNav === 'Academic records' ? <StudentRecordsPage marks={liveMarks} marksheets={liveMarksheets} /> : role === 'student' ? <StudentOverview setActiveNav={setActiveNav} profileStrength={liveProfileStrength} /> : role === 'teacher' && activeNav === 'Marks entry' ? <TeacherMarksEntry token={session.token} assignments={liveAssignments} /> : role === 'teacher' && activeNav === 'Analytics' ? <TeacherAnalyticsPage token={session.token} assignments={liveAssignments} analytics={liveAnalytics} /> : role === 'admin' && activeNav === 'Users' ? <AdminUsersPage token={session.token} /> : role === 'admin' && activeNav === 'Assignments' ? <AdminAssignmentsPage token={session.token} /> : role === 'admin' && activeNav === 'Marksheets' ? <AdminMarksheetsPage token={session.token} /> : <FacultyOverview role={role} bars={bars} assignedClasses={liveClasses ?? assignedClasses} showPast={showPast} setShowPast={setShowPast} setActiveNav={setActiveNav} />}
        </section>
      </main>
    </div>
  )
}

function LoginScreen({ onLogin }: { onLogin: (session: { token: string; user: SessionUser }) => void }) {
  const [email, setEmail] = useState('student@northstar.edu')
  const [password, setPassword] = useState('ChangeMe123!')
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

function RoleStats({ role, profileStrength }: { role: Role; profileStrength: number | null }) {
  const stats = role === 'student' ? [['Profile strength', `${profileStrength ?? 82}%`, '↑ 12%', 'since last month'], ['Current CGPA', '8.7', '↑ 0.4', 'this semester'], ['Semesters complete', '05', 'On track', 'for graduation'], ['Unread updates', '03', '2 new', 'this week']] : role === 'admin' ? [['Active students', '1,248', '↑ 8.2%', 'vs last year'], ['Faculty members', '86', '04 new', 'this semester'], ['Classes running', '42', '02 pending', 'assignments'], ['Marksheets ready', '94%', '↑ 6%', 'this month']] : [['Active students', '84', '↑ 8.2%', 'vs last semester'], ['Average performance', '78.4%', '↑ 4.6%', 'vs last semester'], ['Classes assigned', '02', 'Current', 'semester 2025 / 26'], ['Needs attention', '06', '↓ 2 students', 'since last week']]
  return <div className="stats-grid">{stats.map(([label, number, change, detail], index) => <div className="stat-card" key={label}><div className="stat-label">{label} <span className={`stat-dot ${['mint', 'purple', 'orange', 'red'][index]}`}></span></div><div className="stat-number">{number}</div><div className={`stat-foot ${change.startsWith('↑') ? 'positive' : change.startsWith('↓') ? 'warning' : 'neutral'}`}>{change} <span>{detail}</span></div></div>)}</div>
}

function AdminUsersPage({ token }: { token: string }) {
  const [users, setUsers] = useState<Array<{ id: string; email: string; full_name: string; role: string; is_active: boolean; must_reset_password: boolean }>>([])
  const [rows, setRows] = useState('teacher@example.edu,Alex Kumar,ChangeMe123!\nstudent@example.edu,Priya Sharma,ChangeMe123!,CS21045')
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
    const importedUsers = rows.split('\n').map((row) => row.split(',').map((value) => value.trim())).filter((row) => row.length >= 3 && row[0])
    try {
      const result = await apiFetch<{ imported: number }>('/api/admin/users/bulk-import', token, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ users: importedUsers.map(([email, fullName, password, rollNumber]) => ({ email, fullName, password, role: rollNumber ? 'student' : 'teacher', ...(rollNumber ? { rollNumber } : {}) })) }) })
      setMessage(`${result.imported} accounts imported. Temporary passwords require reset.`)
      const refreshed = await apiFetch<{ users: typeof users }>('/api/admin/users', token)
      setUsers(refreshed.users)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Import failed')
    }
  }

  return <div className="admin-users-page"><div className="records-page-heading"><div><p className="eyebrow">Administration</p><h2>People directory</h2><p>Onboard faculty and students into your college workspace.</p></div><button className="primary-button" onClick={() => void importUsers()}>Import accounts →</button></div><section className="panel import-panel"><div><h2>Bulk onboarding</h2><p>One account per line: email, full name, temporary password, optional student roll number.</p></div><textarea value={rows} onChange={(event) => setRows(event.target.value)} aria-label="Bulk user rows" />{message && <p className="entry-message">{message}</p>}</section><section className="panel directory-panel"><div className="panel-heading"><div><h2>Current accounts</h2><p>{users.length} accounts in this college</p></div></div><div className="directory-table"><div className="directory-header"><span>Name</span><span>Email</span><span>Role</span><span>Status</span></div>{users.map((user) => <div className="directory-row" key={user.id}><strong>{user.full_name}</strong><span>{user.email}</span><span className={`role-pill ${user.role}`}>{user.role.replace('_', ' ')}</span><span className={user.is_active ? 'status-active' : 'status-inactive'}>{user.is_active ? 'Active' : 'Inactive'}</span></div>)}</div></section></div>
}

type AdminAssignment = { id: string; teacher_name: string; class_name: string; subject_name: string; sem_number: number; status: string }

async function fetchAdminAssignments(token: string) {
  const result = await apiFetch<{ assignments: AdminAssignment[] }>('/api/admin/assignments', token)
  return result.assignments
}

function AdminAssignmentsPage({ token }: { token: string }) {
  const [assignments, setAssignments] = useState<AdminAssignment[]>([])
  const [form, setForm] = useState({ teacherId: '', classId: '', subjectId: '', semesterId: '' })
  const [message, setMessage] = useState('')

  async function loadAssignments() {
    setAssignments(await fetchAdminAssignments(token))
  }

  useEffect(() => { void fetchAdminAssignments(token).then(setAssignments).catch((error: unknown) => setMessage(error instanceof Error ? error.message : 'Unable to load assignments')) }, [token])

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

  return <div className="admin-users-page"><div className="records-page-heading"><div><p className="eyebrow">Administration</p><h2>Teaching assignments</h2><p>Control exactly which academic data each teacher can access.</p></div></div><section className="panel assignment-form"><div><h2>Assign a teacher</h2><p>Paste the IDs from your academic directory to create an assignment.</p></div><div className="assignment-fields">{(['teacherId', 'classId', 'subjectId', 'semesterId'] as const).map((field) => <input key={field} value={form[field]} onChange={(event) => setForm((current) => ({ ...current, [field]: event.target.value }))} placeholder={field} aria-label={field} />)}<button className="primary-button" onClick={() => void saveAssignment()}>Save assignment →</button></div>{message && <p className="entry-message">{message}</p>}</section><section className="panel directory-panel"><div className="panel-heading"><div><h2>Assignment history</h2><p>{assignments.length} records · past assignments are preserved</p></div></div><div className="directory-table"><div className="directory-header assignment-grid"><span>Teacher</span><span>Class</span><span>Subject</span><span>Status</span><span></span></div>{assignments.map((assignment) => <div className="directory-row assignment-grid" key={assignment.id}><strong>{assignment.teacher_name}</strong><span>{assignment.class_name}</span><span>{assignment.subject_name} · Sem {assignment.sem_number}</span><span className={assignment.status === 'active' ? 'status-active' : 'status-inactive'}>{assignment.status}</span><button className="archive-button" disabled={assignment.status !== 'active'} onClick={() => void archiveAssignment(assignment.id)}>Archive</button></div>)}</div></section></div>
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

function TeacherMarksEntry({ token, assignments }: { token: string; assignments: Array<{ class_name: string; subject_name: string; class_id: string; subject_id: string; semester_id: string }> }) {
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
        const result = await apiFetch<{ students: Array<{ id: string; full_name: string; roll_number: string }> }>(`/api/teacher/classes/${assignment.class_id}/students`, token)
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

function TeacherAnalyticsPage({ token, assignments, analytics }: { token: string; assignments: Array<{ class_name: string; subject_name: string; class_id: string; subject_id: string; semester_id: string }>; analytics: { average_percentage: string | null; top_percentage: string | null; student_count: number } | null }) {
  const [query, setQuery] = useState('Who is the topper in this class?')
  const [answer, setAnswer] = useState('')
  const [intent, setIntent] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const assignment = assignments[0]

  async function askAssistant() {
    if (!assignment) return
    setIsLoading(true)
    try {
      const result = await apiFetch<{ response: string; intent: string; chartHint?: { labels: string[]; values: number[] } }>('/api/teacher/ai/query', token, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query, classId: assignment.class_id, subjectId: assignment.subject_id, semesterId: assignment.semester_id }) })
      setAnswer(result.response)
      setIntent(result.intent)
    } catch (error) {
      setAnswer(error instanceof Error ? error.message : 'Unable to query analytics')
      setIntent('error')
    } finally {
      setIsLoading(false)
    }
  }

  return <div className="analytics-page"><div className="records-page-heading"><div><p className="eyebrow">Teacher analytics</p><h2>Ask your academic data.</h2><p>Answers come from fixed, assignment-scoped tools.</p></div><div className="analytics-kpi"><strong>{analytics?.average_percentage ?? '--'}%</strong><span>class average</span></div></div><div className="analytics-grid"><section className="panel ai-panel"><div className="ai-heading"><span className="ai-spark">✦</span><div><h2>Academic assistant</h2><p>Ask about your assigned class, subject, or semester.</p></div></div><div className="suggestion-row"><button onClick={() => setQuery('Who is the topper in this class?')}>Find topper</button><button onClick={() => setQuery('What is the class average?')}>Class average</button><button onClick={() => setQuery('Which students are below 40?')}>Needs attention</button></div><div className="ai-input-row"><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void askAssistant() }} /><button className="primary-button" onClick={() => void askAssistant()} disabled={isLoading}>{isLoading ? 'Thinking...' : 'Ask →'}</button></div>{answer && <div className="ai-answer"><span className="eyebrow">{intent.replace('_', ' ')}</span><p>{answer}</p></div>}</section><section className="panel analytics-scope"><p className="eyebrow">Current scope</p><h2>{assignment?.class_name ?? 'No assignment selected'}</h2><p>{assignment?.subject_name ?? 'Assign a class and subject to begin'}</p><div className="scope-stat"><strong>{analytics?.student_count ?? '--'}</strong><span>students in scope</span></div><div className="scope-stat"><strong>{analytics?.top_percentage ?? '--'}%</strong><span>top score</span></div></section></div></div>
}

function StudentRecordsPage({ marks, marksheets }: { marks: Array<{ subject_name: string; marks_obtained: string; max_marks: string }>; marksheets: Array<{ id: string; file_url: string; sgpa: string | null; cgpa: string | null; sem_number: number; academic_year: string }> }) {
  const average = marks.length ? Math.round(marks.reduce((total, mark) => total + (Number(mark.marks_obtained) / Number(mark.max_marks)) * 100, 0) / marks.length) : 0
  const latestMarksheet = marksheets[0]
  return <div className="records-page"><div className="records-page-heading"><div><p className="eyebrow">Academic records</p><h2>Progress across every semester</h2><p>Marks and official results linked to your college record.</p></div><button className="select-button">Semester 5 <span>⌄</span></button></div><div className="record-kpis"><div className="record-kpi"><span>Current SGPA</span><strong>{latestMarksheet?.sgpa ?? '8.7'}</strong><small>Latest official result</small></div><div className="record-kpi"><span>Current CGPA</span><strong>{latestMarksheet?.cgpa ?? '8.4'}</strong><small>Across completed semesters</small></div><div className="record-kpi"><span>Marks average</span><strong>{average || 86}%</strong><small>{marks.length || 3} records loaded</small></div></div><section className="panel marks-table-panel"><div className="panel-heading"><div><h2>Semester 5 marks</h2><p>Assessment records from your current semester</p></div></div><div className="marks-table">{marks.length ? marks.map((mark) => <div className="marks-row" key={`${mark.subject_name}-${mark.marks_obtained}`}><span><strong>{mark.subject_name}</strong><small>Current semester</small></span><b>{mark.marks_obtained} <small>/ {mark.max_marks}</small></b><i>{Math.round(Number(mark.marks_obtained) / Number(mark.max_marks) * 100)}%</i></div>) : <div className="empty-records">Your marks will appear here once faculty publish them.</div>}</div></section><section className="panel marksheet-panel"><div className="panel-heading"><div><h2>Official marksheets</h2><p>Download verified semester documents</p></div></div><div className="marksheet-list">{marksheets.length ? marksheets.map((marksheet) => <a className="marksheet-row" href={marksheet.file_url} target="_blank" rel="noreferrer" key={marksheet.id}><span className="document-icon">PDF</span><span><strong>Semester {marksheet.sem_number} marksheet</strong><small>{marksheet.academic_year} · SGPA {marksheet.sgpa ?? 'Pending'}</small></span><b>↗</b></a>) : <div className="empty-records">Official marksheets will be available after the college uploads them.</div>}</div></section></div>
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

function StudentOverview({ setActiveNav, profileStrength }: { setActiveNav: (nav: string) => void; profileStrength: number | null }) {
  return <div className="student-grid"><section className="panel profile-panel"><div className="profile-hero"><div className="profile-photo">PS</div><div><p className="eyebrow">Professional profile</p><h2>Priya Sharma</h2><p>CSE · 3rd year · Section A</p></div><button className="select-button" onClick={() => setActiveNav('My profile')}>Edit profile</button></div><div className="profile-progress"><div><strong>{profileStrength ?? 82}%</strong><span>Profile strength</span></div><div className="progress-track"><i style={{ width: `${profileStrength ?? 82}%` }}></i></div><small>Add a bio and resume to reach 100%</small></div><div className="profile-links"><span>in LinkedIn connected</span><span>⌘ GitHub connected</span><span>▣ Resume uploaded</span></div></section><section className="panel records-panel"><div className="panel-heading"><div><h2>Academic snapshot</h2><p>Your latest semester results</p></div><button className="text-button" onClick={() => setActiveNav('Academic records')}>View records →</button></div><div className="grade-row"><div className="grade-circle">8.7<small>SGPA</small></div><div><strong>Semester 5</strong><p>Computer Science & Engineering</p><span className="positive">↑ 0.4 from last semester</span></div></div><div className="subject-mini"><span>Database Systems</span><b>92</b><span>Data Structures</span><b>88</b><span>Web Engineering</span><b>84</b></div></section><section className="panel activity-panel"><div className="panel-heading"><div><h2>Notifications</h2><p>Recent college updates</p></div><button className="more-button">•••</button></div><div className="activity-list"><div className="activity-row"><span className="activity-icon green">✓</span><span><strong>Midterm schedule published</strong><small>Examinations office</small></span><time>2h ago</time></div><div className="activity-row"><span className="activity-icon blue">↗</span><span><strong>Placement workshop</strong><small>Career development cell</small></span><time>Yesterday</time></div></div></section><section className="insight-card"><div className="insight-orb">✦</div><p className="eyebrow">Profile tip</p><h2>Make your profile stand out.</h2><p>Add a short bio and your latest project to help faculty and placement teams know your strengths.</p><button className="insight-button" onClick={() => setActiveNav('My profile')}>Complete profile <span>→</span></button></section></div>
}

function FacultyOverview({ role, bars, assignedClasses, showPast, setShowPast, setActiveNav }: { role: Role; bars: number[]; assignedClasses: string[]; showPast: boolean; setShowPast: (value: boolean) => void; setActiveNav: (nav: string) => void }) {
  const isAdmin = role === 'admin'
  const groups = isAdmin ? ['Computer Science · 486 students', 'Information Technology · 392 students', 'Electronics · 370 students'] : assignedClasses
  return <><div className="dashboard-grid"><section className="panel performance-panel"><div className="panel-heading"><div><h2>{isAdmin ? 'College performance' : 'Performance overview'}</h2><p>{isAdmin ? 'Average marks across all departments' : 'Average marks across your assigned subjects'}</p></div><button className="select-button">This semester <span>⌄</span></button></div><div className="chart-area"><div className="y-axis"><span>100</span><span>75</span><span>50</span><span>25</span><span>0</span></div><div className="chart"><div className="grid-lines"><i></i><i></i><i></i><i></i><i></i></div><div className="bars">{bars.map((height, index) => <div className="bar-column" key={index}><div className="bar" style={{ height: `${height}%` }}></div><span>{['DS', 'DB', 'OS', 'CN', 'SE', 'AI', 'DS', 'DB', 'OS', 'CN', 'SE', 'AI'][index]}</span></div>)}</div></div></div><div className="chart-legend"><span><i className="legend-dot"></i> Average marks</span><span className="trend">↗ 4.6% from last semester</span></div></section><section className="panel classes-panel"><div className="panel-heading"><div><h2>{isAdmin ? 'Departments' : 'Your classes'}</h2><p>{isAdmin ? 'College-wide academic groups' : 'Scoped to your assignments'}</p></div>{!isAdmin && <button className={showPast ? 'toggle on' : 'toggle'} onClick={() => setShowPast(!showPast)}><span></span>Past</button>}</div><div className="class-list">{groups.map((item, index) => <div className="class-row" key={item}><span className={`class-icon class-${index % 3}`}>{isAdmin ? ['CS', 'IT', 'EC'][index] : ['DS', 'DB', 'PL'][index % 3]}</span><span className="class-name"><strong>{item.split(' · ')[0]}</strong><small>{item.split(' · ')[1]}</small></span><span className="student-count">{isAdmin ? ['486', '392', '370'][index] : [42, 42, 28][index % 3]} <small>students</small></span><span className="row-arrow">›</span></div>)}</div><button className="text-button" onClick={() => setActiveNav(isAdmin ? 'College analytics' : 'My classes')}>View details <span>→</span></button></section></div><div className="lower-grid"><section className="panel activity-panel"><div className="panel-heading"><div><h2>Recent activity</h2><p>Your latest updates and actions</p></div><button className="more-button">•••</button></div><div className="activity-list"><div className="activity-row"><span className="activity-icon green">✓</span><span><strong>{isAdmin ? 'Semester marksheets processed' : 'Marks submitted'}</strong><small>{isAdmin ? 'CSE department · 184 records' : 'Database Systems · CSE 3B'}</small></span><time>2h ago</time></div><div className="activity-row"><span className="activity-icon blue">↗</span><span><strong>{isAdmin ? 'New faculty accounts imported' : 'Class report exported'}</strong><small>{isAdmin ? '04 teachers added to the directory' : 'Data Structures · CSE 3A'}</small></span><time>Yesterday</time></div></div></section><section className="insight-card"><div className="insight-orb">✦</div><p className="eyebrow">Student insights</p><h2>Your students are trending up.</h2><p>Average performance has grown by 4.6% this semester. Keep the momentum going.</p><button className="insight-button" onClick={() => setActiveNav(isAdmin ? 'College analytics' : 'Analytics')}>Explore analytics <span>→</span></button></section></div></>
}

export default App
