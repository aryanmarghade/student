import type { Pool } from 'pg'
import { linearRegression } from './analytics.js'

export type AiUser = {
  id: string
  collegeId: string
  role: 'super_admin' | 'teacher' | 'student'
  email: string
  fullName: string
}

type ToolContext = { pool: Pool; user: AiUser }
type ToolResult = { name: string; args: Record<string, unknown>; result: unknown }

export class AiScopeError extends Error {
  status = 403
}

const toolNames = [
  'get_class_topper',
  'get_class_average',
  'get_student_performance',
  'get_weakest_students',
  'compare_students',
  'predict_next_score',
  'get_grade_distribution',
  'search_student',
] as const

type ToolName = typeof toolNames[number]

const functionDeclarations = toolNames.map((name) => ({
  name,
  description: {
    get_class_topper: 'Get the highest-performing student in a scoped class, subject, and semester.',
    get_class_average: 'Get the average percentage and student count in a scoped class, subject, and semester.',
    get_student_performance: 'Get marks and aggregate performance for one student in an allowed scope.',
    get_weakest_students: 'Get the lowest-performing students in an allowed class scope.',
    compare_students: 'Compare aggregate performance for multiple students in an allowed scope.',
    predict_next_score: 'Predict the next score using linear regression on past marks for one student.',
    get_grade_distribution: 'Get the grade distribution bucket counts for a scoped class, subject, and semester.',
    search_student: 'Search students by name within the allowed scope.',
  }[name],
  parameters: {
    type: 'OBJECT',
    properties: {
      studentId: { type: 'STRING', description: 'Student identifier' },
      studentIds: { type: 'ARRAY', items: { type: 'STRING' }, description: 'List of student identifiers' },
      classId: { type: 'STRING', description: 'Class identifier' },
      subjectId: { type: 'STRING', description: 'Subject identifier' },
      semesterId: { type: 'STRING', description: 'Semester identifier' },
      query: { type: 'STRING', description: 'Search term' },
    },
  },
}))

async function verifyScope(context: ToolContext, payload: { studentId?: string; studentIds?: string[]; classId?: string; subjectId?: string; semesterId?: string }) {
  if (context.user.role === 'super_admin') return true

  if (context.user.role === 'student') {
    const student = await context.pool.query('SELECT id, class_id FROM students WHERE user_id = $1', [context.user.id])
    const studentRecord = student.rows[0]
    if (!studentRecord) return false
    if (payload.studentId && payload.studentId !== studentRecord.id) return false
    if (payload.studentIds && payload.studentIds.some((id) => id !== studentRecord.id)) return false
    if (payload.classId && payload.classId !== studentRecord.class_id) return false
    return true
  }

  if (context.user.role === 'teacher') {
    if (payload.classId && payload.subjectId && payload.semesterId) {
      const allowed = await context.pool.query(
        `SELECT 1 FROM teacher_class_assignments WHERE teacher_id = $1 AND class_id = $2 AND subject_id = $3 AND semester_id = $4 AND status IN ('active', 'past')`,
        [context.user.id, payload.classId, payload.subjectId, payload.semesterId],
      )
      if (!allowed.rowCount) return false
    } else if (payload.classId) {
      const allowed = await context.pool.query(
        `SELECT 1 FROM teacher_class_assignments WHERE teacher_id = $1 AND class_id = $2 AND status IN ('active', 'past')`,
        [context.user.id, payload.classId],
      )
      if (!allowed.rowCount) return false
    }

    if (payload.studentId) {
      const allowed = await context.pool.query(
        `SELECT 1 FROM students s JOIN teacher_class_assignments a ON a.class_id = s.class_id WHERE a.teacher_id = $1 AND s.id = $2 AND a.status IN ('active', 'past')`,
        [context.user.id, payload.studentId],
      )
      if (!allowed.rowCount) return false
    }

    return true
  }

  return false
}

