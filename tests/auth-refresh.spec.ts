import { test, expect } from '@playwright/test';
import bcrypt from 'bcryptjs';
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const BASE_URL = 'http://127.0.0.1:3000';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

test.describe('Session Refresh Architecture & Family Reuse Detection', () => {
  const testUserId = `usr_refresh_test_${Date.now()}`;
  const testEmail = `refresh.tester.${Date.now()}@vissionacademy.edu`;
  const testPassword = 'RefreshPassword123!';

  const loginUser = async (request: any) => {
    return request.post(`${BASE_URL}/api/auth/login`, {
      data: { email: testEmail, password: testPassword },
      headers: { 'x-bypass-ratelimit': 'qa-stress-suite' },
    });
  };

  test.beforeAll(async () => {
    const passwordHash = await bcrypt.hash(testPassword, 10);
    await pool.query(
      `INSERT INTO users (id, email, password_hash, role, full_name, is_active, must_reset_password)
       VALUES ($1, $2, $3, 'teacher', 'Refresh Test Teacher', true, false)`,
      [testUserId, testEmail, passwordHash]
    );
  });

  test.afterAll(async () => {
    try {
      await pool.query(`DELETE FROM users WHERE id = $1`, [testUserId]);
    } catch {}
    await pool.end();
  });

  test('POST /api/auth/login sets HttpOnly, SameSite=Strict cookie and returns 15m access token', async ({ request }) => {
    const loginRes = await loginUser(request);

    expect(loginRes.status()).toBe(200);
    const body = await loginRes.json();
    expect(body.token).toBeDefined();

    // Verify token expiry is 15 minutes (900s)
    const tokenParts = body.token.split('.');
    expect(tokenParts.length).toBe(3);
    const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString('utf8'));
    const tokenLifetimeSeconds = payload.exp - payload.iat;
    expect(tokenLifetimeSeconds).toBe(15 * 60);

    // Verify Set-Cookie header contains HttpOnly, Path=/api/auth, SameSite=Strict
    const setCookieHeaders = loginRes.headersArray().filter(h => h.name.toLowerCase() === 'set-cookie');
    const refreshCookieHeader = setCookieHeaders.find(h => h.value.includes('va_refresh_token='));
    expect(refreshCookieHeader).toBeDefined();
    expect(refreshCookieHeader!.value.toLowerCase()).toContain('httponly');
    expect(refreshCookieHeader!.value.toLowerCase()).toContain('path=/api/auth');
    expect(refreshCookieHeader!.value.toLowerCase()).toContain('samesite=strict');
  });

  test('POST /api/auth/refresh rotates refresh cookie and returns new 15m access token', async ({ request }) => {
    // 1. Login
    const loginRes = await loginUser(request);
    expect(loginRes.status()).toBe(200);
    const setCookie = loginRes.headersArray().find(h => h.name.toLowerCase() === 'set-cookie')?.value || '';
    const cookieMatch = setCookie.match(/va_refresh_token=([^;]+)/);
    expect(cookieMatch).toBeTruthy();
    const originalRefreshToken = cookieMatch![1];

    // 2. Call refresh with X-Auth-Refresh header
    const refreshRes = await request.post(`${BASE_URL}/api/auth/refresh`, {
      headers: {
        Cookie: `va_refresh_token=${originalRefreshToken}`,
        'X-Auth-Refresh': '1',
        'x-bypass-ratelimit': 'qa-stress-suite',
      },
    });

    expect(refreshRes.status()).toBe(200);
    const refreshBody = await refreshRes.json();
    expect(refreshBody.token).toBeDefined();

    // Verify new refresh cookie is issued (rotation)
    const newSetCookie = refreshRes.headersArray().find(h => h.name.toLowerCase() === 'set-cookie')?.value || '';
    const newCookieMatch = newSetCookie.match(/va_refresh_token=([^;]+)/);
    expect(newCookieMatch).toBeTruthy();
    const rotatedRefreshToken = newCookieMatch![1];
    expect(rotatedRefreshToken).not.toBe(originalRefreshToken);
  });

  test('Refresh Token Family Reuse Detection: Replaying old refresh token revokes entire family', async ({ request }) => {
    // 1. Login
    const loginRes = await loginUser(request);
    const setCookie = loginRes.headersArray().find(h => h.name.toLowerCase() === 'set-cookie')?.value || '';
    const token1 = setCookie.match(/va_refresh_token=([^;]+)/)![1];

    // 2. Valid refresh using token1 -> issues token2
    const refreshRes1 = await request.post(`${BASE_URL}/api/auth/refresh`, {
      headers: {
        Cookie: `va_refresh_token=${token1}`,
        'X-Auth-Refresh': '1',
        'x-bypass-ratelimit': 'qa-stress-suite',
      },
    });
    expect(refreshRes1.status()).toBe(200);
    const token2 = refreshRes1.headersArray().find(h => h.name.toLowerCase() === 'set-cookie')!.value.match(/va_refresh_token=([^;]+)/)![1];

    // 3. Attacker replays token1 (already used/revoked) -> Family reuse detection MUST fire
    const replayRes = await request.post(`${BASE_URL}/api/auth/refresh`, {
      headers: {
        Cookie: `va_refresh_token=${token1}`,
        'X-Auth-Refresh': '1',
        'x-bypass-ratelimit': 'qa-stress-suite',
      },
    });
    expect(replayRes.status()).toBe(401);
    const replayBody = await replayRes.json();
    expect(replayBody.error).toMatch(/reuse|revoked|invalid/i);

    // 4. Now token2 (which was legitimately issued) MUST also be revoked due to family invalidation
    const token2Res = await request.post(`${BASE_URL}/api/auth/refresh`, {
      headers: {
        Cookie: `va_refresh_token=${token2}`,
        'X-Auth-Refresh': '1',
        'x-bypass-ratelimit': 'qa-stress-suite',
      },
    });
    expect(token2Res.status()).toBe(401);
  });

  test('POST /api/auth/refresh rejects requests missing X-Auth-Refresh header (CSRF defense)', async ({ request }) => {
    const loginRes = await loginUser(request);
    const token = loginRes.headersArray().find(h => h.name.toLowerCase() === 'set-cookie')!.value.match(/va_refresh_token=([^;]+)/)![1];

    const resNoHeader = await request.post(`${BASE_URL}/api/auth/refresh`, {
      headers: {
        Cookie: `va_refresh_token=${token}`,
        'x-bypass-ratelimit': 'qa-stress-suite',
      },
    });
    expect(resNoHeader.status()).toBe(400);
    const json = await resNoHeader.json();
    expect(json.error).toMatch(/header|csrf|forbidden/i);
  });

  test('POST /api/auth/logout clears cookie and revokes refresh token', async ({ request }) => {
    const loginRes = await loginUser(request);
    const token = loginRes.headersArray().find(h => h.name.toLowerCase() === 'set-cookie')!.value.match(/va_refresh_token=([^;]+)/)![1];

    // Logout
    const logoutRes = await request.post(`${BASE_URL}/api/auth/logout`, {
      headers: {
        Cookie: `va_refresh_token=${token}`,
        'X-Auth-Refresh': '1',
        'x-bypass-ratelimit': 'qa-stress-suite',
      },
    });
    expect(logoutRes.status()).toBe(200);

    // Cookie cleared
    const setCookie = logoutRes.headersArray().find(h => h.name.toLowerCase() === 'set-cookie')?.value || '';
    expect(setCookie.toLowerCase()).toMatch(/max-age=0|expires=/);

    // Attempting refresh with logged-out token fails
    const refreshAfterLogout = await request.post(`${BASE_URL}/api/auth/refresh`, {
      headers: {
        Cookie: `va_refresh_token=${token}`,
        'X-Auth-Refresh': '1',
        'x-bypass-ratelimit': 'qa-stress-suite',
      },
    });
    expect(refreshAfterLogout.status()).toBe(401);
  });

  test('POST /api/auth/logout-all terminates all sessions for the user', async ({ request }) => {
    // Session 1
    const login1 = await loginUser(request);
    const token1 = login1.headersArray().find(h => h.name.toLowerCase() === 'set-cookie')!.value.match(/va_refresh_token=([^;]+)/)![1];
    const { token: access1 } = await login1.json();

    // Session 2
    const login2 = await loginUser(request);
    const token2 = login2.headersArray().find(h => h.name.toLowerCase() === 'set-cookie')!.value.match(/va_refresh_token=([^;]+)/)![1];

    // Call logout-all using session 1's access token
    const logoutAllRes = await request.post(`${BASE_URL}/api/auth/logout-all`, {
      headers: {
        Authorization: `Bearer ${access1}`,
        'x-bypass-ratelimit': 'qa-stress-suite',
      },
    });
    expect(logoutAllRes.status()).toBe(200);

    // Both session 1 and session 2 refresh attempts must now fail
    const refresh1 = await request.post(`${BASE_URL}/api/auth/refresh`, {
      headers: { Cookie: `va_refresh_token=${token1}`, 'X-Auth-Refresh': '1', 'x-bypass-ratelimit': 'qa-stress-suite' },
    });
    expect(refresh1.status()).toBe(401);

    const refresh2 = await request.post(`${BASE_URL}/api/auth/refresh`, {
      headers: { Cookie: `va_refresh_token=${token2}`, 'X-Auth-Refresh': '1', 'x-bypass-ratelimit': 'qa-stress-suite' },
    });
    expect(refresh2.status()).toBe(401);
  });

  test('POST /api/auth/refresh is blocked when must_reset_password is true', async ({ request }) => {
    // Set must_reset_password = TRUE
    await pool.query('UPDATE users SET must_reset_password = TRUE WHERE id = $1', [testUserId]);

    const loginRes = await loginUser(request);
    const token = loginRes.headersArray().find(h => h.name.toLowerCase() === 'set-cookie')!.value.match(/va_refresh_token=([^;]+)/)![1];

    const refreshRes = await request.post(`${BASE_URL}/api/auth/refresh`, {
      headers: { Cookie: `va_refresh_token=${token}`, 'X-Auth-Refresh': '1', 'x-bypass-ratelimit': 'qa-stress-suite' },
    });
    expect(refreshRes.status()).toBe(403);
    const json = await refreshRes.json();
    expect(json.error).toMatch(/password reset required/i);

    // Reset back to FALSE
    await pool.query('UPDATE users SET must_reset_password = FALSE WHERE id = $1', [testUserId]);
  });
});
