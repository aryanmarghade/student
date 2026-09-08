import 'dotenv/config'
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import cors from 'cors'
import bcrypt from 'bcryptjs'
import express, { type NextFunction, type Request, type Response } from 'express'
import jwt from 'jsonwebtoken'
import { Pool } from 'pg'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { z } from 'zod'
import { linearRegression, median, standardDeviation } from './analytics.js'
import { AiScopeError, runGeminiQuery } from './ai.js'
import { parseResume } from './documents.js'

const app = express()
const port = Number(process.env.API_PORT ?? 4000)
const jwtSecret = process.env.JWT_SECRET
const configuredWebOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:5173'
const allowedWebOrigins = new Set([
  configuredWebOrigin,
  ...(process.env.NODE_ENV === 'production' ? [] : ['http://localhost:5173', 'http://127.0.0.1:5173']),
])

if (!jwtSecret && process.env.NODE_ENV === 'production') {
  throw new Error('JWT_SECRET is required in production')
}

const tokenSecret = jwtSecret ?? 'development-only-secret'
const refreshCookieName = 'student-profile-refresh'
const refreshMaxAgeSeconds = 7 * 24 * 60 * 60
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const storageBucket = process.env.STORAGE_BUCKET ?? 'student-profile-documents'
const storageEndpoint = process.env.STORAGE_ENDPOINT || process.env.MINIO_ENDPOINT
const storageAccessKey = process.env.STORAGE_ACCESS_KEY_ID || process.env.MINIO_ACCESS_KEY
const storageSecretKey = process.env.STORAGE_SECRET_ACCESS_KEY || process.env.MINIO_SECRET_KEY
const storageClient = storageEndpoint
  ? new S3Client({
      region: process.env.STORAGE_REGION ?? 'auto',
      endpoint: storageEndpoint,
      forcePathStyle: process.env.STORAGE_FORCE_PATH_STYLE === 'true' || Boolean(process.env.MINIO_ENDPOINT),
      credentials: storageAccessKey && storageSecretKey
        ? { accessKeyId: storageAccessKey, secretAccessKey: storageSecretKey }
        : undefined,
    })
  : new S3Client({
      region: process.env.STORAGE_REGION ?? 'us-east-1',
      credentials: storageAccessKey && storageSecretKey
        ? { accessKeyId: storageAccessKey, secretAccessKey: storageSecretKey }
        : undefined,
    })

type Role = 'super_admin' | 'teacher' | 'student'
type AuthUser = { id: string; collegeId: string; role: Role; email: string; fullName: string; mustResetPassword: boolean }

type AuthRequest = Request & { user?: AuthUser }

app.use(cors({ origin: (origin, callback) => {
  if (!origin || allowedWebOrigins.has(origin)) {
    callback(null, true)
    return
  }
  callback(new Error('Origin is not allowed'))
} }))
app.use(express.json({ limit: '1mb' }))

function signAccessToken(user: AuthUser) {
  return jwt.sign(user, tokenSecret, { expiresIn: '15m' })
}

function signRefreshToken(user: AuthUser) {
  return jwt.sign({ ...user, tokenType: 'refresh' }, tokenSecret, { expiresIn: '7d' })
}

function setRefreshCookie(response: Response, token: string) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  response.setHeader('Set-Cookie', `${refreshCookieName}=${encodeURIComponent(token)}; Max-Age=${refreshMaxAgeSeconds}; Path=/api/auth; HttpOnly; SameSite=Lax${secure}`)
}

function getCookie(request: Request, name: string) {
  const cookie = request.headers.cookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))
  return cookie ? decodeURIComponent(cookie.slice(name.length + 1)) : undefined
}

type RateLimitEntry = { count: number; resetAt: number }

function createRateLimiter(options: { limit: number; windowMs: number; key: (request: Request & { user?: AuthUser }) => string }) {
  const entries = new Map<string, RateLimitEntry>()
  return (request: Request & { user?: AuthUser }, response: Response, next: NextFunction) => {
    const now = Date.now()
    const key = options.key(request)
    const current = entries.get(key)
    const entry = !current || current.resetAt <= now ? { count: 0, resetAt: now + options.windowMs } : current
    entry.count += 1
    entries.set(key, entry)
    if (entry.count > options.limit) {
      const retryAfterSeconds = Math.ceil((entry.resetAt - now) / 1000)
      response.setHeader('Retry-After', retryAfterSeconds)
      return response.status(429).json({ error: 'Too many requests', retryAfterSeconds })
    }
    next()
  }
}

const loginRateLimiter = createRateLimiter({
  limit: 5,
  windowMs: 15 * 60 * 1000,
  key: (request) => `${request.ip}:${String(request.body?.email ?? '').trim().toLowerCase()}`,
})

const aiRateLimiter = createRateLimiter({
  limit: 20,
  windowMs: 60 * 60 * 1000,
  key: (request) => request.user?.id ?? request.ip ?? 'unknown-ip',
})

function requireAuth(request: AuthRequest, response: Response, next: NextFunction) {
  const token = request.headers.authorization?.replace('Bearer ', '')
  if (!token) return response.status(401).json({ error: 'Authentication required' })

  try {
    const user = jwt.verify(token, tokenSecret) as AuthUser
    if (user.mustResetPassword && request.path !== '/api/auth/reset-password') {
      return response.status(403).json({ error: 'Password reset required', code: 'PASSWORD_RESET_REQUIRED' })
    }
    request.user = user
    next()
  } catch {
    return response.status(401).json({ error: 'Invalid or expired token' })
  }
}

function requireRoles(...roles: Role[]) {
  return (request: AuthRequest, response: Response, next: NextFunction) => {
    if (!request.user || !roles.includes(request.user.role)) {
      return response.status(403).json({ error: 'Insufficient permissions' })
    }
    next()
  }
}

async function teacherHasAssignment(teacherId: string, classId: string, subjectId: string, semesterId: string) {
  const result = await pool.query(
    `SELECT 1 FROM teacher_class_assignments
      WHERE teacher_id = $1 AND class_id = $2 AND subject_id = $3 AND semester_id = $4
        AND status IN ('active', 'past')
      LIMIT 1`,
    [teacherId, classId, subjectId, semesterId],
  )
  return result.rowCount === 1
}

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
})

const resetPasswordSchema = z.object({
  newPassword: z.string().min(8).max(200),
})

const adminResetPasswordSchema = z.object({
  email: z.string().email(),
  newPassword: z.string().min(8).max(200),
})