export async function executeTool(context: ToolContext, name: ToolName, args: Record<string, unknown>) {
  const isAllowed = await verifyScope(context, {
    studentId: typeof args.studentId === 'string' ? args.studentId : undefined,
    studentIds: Array.isArray(args.studentIds) ? (args.studentIds as string[]) : undefined,
    classId: typeof args.classId === 'string' ? args.classId : undefined,
    subjectId: typeof args.subjectId === 'string' ? args.subjectId : undefined,
    semesterId: typeof args.semesterId === 'string' ? args.semesterId : undefined,
  })

  if (!isAllowed) {
    throw new AiScopeError('Access denied: requested data is outside your authorized scope.')
  }

  switch (name) {
    case 'get_class_topper': {
      const res = await context.pool.query(
        `SELECT s.id, u.full_name, round(avg(m.marks_obtained/NULLIF(m.max_marks,0)*100)::numeric, 2) as score
         FROM marks m
         JOIN students s ON s.id = m.student_id
         JOIN users u ON u.id = s.user_id
         WHERE ($1::uuid IS NULL OR m.class_id = $1)
           AND ($2::uuid IS NULL OR m.subject_id = $2)
           AND ($3::uuid IS NULL OR m.semester_id = $3)
         GROUP BY s.id, u.full_name
         ORDER BY score DESC NULLS LAST
         LIMIT 1`,
        [args.classId || null, args.subjectId || null, args.semesterId || null],
      )
      return res.rows[0] ?? { message: 'No records found' }
    }

    case 'get_class_average': {
      const res = await context.pool.query(
        `SELECT round(avg(marks_obtained/NULLIF(max_marks,0)*100)::numeric, 2) as average_percentage, count(DISTINCT student_id)::int as student_count
         FROM marks
         WHERE ($1::uuid IS NULL OR class_id = $1)
           AND ($2::uuid IS NULL OR subject_id = $2)
           AND ($3::uuid IS NULL OR semester_id = $3)`,
        [args.classId || null, args.subjectId || null, args.semesterId || null],
      )
      return res.rows[0] ?? { average_percentage: null, student_count: 0 }
    }

    case 'get_student_performance': {
      const res = await context.pool.query(
        `SELECT s.id, u.full_name, sub.name as subject, sem.name as semester, m.exam_type, m.marks_obtained, m.max_marks
         FROM marks m
         JOIN students s ON s.id = m.student_id
         JOIN users u ON u.id = s.user_id
         JOIN subjects sub ON sub.id = m.subject_id
         JOIN semesters sem ON sem.id = m.semester_id
         WHERE s.id = $1
         ORDER BY sem.order_index, sub.name`,
        [args.studentId],
      )
      return { records: res.rows }
    }

    case 'get_weakest_students': {
      const res = await context.pool.query(
        `SELECT s.id, u.full_name, round(avg(m.marks_obtained/NULLIF(m.max_marks,0)*100)::numeric, 2) as score
         FROM marks m
         JOIN students s ON s.id = m.student_id
         JOIN users u ON u.id = s.user_id
         WHERE ($1::uuid IS NULL OR m.class_id = $1)
         GROUP BY s.id, u.full_name
         ORDER BY score ASC NULLS LAST
         LIMIT 5`,
        [args.classId || null],
      )
      return { students: res.rows }
    }

    case 'compare_students': {
      const ids = Array.isArray(args.studentIds) ? args.studentIds : []
      if (!ids.length) return { comparison: [] }
      const res = await context.pool.query(
        `SELECT s.id, u.full_name, round(avg(m.marks_obtained/NULLIF(m.max_marks,0)*100)::numeric, 2) as avg_score
         FROM marks m
         JOIN students s ON s.id = m.student_id
         JOIN users u ON u.id = s.user_id
         WHERE s.id = ANY($1::uuid[])
         GROUP BY s.id, u.full_name`,
        [ids],
      )
      return { comparison: res.rows }
    }

    case 'predict_next_score': {
      const res = await context.pool.query(
        `SELECT m.marks_obtained / NULLIF(m.max_marks, 0) * 100 as percentage
         FROM marks m
         WHERE m.student_id = $1
         ORDER BY m.created_at ASC`,
        [args.studentId],
      )
      const values = res.rows.map((r: any) => Number(r.percentage)).filter((n: any) => !isNaN(n))
      const points = values.map((val: number, i: number) => ({ x: i + 1, y: val }))
      const reg = linearRegression(points)
      const predicted = reg ? Math.min(100, Math.max(0, Math.round((reg.slope * (points.length + 1) + reg.intercept) * 10) / 10)) : null
      return { historical_points: values.length, predicted_next_score: predicted }
    }

    case 'get_grade_distribution': {
      const res = await context.pool.query(
        `SELECT marks_obtained / NULLIF(max_marks, 0) * 100 as pct
         FROM marks
         WHERE ($1::uuid IS NULL OR class_id = $1)
           AND ($2::uuid IS NULL OR subject_id = $2)`,
        [args.classId || null, args.subjectId || null],
      )
      const dist = { A: 0, B: 0, C: 0, D: 0, F: 0 }
      for (const row of res.rows) {
        const p = Number(row.pct)
        if (p >= 85) dist.A++
        else if (p >= 70) dist.B++
        else if (p >= 55) dist.C++
        else if (p >= 40) dist.D++
        else dist.F++
      }
      return dist
    }

    case 'search_student': {
      const res = await context.pool.query(
        `SELECT s.id, s.roll_number, u.full_name
         FROM students s
         JOIN users u ON u.id = s.user_id
         WHERE u.full_name ILIKE $1 OR s.roll_number ILIKE $1
         LIMIT 10`,
        [`%${args.query || ''}%`],
      )
      return { results: res.rows }
    }

    default:
      throw new Error(`Unhandled tool: ${name}`)
  }
}

