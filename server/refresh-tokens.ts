import crypto from 'crypto';
import { Response } from 'express';
import { query, id, UserRecord } from './db.js';
import { generateToken } from './auth.js';

const REFRESH_COOKIE_NAME = 'va_refresh_token';

// Configurable timeouts (sliding idle: 2h default, absolute maximum: 12h default)
export function getIdleTimeoutSeconds(): number {
  const envVal = process.env.REFRESH_TOKEN_IDLE_TIMEOUT_SEC;
  const parsed = Number(envVal);
  return !isNaN(parsed) && parsed > 0 ? parsed : 2 * 60 * 60; // 2 hours
}

export function getAbsoluteTimeoutSeconds(): number {
  const envVal = process.env.REFRESH_TOKEN_ABSOLUTE_TIMEOUT_SEC;
  const parsed = Number(envVal);
  return !isNaN(parsed) && parsed > 0 ? parsed : 12 * 60 * 60; // 12 hours
}

export function hashRefreshToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

export function setRefreshCookie(res: Response, rawToken: string, expiresAt: Date) {
  res.cookie(REFRESH_COOKIE_NAME, rawToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/api/auth',
    expires: expiresAt,
  });
}

export function clearRefreshCookie(res: Response) {
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/api/auth',
  });
}

export async function issueRefreshToken(userId: string, familyId?: string, familyCreatedAt?: Date) {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashRefreshToken(rawToken);
  const famId = familyId || id('rt_fam');
  const famCreated = familyCreatedAt || new Date();

  const idleSec = getIdleTimeoutSeconds();
  const absSec = getAbsoluteTimeoutSeconds();
  const maxAbsExpiry = new Date(famCreated.getTime() + absSec * 1000);
  const idleExpiry = new Date(Date.now() + idleSec * 1000);

  const expiresAt = new Date(Math.min(idleExpiry.getTime(), maxAbsExpiry.getTime()));

  const tokenId = id('rt');
  await query(
    `INSERT INTO refresh_tokens (id, user_id, token_hash, family_id, is_revoked, expires_at, family_created_at)
     VALUES ($1, $2, $3, $4, FALSE, $5, $6)`,
    [tokenId, userId, tokenHash, famId, expiresAt, famCreated]
  );

  return { rawToken, expiresAt, familyId: famId, familyCreatedAt: famCreated };
}

export async function rotateRefreshToken(rawToken: string) {
  if (!rawToken || typeof rawToken !== 'string') {
    const err: any = new Error('Refresh token is required.');
    err.status = 401;
    throw err;
  }

  const tokenHash = hashRefreshToken(rawToken);
  const result = await query(
    `SELECT id, user_id, token_hash, family_id, is_revoked, expires_at, family_created_at
     FROM refresh_tokens
     WHERE token_hash = $1`,
    [tokenHash]
  );

  const tokenRecord = result.rows[0];
  if (!tokenRecord) {
    const err: any = new Error('Invalid or expired refresh token.');
    err.status = 401;
    throw err;
  }

  // REUSE DETECTION: If an already-revoked refresh token is replayed, revoke entire family!
  if (tokenRecord.is_revoked) {
    await query(
      `UPDATE refresh_tokens SET is_revoked = TRUE WHERE family_id = $1`,
      [tokenRecord.family_id]
    );
    const err: any = new Error('Security Alert: Refresh token reuse detected. All active sessions have been revoked.');
    err.status = 401;
    err.code = 'REFRESH_TOKEN_REUSE';
    throw err;
  }

  // Check if token has expired
  if (new Date(tokenRecord.expires_at).getTime() < Date.now()) {
    await query(`UPDATE refresh_tokens SET is_revoked = TRUE WHERE id = $1`, [tokenRecord.id]);
    const err: any = new Error('Refresh session has expired. Please sign in again.');
    err.status = 401;
    throw err;
  }

  // Check absolute timeout
  const famCreated = new Date(tokenRecord.family_created_at || tokenRecord.created_at);
  const maxAbsExpiry = new Date(famCreated.getTime() + getAbsoluteTimeoutSeconds() * 1000);
  if (Date.now() >= maxAbsExpiry.getTime()) {
    await query(`UPDATE refresh_tokens SET is_revoked = TRUE WHERE family_id = $1`, [tokenRecord.family_id]);
    const err: any = new Error('Maximum session duration reached (12 hours). Please sign in again.');
    err.status = 401;
    throw err;
  }

  // Fetch active user
  const userRes = await query<UserRecord>(
    `SELECT id, email, password_hash, role, full_name, is_active, must_reset_password, created_at
     FROM users WHERE id = $1`,
    [tokenRecord.user_id]
  );
  const user = userRes.rows[0];
  if (!user || !user.is_active) {
    await query(`UPDATE refresh_tokens SET is_revoked = TRUE WHERE family_id = $1`, [tokenRecord.family_id]);
    const err: any = new Error('Account inactive or not found.');
    err.status = 401;
    throw err;
  }

  if (user.must_reset_password) {
    const err: any = new Error('Password reset required before session can be refreshed.');
    err.status = 403;
    throw err;
  }

  // Revoke the old token
  await query(`UPDATE refresh_tokens SET is_revoked = TRUE WHERE id = $1`, [tokenRecord.id]);

  // Issue rotated token within the same family
  const nextToken = await issueRefreshToken(user.id, tokenRecord.family_id, famCreated);

  // Issue student context if applicable
  const student = user.role === 'student'
    ? (await query<{ id: string; class_id: string | null }>('SELECT id, class_id FROM students WHERE user_id=$1', [user.id])).rows[0]
    : undefined;

  const accessToken = generateToken(user, student);

  return {
    rawToken: nextToken.rawToken,
    expiresAt: nextToken.expiresAt,
    accessToken,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      full_name: user.full_name,
      must_reset_password: user.must_reset_password,
      ...(student ? { student } : {}),
    },
  };
}

export async function revokeRefreshToken(rawToken: string) {
  if (!rawToken) return;
  const tokenHash = hashRefreshToken(rawToken);
  await query(`UPDATE refresh_tokens SET is_revoked = TRUE WHERE token_hash = $1`, [tokenHash]);
}

export async function revokeAllUserRefreshTokens(userId: string) {
  if (!userId) return;
  await query(`UPDATE refresh_tokens SET is_revoked = TRUE WHERE user_id = $1`, [userId]);
}