const accountStatusSchema = z.object({
  isActive: z.boolean(),
})

const uuidSchema = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)

const marksSchema = z.object({
  classId: uuidSchema,
  subjectId: uuidSchema,
  semesterId: uuidSchema,
  examType: z.enum(['internal1', 'internal2', 'midterm', 'final', 'assignment', 'practical']),
  marks: z.array(z.object({
    studentId: uuidSchema,
    marksObtained: z.number().min(0),
    maxMarks: z.number().positive(),
  })).min(1).max(500),
})

const profileUpdateSchema = z.object({
  profilePhotoUrl: z.string().url().or(z.literal('')).nullable().optional(),
  linkedinUrl: z.string().url().or(z.literal('')).nullable().optional(),
  githubUrl: z.string().url().or(z.literal('')).nullable().optional(),
  bio: z.string().max(1000).optional(),
})

const documentSchema = z.object({
  docType: z.enum(['photo', 'resume_pdf', 'resume_docx', 'certificate', 'other']),
  fileName: z.string().min(1).max(255),
  fileUrl: z.string().url(),
  objectKey: z.string().min(1).optional(),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().positive(),
  parsedHeadings: z.array(z.string().min(1).max(80)).max(30).default([]),
})

const presignSchema = documentSchema.pick({ docType: true, fileName: true, mimeType: true, sizeBytes: true })

const notificationSchema = z.object({
  title: z.string().min(1).max(255),
  body: z.string().max(5000).optional(),
  targetRole: z.enum(['all', 'students', 'teachers']).optional(),
  targetClassId: uuidSchema.optional(),
  fileUrl: z.string().url().optional(),
})

const assignmentSchema = z.object({
  teacherId: uuidSchema,
  classId: uuidSchema,
  subjectId: uuidSchema,
  semesterId: uuidSchema,
})

const bulkUsersSchema = z.object({
  users: z.array(z.object({
    email: z.string().email(),
    fullName: z.string().min(2).max(150),
    role: z.enum(['teacher', 'student']),
    password: z.string().min(8),
    rollNumber: z.string().min(2).max(50).optional(),
  })).min(1).max(1000),
})

const marksheetSchema = z.object({
  studentId: uuidSchema,
  semesterId: uuidSchema,
  fileUrl: z.string().url(),
  sgpa: z.number().min(0).max(10).optional(),
  cgpa: z.number().min(0).max(10).optional(),
})

const aiQuerySchema = z.object({
  query: z.string().min(2).max(1000),
  classId: uuidSchema.optional(),
  subjectId: uuidSchema.optional(),
  semesterId: uuidSchema.optional(),
})

const analyticsQuerySchema = z.object({
  classId: uuidSchema,
  subjectId: uuidSchema,
  studentIds: z.array(uuidSchema).nullable().optional(),
  semesterIds: z.array(uuidSchema).min(1),
  examTypes: z.array(z.enum(['internal1', 'internal2', 'midterm', 'final', 'assignment', 'practical'])).min(1),
})

