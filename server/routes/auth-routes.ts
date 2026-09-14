import { Router } from 'express';
import { query, logActivity, UserRecord } from '../db.js';
import { generateToken, comparePassword, hashPassword, requireAuth, rateLimit, AuthRequest } from '../auth.js';

const router = Router();
const publicUser = (user: UserRecord) => ({ id: user.id, email: user.email, role: user.role, full_name: user.full_name, must_reset_password: user.must_reset_password });

router.get('/setup-status', async (_req, res) => {
  const result = await query<{exists:boolean}>("SELECT EXISTS (SELECT 1 FROM users WHERE role='admin') AS exists");
  res.json({ needsSetup: !result.rows[0].exists, institutionName: 'Vission Academy', configured: result.rows[0].exists });
});

router.post('/setup-master-admin', async (req, res) => {
  const { full_name, email, password } = req.body;
  if (!full_name || !email || !password || password.length < 8) return res.status(400).json({ error: 'Full name, valid institutional email, and a password of at least 8 characters are required.' });
  const exists = await query("SELECT 1 FROM users WHERE role='admin' LIMIT 1");
  if (exists.rowCount) return res.status(400).json({ error: 'Master administrator is already configured for this institution.' });
  const user: UserRecord = { id: `usr_admin_${Date.now()}`, email: String(email).trim().toLowerCase(), password_hash: await hashPassword(password), role: 'admin', full_name: String(full_name).trim(), is_active: true, must_reset_password: false, created_at: new Date().toISOString() };
  await query('INSERT INTO users (id,email,password_hash,role,full_name,is_active,must_reset_password) VALUES ($1,$2,$3,$4,$5,$6,$7)', [user.id,user.email,user.password_hash,user.role,user.full_name,true,false]);
  await logActivity(user.id, 'SETUP_ADMIN', 'USER', user.id, `Master administrator account created for ${user.full_name}.`);
  res.status(201).json({ message: 'Master Administrator account successfully initialized.', token: generateToken(user), user: publicUser(user) });
});

router.post('/login', rateLimit(15, 5 * 60 * 1000, 'login'), async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });
  const result = await query<UserRecord>('SELECT id,email,password_hash,role,full_name,is_active,must_reset_password,created_at FROM users WHERE lower(email)=$1', [email]);
  const user = result.rows[0];
  if (!user || !user.is_active || !(await comparePassword(password, user.password_hash))) return res.status(user && !user.is_active ? 403 : 401).json({ error: user && !user.is_active ? 'This account has been deactivated. Please contact the administrator.' : 'Invalid email or password credentials.' });
  const student = user.role === 'student' ? (await query<{id:string;class_id:string|null}>('SELECT id,class_id FROM students WHERE user_id=$1',[user.id])).rows[0] : undefined;
  await logActivity(user.id, 'LOGIN', 'AUTH', user.id, `User ${user.full_name} logged in successfully.`);
  res.json({ message: 'Login successful', token: generateToken(user, student), must_reset_password: user.must_reset_password, user: { ...publicUser(user), ...(student ? { student } : {}) } });
});

router.post('/reset-first-login-password', requireAuth, async (req: AuthRequest, res) => {
  const password = String(req.body.newPassword || '');
  if (password.length < 8) return res.status(400).json({ error: 'Permanent password must be at least 8 characters long.' });
  const user = (await query<UserRecord>('SELECT id,email,password_hash,role,full_name,is_active,must_reset_password,created_at FROM users WHERE id=$1',[req.user!.id])).rows[0];
  if (!user) return res.status(404).json({ error: 'User not found.' });
  await query('UPDATE users SET password_hash=$1,must_reset_password=FALSE WHERE id=$2',[await hashPassword(password),user.id]);
  await logActivity(user.id,'PASSWORD_RESET','USER',user.id,`User ${user.full_name} completed first-login password change.`);
  res.json({ message: 'Permanent password successfully established. You may now continue.', user: { ...publicUser(user), must_reset_password: false } });
});

router.get('/me', requireAuth, async (req: AuthRequest, res) => {
  const user = (await query<UserRecord>('SELECT id,email,password_hash,role,full_name,is_active,must_reset_password,created_at FROM users WHERE id=$1',[req.user!.id])).rows[0];
  if (!user) return res.status(404).json({ error: 'User not found.' });
  const extra: any = {};
  if (user.role === 'student') extra.student = (await query('SELECT * FROM students WHERE user_id=$1',[user.id])).rows[0];
  if (user.role === 'teacher') extra.assignmentCount = (await query("SELECT count(*)::int AS count FROM teacher_class_assignments WHERE teacher_user_id=$1 AND status='active'",[user.id])).rows[0].count;
  res.json({ user: { ...publicUser(user), ...extra } });
});

router.post('/change-password', requireAuth, async (req: AuthRequest, res) => {
  const currentPassword = String(req.body.currentPassword || ''); const newPassword = String(req.body.newPassword || '');
  if (newPassword.length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters.' });
  const user = (await query<UserRecord>('SELECT * FROM users WHERE id=$1',[req.user!.id])).rows[0];
  if (!user || !(await comparePassword(currentPassword,user.password_hash))) return res.status(401).json({ error: 'Current password does not match.' });
  await query('UPDATE users SET password_hash=$1,must_reset_password=FALSE WHERE id=$2',[await hashPassword(newPassword),user.id]);
  await logActivity(user.id,'PASSWORD_CHANGE','USER',user.id,`User ${user.full_name} updated password.`);
  res.json({ message: 'Password changed successfully.' });
});

export default router;
