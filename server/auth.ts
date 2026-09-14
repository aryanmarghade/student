import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { query, UserRecord } from './db.js';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error('JWT_SECRET is required; refusing to use an in-memory fallback secret.');

export interface AuthenticatedUser { id: string; email: string; role: 'admin' | 'teacher' | 'student'; full_name: string; student_id?: string; class_id?: string; }
export interface AuthRequest extends Request { user?: AuthenticatedUser; }

export function generateToken(user: UserRecord, student?: { id: string; class_id: string | null }): string {
  return jwt.sign({ id: user.id, email: user.email, role: user.role, full_name: user.full_name, student_id: student?.id, class_id: student?.class_id || undefined }, JWT_SECRET, { expiresIn: '7d' });
}
export async function hashPassword(value: string) { return bcrypt.hash(value, 10); }
export async function comparePassword(value: string, hash: string) { return Boolean(value && hash) && bcrypt.compare(value, hash); }

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Authentication required. Missing or malformed token.' });
  try {
    const decoded = jwt.verify(header.slice(7), JWT_SECRET) as AuthenticatedUser;
    const result = await query<UserRecord>('SELECT id,email,role,full_name,is_active,must_reset_password,created_at,password_hash FROM users WHERE id=$1', [decoded.id]);
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: 'User account not found.' });
    if (!user.is_active) return res.status(403).json({ error: 'Account has been deactivated by administrator.' });
    if (user.role === 'student') {
      const student = (await query<{id:string;class_id:string|null}>('SELECT id,class_id FROM students WHERE user_id=$1', [user.id])).rows[0];
      decoded.student_id = student?.id;
      decoded.class_id = student?.class_id || undefined;
    }
    req.user = decoded;
    next();
  } catch { return res.status(401).json({ error: 'Invalid or expired authentication token.' }); }
}

export function requireRole(...roles: Array<'admin'|'teacher'|'student'>) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required.' });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: `Access forbidden: ${req.user.role.toUpperCase()} role is not authorized for this resource.` });
    next();
  };
}

export async function verifyTeacherClassScope(classId: string, subjectId: string | undefined, semesterId: string | undefined, teacherUserId: string) {
  const conditions = ['teacher_user_id=$1', 'class_id=$2'];
  const params: any[] = [teacherUserId, classId];
  if (subjectId) { conditions.push(`subject_id=$${params.length + 1}`); params.push(subjectId); }
  if (semesterId) { conditions.push(`semester_id=$${params.length + 1}`); params.push(semesterId); }
  const result = await query(`SELECT 1 FROM teacher_class_assignments WHERE ${conditions.join(' AND ')} AND status IN ('active','past') LIMIT 1`, params);
  return result.rowCount === 1;
}

interface RateBucket { count: number; resetAt: number; }
const rateBuckets = new Map<string, RateBucket>();
export function rateLimit(limit: number, windowMs: number, keyPrefix: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${keyPrefix}:${req.ip || req.socket.remoteAddress || 'unknown'}`;
    const now = Date.now(); let bucket = rateBuckets.get(key);
    if (!bucket || now > bucket.resetAt) { bucket = { count: 0, resetAt: now + windowMs }; rateBuckets.set(key, bucket); }
    bucket.count++;
    if (bucket.count > limit) return res.status(429).json({ error: 'Too many requests. Please try again later.' });
    next();
  };
}