const allowedDocumentTypes: Record<string, { mimeTypes: string[]; maxBytes: number }> = {
  photo: { mimeTypes: ['image/jpeg', 'image/png'], maxBytes: 5 * 1024 * 1024 },
  resume_pdf: { mimeTypes: ['application/pdf'], maxBytes: 10 * 1024 * 1024 },
  resume_docx: { mimeTypes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'], maxBytes: 10 * 1024 * 1024 },
}

class DocumentValidationError extends Error {
  constructor(public readonly status: number, message: string, public readonly details?: Record<string, unknown>) {
    super(message)
  }
}

function validateDocument(input: z.infer<typeof documentSchema>) {
  const rule = allowedDocumentTypes[input.docType]
  if (!rule) return
  if (input.sizeBytes > rule.maxBytes) {
    throw new DocumentValidationError(413, `File exceeds maximum allowed size of ${rule.maxBytes / (1024 * 1024)}MB`, { maxSizeBytes: rule.maxBytes })
  }
  if (!rule.mimeTypes.includes(input.mimeType)) {
    throw new DocumentValidationError(400, `Invalid MIME type for ${input.docType}`, { allowedMimeTypes: rule.mimeTypes })
  }
}

function objectKeyFromUrl(fileUrl: string) {
  const pathname = new URL(fileUrl).pathname.replace(/^\/+/, '')
  return pathname.startsWith(`${storageBucket}/`) ? pathname.slice(storageBucket.length + 1) : pathname
}

function assertStudentObjectKey(objectKey: string | undefined, user: AuthUser) {
  if (!objectKey || !objectKey.startsWith(`${user.collegeId}/students/${user.id}/`)) {
    throw new DocumentValidationError(400, 'Document storage key is outside the student account scope')
  }
}

app.get('/api/health', (_request, response) => {
  response.json({ service: 'student-profile-saas-api', status: 'ok' })
})

app.post('/api/auth/login', loginRateLimiter, async (request, response, next) => {
  try {
    const input = loginSchema.parse(request.body)
    const result = await pool.query<{ id: string; college_id: string; role: Role; email: string; full_name: string; password_hash: string; is_active: boolean; must_reset_password: boolean }>(
      'SELECT id, college_id, role, email, full_name, password_hash, is_active, must_reset_password FROM users WHERE email = $1 LIMIT 1',
      [input.email.toLowerCase()],
    )
    const user = result.rows[0]
    if (!user || !user.is_active || !(await bcrypt.compare(input.password, user.password_hash))) {
      return response.status(401).json({ error: 'Invalid email or password' })
    }

    const authUser: AuthUser = { id: user.id, collegeId: user.college_id, role: user.role, email: user.email, fullName: user.full_name, mustResetPassword: user.must_reset_password }
    await pool.query('UPDATE users SET last_login = now() WHERE id = $1', [user.id])
    setRefreshCookie(response, signRefreshToken(authUser))
    return response.json({ accessToken: signAccessToken(authUser), user: authUser })
  } catch (error) {
    next(error)
  }
})

app.post('/api/auth/refresh', async (request, response, next) => {
  try {
    const refreshToken = getCookie(request, refreshCookieName)
    if (!refreshToken) return response.status(401).json({ error: 'Refresh token required' })
    const payload = jwt.verify(refreshToken, tokenSecret) as AuthUser & { tokenType?: string }
    if (payload.tokenType !== 'refresh') return response.status(401).json({ error: 'Invalid refresh token' })
    const result = await pool.query<{ id: string; college_id: string; role: Role; email: string; full_name: string; is_active: boolean; must_reset_password: boolean }>(
      'SELECT id, college_id, role, email, full_name, is_active, must_reset_password FROM users WHERE id = $1 LIMIT 1',
      [payload.id],
    )
    const user = result.rows[0]
    if (!user || !user.is_active) return response.status(401).json({ error: 'Invalid refresh token' })
    const authUser: AuthUser = { id: user.id, collegeId: user.college_id, role: user.role, email: user.email, fullName: user.full_name, mustResetPassword: user.must_reset_password }
    setRefreshCookie(response, signRefreshToken(authUser))
    return response.json({ accessToken: signAccessToken(authUser), user: authUser })
  } catch (error) {
    return next(error)
  }
})

app.post('/api/auth/reset-password', requireAuth, async (request: AuthRequest, response, next) => {
  try {
    const input = resetPasswordSchema.parse(request.body)
    const passwordHash = await bcrypt.hash(input.newPassword, 12)
    const result = await pool.query<{ id: string; college_id: string; role: Role; email: string; full_name: string }>(
      `UPDATE users SET password_hash = $1, must_reset_password = false
        WHERE id = $2 AND is_active = true
        RETURNING id, college_id, role, email, full_name`,
      [passwordHash, request.user!.id],
    )
    if (result.rowCount !== 1) return response.status(404).json({ error: 'User not found' })
    const user = result.rows[0]
    const authUser: AuthUser = { id: user.id, collegeId: user.college_id, role: user.role, email: user.email, fullName: user.full_name, mustResetPassword: false }
    setRefreshCookie(response, signRefreshToken(authUser))
    return response.json({ accessToken: signAccessToken(authUser), user: authUser })
  } catch (error) {
    next(error)
  }
})

app.get('/api/students/me', requireAuth, requireRoles('student'), async (request: AuthRequest, response, next) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.email, u.full_name, st.roll_number, st.linkedin_url, st.github_url,
              st.profile_photo_url, st.resume_url, st.bio, st.profile_strength,
              c.name AS class_name, d.name AS department_name
         FROM users u
         JOIN students st ON st.id = u.id AND st.college_id = u.college_id
         LEFT JOIN classes c ON c.id = st.class_id
         LEFT JOIN departments d ON d.id = st.department_id
        WHERE u.id = $1 AND u.college_id = $2`,
      [request.user!.id, request.user!.collegeId],
    )
    if (result.rowCount !== 1) return response.status(404).json({ error: 'Student profile not found' })
    return response.json({ profile: result.rows[0] })
  } catch (error) {
    next(error)
  }
})

app.post('/api/students/me/documents/presign', requireAuth, requireRoles('student'), async (request: AuthRequest, response, next) => {
  try {
    const input = presignSchema.parse(request.body)
    validateDocument({ ...input, fileUrl: 'https://upload.invalid', parsedHeadings: [] })
    if (!storageEndpoint || !storageAccessKey || !storageSecretKey) {
      return response.status(503).json({ error: 'Object storage is not configured' })
    }

    const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, '-').toLowerCase()
    const objectKey = `${request.user!.collegeId}/students/${request.user!.id}/${Date.now()}-${safeName}`
    const command = new PutObjectCommand({ Bucket: storageBucket, Key: objectKey, ContentType: input.mimeType })
    const uploadUrl = await getSignedUrl(storageClient, command, { expiresIn: 900 })
    return response.json({ uploadUrl, objectKey, expiresInSeconds: 900 })
  } catch (error) {
    next(error)
  }
})

app.put('/api/students/me', requireAuth, requireRoles('student'), async (request: AuthRequest, response, next) => {
  try {
    const input = profileUpdateSchema.parse(request.body)
    const result = await pool.query(
      `UPDATE students
          SET profile_photo_url = COALESCE($1, profile_photo_url),
              linkedin_url = COALESCE($2, linkedin_url),
              github_url = COALESCE($3, github_url),
              bio = COALESCE($4, bio),
              profile_strength = LEAST(100,
                (CASE WHEN COALESCE($1, profile_photo_url) IS NOT NULL AND COALESCE($1, profile_photo_url) <> '' THEN 20 ELSE 0 END) +
                (CASE WHEN resume_url IS NOT NULL THEN 25 ELSE 0 END) +
                (CASE WHEN COALESCE($2, linkedin_url) IS NOT NULL AND COALESCE($2, linkedin_url) <> '' THEN 15 ELSE 0 END) +
                (CASE WHEN COALESCE($3, github_url) IS NOT NULL AND COALESCE($3, github_url) <> '' THEN 15 ELSE 0 END) +
                (CASE WHEN COALESCE($4, bio) IS NOT NULL AND COALESCE($4, bio) <> '' THEN 10 ELSE 0 END) +
                (CASE WHEN EXISTS (SELECT 1 FROM marks WHERE student_id = students.id) THEN 15 ELSE 0 END))
        WHERE id = $5 AND college_id = $6
      RETURNING profile_photo_url, linkedin_url, github_url, bio, profile_strength`,
      [input.profilePhotoUrl, input.linkedinUrl, input.githubUrl, input.bio, request.user!.id, request.user!.collegeId],
    )
    if (result.rowCount !== 1) return response.status(404).json({ error: 'Student profile not found' })
    return response.json({ profile: result.rows[0] })
  } catch (error) {
    next(error)
  }
})

app.post('/api/students/me/documents', requireAuth, requireRoles('student'), async (request: AuthRequest, response, next) => {
  try {
    const input = documentSchema.parse(request.body)
    validateDocument(input)
    assertStudentObjectKey(input.objectKey, request.user!)
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const documentResult = await client.query(
        `INSERT INTO student_documents (student_id, doc_type, file_url, file_name, parsed_headings, status)
         VALUES ($1, $2, $3, $4, $5, 'scanning')
         RETURNING id, doc_type, file_name, parsed_headings, status, uploaded_at`,
        [request.user!.id, input.docType, input.fileUrl, input.fileName, JSON.stringify(input.parsedHeadings)],
      )
      if (input.docType === 'photo') {
        await client.query('UPDATE students SET profile_photo_url = $1 WHERE id = $2 AND college_id = $3', [input.fileUrl, request.user!.id, request.user!.collegeId])
      }
      if (input.docType === 'resume_pdf' || input.docType === 'resume_docx') {
        await client.query('UPDATE students SET resume_url = $1 WHERE id = $2 AND college_id = $3', [input.fileUrl, request.user!.id, request.user!.collegeId])
      }
      await client.query('COMMIT')
      if (input.docType === 'resume_pdf' || input.docType === 'resume_docx') {
        void storageClient.send(new GetObjectCommand({ Bucket: storageBucket, Key: input.objectKey ?? objectKeyFromUrl(input.fileUrl) })).then(async (fileResponse) => {
          if (!fileResponse.Body) throw new Error('Uploaded document has no content')
          const parsedHeadings = await parseResume(Buffer.from(await fileResponse.Body.transformToByteArray()), input.mimeType)
          await pool.query('UPDATE student_documents SET parsed_headings = $1, status = $2 WHERE id = $3 AND student_id = $4', [JSON.stringify(parsedHeadings), 'active', documentResult.rows[0].id, request.user!.id])
        }).catch((error) => console.error('Document parsing failed', error))
      }
      return response.status(201).json({ document: documentResult.rows[0], message: 'Document queued for security scanning' })
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  } catch (error) {
    next(error)
  }
})

app.get('/api/students/me/documents', requireAuth, requireRoles('student'), async (request: AuthRequest, response, next) => {
  try {
    const result = await pool.query(
      `SELECT id, doc_type, file_name, file_url, parsed_headings, uploaded_at, status
         FROM student_documents WHERE student_id = $1 ORDER BY uploaded_at DESC`,
      [request.user!.id],
    )
    return response.json({ documents: result.rows })
  } catch (error) {
    next(error)
  }
})

app.get('/api/students/me/documents/:documentId/download', requireAuth, requireRoles('student'), async (request: AuthRequest, response, next) => {
  try {
    const documentId = uuidSchema.parse(request.params.documentId)
    const result = await pool.query<{ file_url: string; file_name: string | null }>(
      `SELECT file_url, file_name FROM student_documents
        WHERE id = $1 AND student_id = $2 AND status <> 'archived'`,
      [documentId, request.user!.id],
    )
    const document = result.rows[0]
    if (!document) return response.status(404).json({ error: 'Document not found' })
    if (!storageEndpoint || !storageAccessKey || !storageSecretKey) return response.status(503).json({ error: 'Object storage is not configured' })
    const objectKey = objectKeyFromUrl(document.file_url)
    const downloadUrl = await getSignedUrl(storageClient, new GetObjectCommand({ Bucket: storageBucket, Key: objectKey }), { expiresIn: 900 })
    return response.json({ downloadUrl, expiresInSeconds: 900, fileName: document.file_name })
  } catch (error) {
    next(error)
  }
})

app.delete('/api/students/me/documents/:documentId', requireAuth, requireRoles('student'), async (request: AuthRequest, response, next) => {
  try {
    const documentId = uuidSchema.parse(request.params.documentId)
    const result = await pool.query<{ file_url: string; doc_type: string }>(
      `UPDATE student_documents
          SET status = 'archived'
        WHERE id = $1 AND student_id = $2 AND status <> 'archived'
        RETURNING file_url, doc_type`,
      [documentId, request.user!.id],
    )
    const document = result.rows[0]
    if (!document) return response.status(404).json({ error: 'Document not found' })
    if (storageEndpoint && storageAccessKey && storageSecretKey) {
      await storageClient.send(new DeleteObjectCommand({ Bucket: storageBucket, Key: objectKeyFromUrl(document.file_url) }))
    }
    if (document.doc_type === 'photo') await pool.query('UPDATE students SET profile_photo_url = NULL WHERE id = $1 AND profile_photo_url = $2', [request.user!.id, document.file_url])
    if (document.doc_type === 'resume_pdf' || document.doc_type === 'resume_docx') await pool.query('UPDATE students SET resume_url = NULL WHERE id = $1 AND resume_url = $2', [request.user!.id, document.file_url])
    return response.json({ deleted: true })
  } catch (error) {
    next(error)
  }
})

app.get('/api/students/me/notifications', requireAuth, requireRoles('student'), async (request: AuthRequest, response, next) => {
  try {
    const result = await pool.query(
      `SELECT n.id, n.title, n.body, n.file_url, n.created_at,
              CASE WHEN nr.notification_id IS NULL THEN false ELSE true END AS is_read
         FROM notifications n
         JOIN users u ON u.id = $1 AND u.college_id = n.college_id
         JOIN students st ON st.id = u.id
         LEFT JOIN notification_reads nr ON nr.notification_id = n.id AND nr.user_id = u.id
        WHERE n.college_id = $2
          AND (n.target_role IS NULL OR n.target_role IN ('all', 'students'))
          AND (n.target_class_id IS NULL OR n.target_class_id = st.class_id)
        ORDER BY n.created_at DESC
        LIMIT 100`,
      [request.user!.id, request.user!.collegeId],
    )
    return response.json({ notifications: result.rows })
  } catch (error) {
    next(error)
  }
})

app.get('/api/students/me/marks', requireAuth, requireRoles('student'), async (request: AuthRequest, response, next) => {
  try {
    const result = await pool.query(
      `SELECT m.id, m.exam_type, m.marks_obtained, m.max_marks, m.entered_at,
              s.name AS subject_name, s.code AS subject_code, sem.sem_number,
              ay.label AS academic_year
         FROM marks m
         JOIN students st ON st.id = m.student_id AND st.college_id = $1
         JOIN subjects s ON s.id = m.subject_id
         JOIN semesters sem ON sem.id = m.semester_id
         JOIN academic_years ay ON ay.id = sem.academic_year_id AND ay.college_id = $1
        WHERE m.student_id = $2
        ORDER BY ay.label DESC, sem.sem_number DESC, s.name, m.exam_type`,
      [request.user!.collegeId, request.user!.id],
    )
    return response.json({ marks: result.rows })
  } catch (error) {
    next(error)
  }
})

app.get('/api/students/me/marksheets', requireAuth, requireRoles('student'), async (request: AuthRequest, response, next) => {
  try {
    const result = await pool.query(
      `SELECT ms.id, ms.file_url, ms.uploaded_at, ms.sgpa, ms.cgpa,
              sem.sem_number, ay.label AS academic_year
         FROM marksheets ms
         JOIN students st ON st.id = ms.student_id AND st.college_id = $1
         JOIN semesters sem ON sem.id = ms.semester_id
         JOIN academic_years ay ON ay.id = sem.academic_year_id AND ay.college_id = $1
        WHERE ms.student_id = $2
        ORDER BY ay.label DESC, sem.sem_number DESC`,
      [request.user!.collegeId, request.user!.id],
    )
    return response.json({ marksheets: result.rows })
  } catch (error) {
    next(error)
  }
})

app.post('/api/students/me/notifications/:notificationId/read', requireAuth, requireRoles('student'), async (request: AuthRequest, response, next) => {
  try {
    const notificationId = uuidSchema.parse(request.params.notificationId)
    const result = await pool.query(
      `INSERT INTO notification_reads (notification_id, user_id, read_at)
       SELECT n.id, u.id, now()
         FROM notifications n
         JOIN users u ON u.id = $2 AND u.college_id = n.college_id
         JOIN students st ON st.id = u.id
        WHERE n.id = $1 AND n.college_id = $3
          AND (n.target_role IS NULL OR n.target_role IN ('all', 'students'))
          AND (n.target_class_id IS NULL OR n.target_class_id = st.class_id)
       ON CONFLICT (notification_id, user_id)
       DO UPDATE SET read_at = now()
       RETURNING notification_id, user_id, read_at`,
      [notificationId, request.user!.id, request.user!.collegeId],
    )
    if (result.rowCount !== 1) return response.status(404).json({ error: 'Notification not found' })
    return response.json({ read: result.rows[0] })
  } catch (error) {
    next(error)
  }
})

app.post('/api/students/me/notifications/read-all', requireAuth, requireRoles('student'), async (request: AuthRequest, response, next) => {
  try {
    const result = await pool.query(
      `INSERT INTO notification_reads (notification_id, user_id, read_at)
       SELECT n.id, $1, now()
         FROM notifications n
         JOIN students st ON st.id = $1
        WHERE n.college_id = $2
          AND (n.target_role IS NULL OR n.target_role IN ('all', 'students'))
          AND (n.target_class_id IS NULL OR n.target_class_id = st.class_id)
       ON CONFLICT (notification_id, user_id)
       DO UPDATE SET read_at = now()`,
      [request.user!.id, request.user!.collegeId],
    )
    return response.json({ markedRead: result.rowCount ?? 0 })
  } catch (error) {
    next(error)
  }
})

app.post('/api/admin/notifications', requireAuth, requireRoles('super_admin'), async (request: AuthRequest, response, next) => {
  try {
    const input = notificationSchema.parse(request.body)
    const result = await pool.query(
      `INSERT INTO notifications (college_id, title, body, target_role, target_class_id, file_url, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, title, body, target_role, target_class_id, file_url, created_at`,
      [request.user!.collegeId, input.title, input.body ?? null, input.targetRole ?? 'all', input.targetClassId ?? null, input.fileUrl ?? null, request.user!.id],
    )
    return response.status(201).json({ notification: result.rows[0] })
  } catch (error) {
    next(error)
  }
})

app.post('/api/admin/users/bulk-import', requireAuth, requireRoles('super_admin'), async (request: AuthRequest, response, next) => {
  const client = await pool.connect()
  try {
    const input = bulkUsersSchema.parse(request.body)
    if (input.users.some((user) => user.role === 'student' && !user.rollNumber)) {
      return response.status(400).json({ error: 'Every student import row requires a rollNumber' })
    }

    await client.query('BEGIN')
    const imported: Array<{ email: string; role: string; userId: string }> = []
    for (const user of input.users) {
      const passwordHash = await bcrypt.hash(user.password, 12)
      const userResult = await client.query<{ id: string }>(
        `INSERT INTO users (college_id, email, password_hash, role, full_name, must_reset_password)
         VALUES ($1, lower($2), $3, $4, $5, true)
         RETURNING id`,
        [request.user!.collegeId, user.email, passwordHash, user.role, user.fullName],
      )
      if (user.role === 'student') {
        await client.query(
          `INSERT INTO students (id, college_id, roll_number)
           VALUES ($1, $2, $3)`,
          [userResult.rows[0].id, request.user!.collegeId, user.rollNumber],
        )
      }
      imported.push({ email: user.email.toLowerCase(), role: user.role, userId: userResult.rows[0].id })
    }
    await client.query('COMMIT')
    return response.status(201).json({ imported: imported.length, users: imported })
  } catch (error) {
    await client.query('ROLLBACK')
    next(error)
  } finally {
    client.release()
  }
})

app.post('/api/admin/marksheets', requireAuth, requireRoles('super_admin'), async (request: AuthRequest, response, next) => {
  try {
    const input = marksheetSchema.parse(request.body)
    const result = await pool.query(
      `INSERT INTO marksheets (student_id, semester_id, file_url, uploaded_by, sgpa, cgpa)
       SELECT st.id, sem.id, $3, $4, $5, $6
         FROM students st
         JOIN users u ON u.id = st.id AND u.college_id = $7
         JOIN semesters sem ON sem.id = $2
         JOIN academic_years ay ON ay.id = sem.academic_year_id AND ay.college_id = $7
        WHERE st.id = $1
       RETURNING id, student_id, semester_id, file_url, sgpa, cgpa, uploaded_at`,
      [input.studentId, input.semesterId, input.fileUrl, request.user!.id, input.sgpa ?? null, input.cgpa ?? null, request.user!.collegeId],
    )
    if (result.rowCount !== 1) return response.status(400).json({ error: 'Student or semester is outside this college' })
    return response.status(201).json({ marksheet: result.rows[0] })
  } catch (error) {
    next(error)
  }
})

app.post('/api/admin/users/reset-password', requireAuth, requireRoles('super_admin'), async (request: AuthRequest, response, next) => {
  try {
    const input = adminResetPasswordSchema.parse(request.body)
    const passwordHash = await bcrypt.hash(input.newPassword, 12)
    const result = await pool.query<{ id: string; email: string }>(
      `UPDATE users
          SET password_hash = $1, must_reset_password = true
        WHERE lower(email) = lower($2) AND college_id = $3 AND is_active = true AND role <> 'super_admin'
        RETURNING id, email`,
      [passwordHash, input.email, request.user!.collegeId],
    )
    if (result.rowCount !== 1) return response.status(404).json({ error: 'Active teacher or student account not found' })
    return response.json({ message: 'Password changed. The user must update it after signing in.', user: result.rows[0] })
  } catch (error) {
    next(error)
  }
})

app.patch('/api/admin/users/:userId/status', requireAuth, requireRoles('super_admin'), async (request: AuthRequest, response, next) => {
  try {
    const userId = uuidSchema.parse(request.params.userId)
    const input = accountStatusSchema.parse(request.body)
    if (userId === request.user!.id) return response.status(400).json({ error: 'You cannot disable your own account' })
    const result = await pool.query<{ id: string; email: string; is_active: boolean }>(
      `UPDATE users
          SET is_active = $1
        WHERE id = $2 AND college_id = $3 AND role <> 'super_admin'
        RETURNING id, email, is_active`,
      [input.isActive, userId, request.user!.collegeId],
    )
    if (result.rowCount !== 1) return response.status(404).json({ error: 'Teacher or student account not found' })
    return response.json({ user: result.rows[0] })
  } catch (error) {
    next(error)
  }
})

app.get('/api/admin/users', requireAuth, requireRoles('super_admin'), async (request: AuthRequest, response, next) => {
  try {
    const result = await pool.query(
      `SELECT id, email, full_name, role, is_active, must_reset_password, created_at, last_login
         FROM users
        WHERE college_id = $1
        ORDER BY role, full_name`,
      [request.user!.collegeId],
    )
    return response.json({ users: result.rows })
  } catch (error) {
    next(error)
  }
})

app.get('/api/admin/catalog', requireAuth, requireRoles('super_admin'), async (request: AuthRequest, response, next) => {
  try {
    const [teachers, classes, subjects, semesters] = await Promise.all([
      pool.query(`SELECT id, full_name, email FROM users WHERE college_id = $1 AND role = 'teacher' AND is_active = true ORDER BY full_name`, [request.user!.collegeId]),
      pool.query(`SELECT c.id, c.name, c.year, c.section, d.name AS department_name FROM classes c JOIN departments d ON d.id = c.department_id WHERE d.college_id = $1 ORDER BY d.name, c.year, c.section`, [request.user!.collegeId]),
      pool.query(`SELECT s.id, s.name, s.code, d.name AS department_name FROM subjects s JOIN departments d ON d.id = s.department_id WHERE d.college_id = $1 ORDER BY d.name, s.name`, [request.user!.collegeId]),
      pool.query(`SELECT sem.id, sem.sem_number, ay.label AS academic_year FROM semesters sem JOIN academic_years ay ON ay.id = sem.academic_year_id WHERE ay.college_id = $1 ORDER BY ay.label DESC, sem.sem_number`, [request.user!.collegeId]),
    ])
    return response.json({ teachers: teachers.rows, classes: classes.rows, subjects: subjects.rows, semesters: semesters.rows })
  } catch (error) {
    next(error)
  }
})

app.get('/api/admin/overview', requireAuth, requireRoles('super_admin'), async (request: AuthRequest, response, next) => {
  try {
    const result = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE u.role = 'student')::int AS student_count,
         COUNT(*) FILTER (WHERE u.role = 'teacher')::int AS teacher_count,
         (SELECT COUNT(*)::int FROM classes c JOIN departments d ON d.id = c.department_id WHERE d.college_id = $1) AS class_count,
         (SELECT COUNT(*)::int FROM semesters sem JOIN academic_years ay ON ay.id = sem.academic_year_id WHERE ay.college_id = $1 AND CURRENT_DATE BETWEEN COALESCE(sem.start_date, CURRENT_DATE) AND COALESCE(sem.end_date, CURRENT_DATE)) AS active_semester_count
       FROM users u WHERE u.college_id = $1`,
      [request.user!.collegeId],
    )
    return response.json({ overview: result.rows[0] })
  } catch (error) {
    next(error)
  }
})