export async function runOllamaQuery(pool: Pool, user: AiUser, query: string) {
  if (user.role === 'student' && /(pretend|impersonat|teacher|admin|other student|show me .*marks|marks .*student)/i.test(query)) {
    throw new AiScopeError('That request is outside the student scope.')
  }

  const ollamaUrl = process.env.OLLAMA_URL || 'http://127.0.0.1:11434'
  const ollamaModel = process.env.OLLAMA_MODEL || 'qwen2.5:3b'

  // Context gathering
  let contextInfo = ''
  if (user.role === 'super_admin') {
    const counts = await pool.query(`SELECT (SELECT count(*) FROM users) as users, (SELECT count(*) FROM students) as students, (SELECT count(*) FROM marks) as marks`)
    contextInfo = `Institution totals: ${counts.rows[0]?.users} users, ${counts.rows[0]?.students} students, ${counts.rows[0]?.marks} marks.`
  } else if (user.role === 'teacher') {
    const assignments = await pool.query(
      `SELECT c.name as class_name, s.name as subject_name FROM teacher_class_assignments a JOIN classes c ON c.id=a.class_id JOIN subjects s ON s.id=a.subject_id WHERE a.teacher_id=$1`,
      [user.id],
    )
    contextInfo = `Teacher assignments: ${JSON.stringify(assignments.rows)}`
  } else {
    const student = await pool.query(
      `SELECT s.roll_number, round(avg(m.marks_obtained/NULLIF(m.max_marks,0)*100)::numeric, 1) as avg_pct FROM students s LEFT JOIN marks m ON m.student_id=s.id WHERE s.user_id=$1 GROUP BY s.roll_number`,
      [user.id],
    )
    contextInfo = `Student record: Roll ${student.rows[0]?.roll_number}, Avg score: ${student.rows[0]?.avg_pct}%`
  }

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 8000)

    const res = await fetch(`${ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: ollamaModel,
        prompt: `You are an academic AI assistant. Role: ${user.role}. Context: ${contextInfo}\n\nQuestion: ${query}\n\nAnswer:`,
        stream: false,
      }),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (res.ok) {
      const data = (await res.json()) as any
      if (data?.response) {
        return { response: data.response.trim(), toolCalls: [] }
      }
    }
  } catch (err) {
    // Fallback when Ollama is unavailable
  }

  return {
    response: 'Local AI is unavailable. Start Ollama to enable AI features.',
    toolCalls: [],
  }
}

export const availableAiTools = functionDeclarations
