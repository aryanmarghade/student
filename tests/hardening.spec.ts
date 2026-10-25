import { test, expect } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const BASE_URL = 'http://127.0.0.1:3000';

test.describe('Phase 3: Server Hardening Suite', () => {
  test('Responses contain Helmet security headers and strict Content-Security-Policy', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/health`);
    expect(res.status()).toBe(200);

    const headers = res.headers();

    // 1. Check for nosniff header
    expect(headers['x-content-type-options']).toBe('nosniff');

    // 2. Check for X-Frame-Options or frame-ancestors
    expect(headers['x-frame-options']).toMatch(/DENY|SAMEORIGIN/i);

    // 3. Check for Content-Security-Policy
    const csp = headers['content-security-policy'] || headers['content-security-policy-report-only'];
    expect(csp).toBeDefined();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
  });

  test('CORS blocks unauthorized cross-origin requests by default when no origin is allowlisted', async ({ request }) => {
    const res = await request.fetch(`${BASE_URL}/api/health`, {
      headers: {
        Origin: 'https://malicious-attacker.com',
      },
    });

    // In a strict same-origin CORS setup, an unauthorized origin does not receive Access-Control-Allow-Origin: https://malicious-attacker.com
    const acao = res.headers()['access-control-allow-origin'];
    expect(acao).not.toBe('https://malicious-attacker.com');
  });

  test('Central error handler suppresses internal stack traces and database errors in responses', async ({ request }) => {
    // Calling an endpoint with intentionally invalid parameter to trigger an error
    const res = await request.get(`${BASE_URL}/api/teacher/classes/invalid_id/students`, {
      headers: { Authorization: 'Bearer invalid_or_bad_token' },
    });

    // Must return structured clean JSON, never raw HTML stack trace
    expect(res.status()).toBe(401);
    const json = await res.json();
    expect(json.error).toBeDefined();
    expect(json.stack).toBeUndefined();
    expect(JSON.stringify(json)).not.toMatch(/SELECT|INSERT|UPDATE|WHERE|node_modules/i);
  });
});