app.get('/api/admin/assignments', requireAuth, requireRoles('super_admin'), async (request: AuthRequest, response, next) => {
  try {
    const result = await pool.query(
      `SELECT a.id, a.teacher_id, u.full_name AS teacher_name, a.class_id, c.name AS class_name,
              a.subject_id, s.name AS subject_name, a.semester_id, sem.sem_number, a.status
         FROM teacher_class_assignments a
         JOIN users u ON u.id = a.teacher_id AND u.college_id = $1
         JOIN classes c ON c.id = a.class_id
         JOIN subjects s ON s.id = a.subject_id
         JOIN semesters sem ON sem.id = a.semester_id
         JOIN academic_years ay ON ay.id = sem.academic_year_id AND ay.college_id = $1
        ORDER BY a.status, u.full_name, sem.sem_number`,
      [request.user!.collegeId],
    )
    return response.json({ assignments: result.rows })
  } catch (error) {
    next(error)
  }
})

app.post('/api/admin/assignments', requireAuth, requireRoles('super_admin'), async (request: AuthRequest, response, next) => {
  try {
    const input = assignmentSchema.parse(request.body)
    const result = await pool.query(
      `INSERT INTO teacher_class_assignments (teacher_id, class_id, subject_id, semester_id, status)
       SELECT u.id, c.id, s.id, sem.id, 'active'
         FROM users u
         JOIN classes c ON c.id = $2
         JOIN departments cd ON cd.id = c.department_id AND cd.college_id = $5
         JOIN subjects s ON s.id = $3 AND s.department_id = c.department_id
         JOIN semesters sem ON sem.id = $4
         JOIN academic_years ay ON ay.id = sem.academic_year_id AND ay.college_id = $5
        WHERE u.id = $1 AND u.college_id = $5 AND u.role = 'teacher'
       ON CONFLICT (teacher_id, class_id, subject_id, semester_id)
       DO UPDATE SET status = 'active'
       RETURNING id, teacher_id, class_id, subject_id, semester_id, status`,
      [input.teacherId, input.classId, input.subjectId, input.semesterId, request.user!.collegeId],
    )
    if (result.rowCount !== 1) return response.status(400).json({ error: 'Teacher, class, subject, or semester is outside this college' })
    return response.status(201).json({ assignment: result.rows[0] })
  } catch (error) {
    next(error)
  }
})

