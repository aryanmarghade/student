import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { memDb, UserRecord } from './db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'vision-academy-secret-key-prod-2026';

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: 'admin' | 'teacher' | 'student';
  full_name: string;
  student_id?: string; // If role === 'student'
  class_id?: string;    // If role === 'student'
}

export interface AuthRequest extends Request {
  user?: AuthenticatedUser;
}

// Token generation
export function generateToken(user: UserRecord): string {
  const payload: AuthenticatedUser = {
    id: user.id,
    email: user.email,
    role: user.role,
    full_name: user.full_name,
  };

  if (user.role === 'student') {
    const student = memDb.students.find(s => s.user_id === user.id);
    if (student) {
      payload.student_id = student.id;
      payload.class_id = student.class_id;
    }
  }

  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

// Password utilities
export async function hashPassword(plainText: string): Promise<string> {
  return bcrypt.hash(plainText, 10);
}

export async function comparePassword(plainText: string, hash: string): Promise<boolean> {
  if (!plainText || !hash) return false;
  if (hash === plainText) return true;
  try {
    return await bcrypt.compare(plainText, hash);
  } catch (err) {
    return false;
  }
}

// Authentication Middleware
export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required. Missing or malformed token.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthenticatedUser;
    
    // Verify user is still active in database
    const user = memDb.users.find(u => u.id === decoded.id);
    if (!user) {
      return res.status(401).json({ error: 'User account not found.' });
    }
    if (!user.is_active) {
      return res.status(403).json({ error: 'Account has been deactivated by administrator.' });
    }

    // Always ensure latest student ID if student
    if (user.role === 'student') {
      const student = memDb.students.find(s => s.user_id === user.id);
      if (student) {
        decoded.student_id = student.id;
        decoded.class_id = student.class_id;
      }
    }

    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired authentication token.' });
  }
}

// Role Authorization Middleware
export function requireRole(...roles: Array<'admin' | 'teacher' | 'student'>) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Access forbidden: ${req.user.role.toUpperCase()} role is not authorized for this resource.`
      });
    }
    next();
  };
}

// Teacher Assignment Verification
// "Every teacher-scoped API request must verify the requested class/subject/semester exists in that teacher's
// teacher_class_assignments rows before returning any data — return a clear 403 if not, never an empty 200."
export function verifyTeacherClassScope(classId: string, subjectId?: string, semesterId?: string, teacherUserId?: string): boolean {
  if (!teacherUserId) return false;
  return memDb.teacher_class_assignments.some(tca => {
    if (tca.teacher_user_id !== teacherUserId) return false;
    if (tca.class_id !== classId) return false;
    if (subjectId && tca.subject_id !== subjectId) return false;
    if (semesterId && tca.semester_id !== semesterId) return false;
    return true;
  });
}

// Rate Limiter for Login and AI Requests
interface RateBucket {
  count: number;
  resetAt: number;
}
const rateBuckets = new Map<string, RateBucket>();

export function rateLimit(limit: number, windowMs: number, keyPrefix: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const key = `${keyPrefix}:${ip}`;
    const now = Date.now();
    let bucket = rateBuckets.get(key);

    if (!bucket || now > bucket.resetAt) {
      bucket = { count: 1, resetAt: now + windowMs };
      rateBuckets.set(key, bucket);
    } else {
      bucket.count++;
    }

    if (bucket.count > limit) {
      const waitSec = Math.ceil((bucket.resetAt - now) / 1000);
      return res.status(429).json({
        error: `Too many requests. Rate limit exceeded. Please wait ${waitSec} seconds before retrying.`
      });
    }

    next();
  };
}
