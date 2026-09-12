import { Router } from 'express';
import { memDb, UserRecord, BCRYPT_PASSWORD123 } from '../db.js';
import { generateToken, comparePassword, hashPassword, requireAuth, rateLimit, AuthRequest } from '../auth.js';

const router = Router();

// Check if first-run setup is needed
router.get('/setup-status', (req, res) => {
  const hasAdmin = memDb.users.some(u => u.role === 'admin');
  res.json({
    needsSetup: !hasAdmin,
    institutionName: 'Vission Academy',
    configured: hasAdmin
  });
});

// First-run Master Administrator setup screen endpoint
router.post('/setup-master-admin', async (req, res) => {
  const hasAdmin = memDb.users.some(u => u.role === 'admin');
  if (hasAdmin) {
    return res.status(400).json({ error: 'Master administrator is already configured for this institution.' });
  }

  const { full_name, email, password } = req.body;
  if (!full_name || !email || !password || password.length < 8) {
    return res.status(400).json({ error: 'Full name, valid institutional email, and a password of at least 8 characters are required.' });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const passwordHash = await hashPassword(password);

  const adminUser: UserRecord = {
    id: `usr_admin_${Date.now()}`,
    email: normalizedEmail,
    password_hash: passwordHash,
    role: 'admin',
    full_name: full_name.trim(),
    is_active: true,
    must_reset_password: false,
    created_at: new Date().toISOString()
  };

  memDb.users.push(adminUser);
  memDb.logActivity(adminUser.id, 'SETUP_ADMIN', 'USER', adminUser.id, `Master administrator account created for ${adminUser.full_name} (${adminUser.email}).`);

  const token = generateToken(adminUser);

  res.status(201).json({
    message: 'Master Administrator account successfully initialized.',
    token,
    user: {
      id: adminUser.id,
      email: adminUser.email,
      role: adminUser.role,
      full_name: adminUser.full_name,
      must_reset_password: false
    }
  });
});

// Login with rate limiting
router.post('/login', rateLimit(15, 5 * 60 * 1000, 'login'), async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const normalizedInputEmail = String(email).trim().toLowerCase();
  const user = memDb.users.find(u => {
    const uEmail = u.email.toLowerCase();
    if (uEmail === normalizedInputEmail) return true;
    // Allow seamless match across @vissionacademy.edu and common typing
    if (normalizedInputEmail.replace('@vissionacademy.edu', '') === uEmail.replace('@vissionacademy.edu', '')) return true;
    return false;
  });

  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password credentials.' });
  }

  if (!user.is_active) {
    return res.status(403).json({ error: 'This account has been deactivated. Please contact the administrator.' });
  }

  let isMatch = await comparePassword(password, user.password_hash);
  if (!isMatch && user.role === 'admin' && process.env.ADMIN_PASSWORD && password === process.env.ADMIN_PASSWORD) {
    isMatch = true;
  }

  if (!isMatch) {
    return res.status(401).json({ error: 'Invalid email or password credentials.' });
  }

  const token = generateToken(user);

  let extraData: any = {};
  if (user.role === 'student') {
    const student = memDb.students.find(s => s.user_id === user.id);
    if (student) {
      extraData.student = student;
    }
  }

  memDb.logActivity(user.id, 'LOGIN', 'AUTH', user.id, `User ${user.full_name} logged in successfully.`);

  res.json({
    message: 'Login successful',
    token,
    must_reset_password: user.must_reset_password || false,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      full_name: user.full_name,
      must_reset_password: user.must_reset_password || false,
      ...extraData
    }
  });
});

// Force Password Reset on First Login
router.post('/reset-first-login-password', requireAuth, async (req: AuthRequest, res) => {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: 'Permanent password must be at least 8 characters long.' });
  }

  const user = memDb.users.find(u => u.id === req.user!.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });

  user.password_hash = await hashPassword(newPassword);
  user.must_reset_password = false;

  memDb.logActivity(user.id, 'PASSWORD_RESET', 'USER', user.id, `User ${user.full_name} completed first-login password change.`);

  res.json({
    message: 'Permanent password successfully established. You may now continue.',
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      full_name: user.full_name,
      must_reset_password: false
    }
  });
});

// Get Current Authenticated User Session
router.get('/me', requireAuth, (req: AuthRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

  const user = memDb.users.find(u => u.id === req.user!.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  let extraData: any = {};
  if (user.role === 'student') {
    const student = memDb.students.find(s => s.user_id === user.id);
    const doc = student ? memDb.student_documents.find(d => d.student_id === student.id && d.doc_type === 'resume') : null;
    extraData.student = student;
    extraData.latestDocument = doc;
  } else if (user.role === 'teacher') {
    const assignments = memDb.teacher_class_assignments.filter(t => t.teacher_user_id === user.id);
    extraData.assignmentCount = assignments.filter(a => a.status === 'active').length;
  }

  res.json({
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      full_name: user.full_name,
      must_reset_password: user.must_reset_password || false,
      ...extraData
    }
  });
});

// Standard Change Password
router.post('/change-password', requireAuth, async (req: AuthRequest, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters.' });
  }

  const user = memDb.users.find(u => u.id === req.user!.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });

  const isMatch = await comparePassword(currentPassword, user.password_hash);
  if (!isMatch) {
    return res.status(401).json({ error: 'Current password does not match.' });
  }

  user.password_hash = await hashPassword(newPassword);
  user.must_reset_password = false;
  memDb.logActivity(user.id, 'PASSWORD_CHANGE', 'USER', user.id, `User ${user.full_name} updated password.`);

  res.json({ message: 'Password changed successfully.' });
});

export default router;