app.delete('/api/admin/assignments/:assignmentId', requireAuth, requireRoles('super_admin'), async (request: AuthRequest, response, next) => {
  try {
    const assignmentId = uuidSchema.parse(request.params.assignmentId)
    const result = await pool.query(
      `UPDATE teacher_class_assignments a
          SET status = 'past'
         FROM users u, classes c, departments d
        WHERE a.id = $1 AND u.id = a.teacher_id AND u.college_id = $2
          AND c.id = a.class_id AND d.id = c.department_id AND d.college_id = $2
      RETURNING a.id, a.status`,
      [assignmentId, request.user!.collegeId],
    )
    if (result.rowCount !== 1) return response.status(404).json({ error: 'Assignment not found' })
    return response.json({ assignment: result.rows[0] })
  } catch (error) {
    next(error)
  }
})

app.get('/api/teacher/assignments', requireAuth, requireRoles('teacher'), async (request: AuthRequest, response, next) => {
  try {
    const result = await pool.query(
            `SELECT a.id, a.class_id, c.name AS class_name, a.subject_id, s.name AS subject_name,
              a.semester_id, sem.sem_number, ay.label AS academic_year, a.status
         FROM teacher_class_assignments a
         JOIN classes c ON c.id = a.class_id
         JOIN subjects s ON s.id = a.subject_id
         JOIN semesters sem ON sem.id = a.semester_id
         JOIN academic_years ay ON ay.id = sem.academic_year_id
        WHERE a.teacher_id = $1 AND c.department_id IN (SELECT id FROM departments WHERE college_id = $2)
        ORDER BY a.status, sem.sem_number`,
      [request.user!.id, request.user!.collegeId],
    )
    return response.json({ assignments: result.rows })
  } catch (error) {
    next(error)
  }
})

app.get('/api/teacher/classes/:classId/students', requireAuth, requireRoles('teacher'), async (request: AuthRequest, response, next) => {
  try {
    const classId = uuidSchema.parse(request.params.classId)
    const subjectId = uuidSchema.parse(request.query.subjectId)
    const semesterId = uuidSchema.parse(request.query.semesterId)
    if (!await teacherHasAssignment(request.user!.id, classId, subjectId, semesterId)) {
      return response.status(403).json({ error: "You don't have access to this class's data." })
    }
    const result = await pool.query(
      `SELECT st.id, u.full_name, st.roll_number, st.profile_strength
         FROM students st
         JOIN users u ON u.id = st.id AND u.college_id = $2
        WHERE st.class_id = $1
          AND EXISTS (
            SELECT 1 FROM teacher_class_assignments a
             WHERE a.teacher_id = $3 AND a.class_id = st.class_id
               AND a.subject_id = $4 AND a.semester_id = $5
          )
        ORDER BY st.roll_number`,
      [classId, request.user!.collegeId, request.user!.id, subjectId, semesterId],
    )
    return response.json({ students: result.rows })
  } catch (error) {
    next(error)
  }
})

app.get('/api/teacher/analytics', requireAuth, requireRoles('teacher'), async (request: AuthRequest, response, next) => {
  try {
    const classId = uuidSchema.parse(request.query.classId)
    const subjectId = uuidSchema.parse(request.query.subjectId)
    const semesterId = uuidSchema.parse(request.query.semesterId)
    if (!await teacherHasAssignment(request.user!.id, classId, subjectId, semesterId)) {
      return response.status(403).json({ error: "You don't have access to this class's data." })
    }
    const result = await pool.query(
      `SELECT AVG(m.marks_obtained / NULLIF(m.max_marks, 0) * 100)::numeric(5,2) AS average_percentage,
              COUNT(DISTINCT m.student_id)::int AS student_count,
              MAX(m.marks_obtained / NULLIF(m.max_marks, 0) * 100)::numeric(5,2) AS top_percentage
         FROM marks m
         JOIN students st ON st.id = m.student_id AND st.class_id = $1
        WHERE m.subject_id = $2 AND m.semester_id = $3
          AND EXISTS (
            SELECT 1 FROM teacher_class_assignments a
             WHERE a.teacher_id = $4 AND a.class_id = $1
               AND a.subject_id = m.subject_id AND a.semester_id = m.semester_id
          )`,
      [classId, subjectId, semesterId, request.user!.id],
    )
    return response.json({ analytics: result.rows[0] })
  } catch (error) {
    next(error)
  }
})

app.post('/api/teacher/analytics/query', requireAuth, requireRoles('teacher'), async (request: AuthRequest, response, next) => {
  try {
    const input = analyticsQuerySchema.parse(request.body)
    for (const semesterId of input.semesterIds) {
      if (!await teacherHasAssignment(request.user!.id, input.classId, input.subjectId, semesterId)) {
        return response.status(403).json({ error: "You don't have access to this class's data." })
      }
    }

    const studentIds = input.studentIds ?? []
    if (studentIds.length) {
      const students = await pool.query(
        `SELECT COUNT(*)::int AS count FROM students st
          JOIN users u ON u.id = st.id AND u.college_id = $2
         WHERE st.id = ANY($1::uuid[]) AND st.class_id = $3`,
        [studentIds, request.user!.collegeId, input.classId],
      )
      if (students.rows[0].count !== studentIds.length) {
        return response.status(403).json({ error: "You don't have access to one or more selected students." })
      }
    }

    const result = await pool.query(
      `SELECT m.student_id, u.full_name AS student_name, st.roll_number, m.semester_id,
              sem.sem_number, ay.label AS semester_label, m.exam_type,
              m.marks_obtained, m.max_marks,
              (m.marks_obtained / NULLIF(m.max_marks, 0) * 100)::numeric AS percentage
         FROM marks m
         JOIN students st ON st.id = m.student_id AND st.class_id = $1
         JOIN users u ON u.id = st.id AND u.college_id = $6
         JOIN semesters sem ON sem.id = m.semester_id
         JOIN academic_years ay ON ay.id = sem.academic_year_id AND ay.college_id = $6
        WHERE m.subject_id = $2
          AND m.semester_id = ANY($3::uuid[])
          AND m.exam_type = ANY($4::text[])
          AND ($5::uuid[] IS NULL OR m.student_id = ANY($5::uuid[]))
          AND EXISTS (SELECT 1 FROM teacher_class_assignments a
            WHERE a.teacher_id = $7 AND a.class_id = $1 AND a.subject_id = m.subject_id
              AND a.semester_id = m.semester_id AND a.status IN ('active', 'past'))
        ORDER BY ay.label, sem.sem_number, u.full_name, m.exam_type`,
      [input.classId, input.subjectId, input.semesterIds, input.examTypes, studentIds.length ? studentIds : null, request.user!.collegeId, request.user!.id],
    )

    const raw = result.rows.map((row) => ({
      studentId: row.student_id,
      studentName: row.student_name,
      rollNumber: row.roll_number,
      semesterId: row.semester_id,
      semesterLabel: row.semester_label,
      semesterNumber: row.sem_number,
      examType: row.exam_type,
      marksObtained: Number(row.marks_obtained),
      maxMarks: Number(row.max_marks),
      percentage: Number(row.percentage),
    }))
    const values = raw.map((row) => row.percentage)
    const gradeDistribution = { A: 0, B: 0, C: 0, D: 0, F: 0 }
    for (const value of values) {
      if (value >= 90) gradeDistribution.A += 1
      else if (value >= 80) gradeDistribution.B += 1
      else if (value >= 70) gradeDistribution.C += 1
      else if (value >= 60) gradeDistribution.D += 1
      else gradeDistribution.F += 1
    }
    const mean = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0
    const semesterKeys = [...new Set(raw.map((row) => `${row.semesterId}|${row.semesterLabel}`))]
    const semesterIndex = new Map(semesterKeys.map((key, index) => [key, index + 1]))
    const byStudent = new Map<string, typeof raw>()
    for (const row of raw) byStudent.set(row.studentId, [...(byStudent.get(row.studentId) ?? []), row])
    const perStudentStats = [...byStudent.entries()].map(([studentId, rows]) => {
      const bySemester = new Map<string, number[]>()
      for (const row of rows) bySemester.set(`${row.semesterId}|${row.semesterLabel}`, [...(bySemester.get(`${row.semesterId}|${row.semesterLabel}`) ?? []), row.percentage])
      return {
        studentId,
        studentName: rows[0].studentName,
        mean: rows.reduce((sum, row) => sum + row.percentage, 0) / rows.length,
        trend: [...bySemester.entries()].map(([key, semesterValues]) => ({ semesterLabel: key.split('|')[1], avgPercentage: semesterValues.reduce((sum, value) => sum + value, 0) / semesterValues.length })),
      }
    })
    const trendValues = new Map<number, number[]>()
    for (const row of raw) {
      const index = semesterIndex.get(`${row.semesterId}|${row.semesterLabel}`)!
      trendValues.set(index, [...(trendValues.get(index) ?? []), row.percentage])
    }
    const pointsUsed = [...trendValues.entries()].map(([x, trend]) => ({ x, y: trend.reduce((sum, value) => sum + value, 0) / trend.length }))
    return response.json({
      raw,
      stats: { mean, median: median(values), stdDev: standardDeviation(values), min: values.length ? Math.min(...values) : 0, max: values.length ? Math.max(...values) : 0, count: values.length },
      perStudentStats,
      gradeDistribution,
      regression: linearRegression(pointsUsed) ?? { reason: 'insufficient_data' },
    })
  } catch (error) {
    next(error)
  }
})

async function handleAiQuery(request: AuthRequest, response: Response, next: NextFunction) {
  let input: z.infer<typeof aiQuerySchema> | undefined
  try {
    input = aiQuerySchema.parse(request.body)
    const result = await runGeminiQuery(pool, request.user!, input.query)
    await pool.query(
      'INSERT INTO ai_query_logs (user_id, query_text, resolved_intent, response_summary) VALUES ($1, $2, $3, $4)',
      [request.user!.id, input.query, result.toolCalls.map((call) => call.name).join(',') || 'none', result.response],
    )
    return response.json({ response: result.response, toolCalls: result.toolCalls.map((call) => ({ name: call.name, args: call.args })), provider: 'gemini-function-calling' })
  } catch (error) {
    if (input) {
      const resolvedIntent = error instanceof AiScopeError ? 'scope_rejected' : 'error'
      const responseSummary = error instanceof Error ? error.message : 'AI query failed'
      await pool.query(
        'INSERT INTO ai_query_logs (user_id, query_text, resolved_intent, response_summary) VALUES ($1, $2, $3, $4)',
        [request.user!.id, input.query, resolvedIntent, responseSummary],
      )
    }
    next(error)
  }
}

app.post('/api/teacher/ai/query', requireAuth, requireRoles('teacher'), aiRateLimiter, handleAiQuery)
app.post('/api/student/ai/query', requireAuth, requireRoles('student'), aiRateLimiter, handleAiQuery)
app.post('/api/admin/ai/query', requireAuth, requireRoles('super_admin'), aiRateLimiter, handleAiQuery)

app.post('/api/teacher/marks', requireAuth, requireRoles('teacher'), async (request: AuthRequest, response, next) => {
  const client = await pool.connect()
  try {
    const input = marksSchema.parse(request.body)
    const invalidMark = input.marks.find((mark) => mark.marksObtained > mark.maxMarks)
    if (invalidMark) {
      return response.status(400).json({ error: 'marksObtained cannot exceed maxMarks', field: 'marksObtained' })
    }
    if (!await teacherHasAssignment(request.user!.id, input.classId, input.subjectId, input.semesterId)) {
      return response.status(403).json({ error: "You don't have access to this class's data." })
    }
    await client.query('BEGIN')
    for (const mark of input.marks) {
      await client.query(
        `INSERT INTO marks (student_id, subject_id, semester_id, teacher_id, exam_type, marks_obtained, max_marks, updated_at)
         SELECT $1, $2, $3, $4, $5, $6, $7, now()
          WHERE EXISTS (SELECT 1 FROM students WHERE id = $1 AND class_id = $8)
         ON CONFLICT (student_id, subject_id, semester_id, exam_type)
         DO UPDATE SET marks_obtained = EXCLUDED.marks_obtained, max_marks = EXCLUDED.max_marks,
                       teacher_id = EXCLUDED.teacher_id, updated_at = now()`,
        [mark.studentId, input.subjectId, input.semesterId, request.user!.id, input.examType, mark.marksObtained, mark.maxMarks, input.classId],
      )
    }
    await client.query('COMMIT')
    return response.status(201).json({ saved: input.marks.length })
  } catch (error) {
    await client.query('ROLLBACK')
    next(error)
  } finally {
    client.release()
  }
})

app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
  if (error instanceof z.ZodError) return response.status(400).json({ error: 'Invalid request', details: error.flatten() })
  if (error instanceof DocumentValidationError) return response.status(error.status).json({ error: error.message, ...error.details })
  if (typeof error === 'object' && error !== null && 'status' in error && [400, 401, 403, 404, 413, 429, 503].includes(Number((error as { status?: unknown }).status))) {
    const parseError = error as { status: number; message?: string }
    return response.status(parseError.status).json({ error: parseError.message ?? 'Invalid request' })
  }
  console.error(error)
  return response.status(500).json({ error: 'Internal server error' })
})

app.listen(port, () => console.log(`Student Profile SaaS API listening on http://localhost:${port}`))
