# Vission Academy — Production Deployment & Operational Runbook

This guide covers the production deployment requirements, environment configurations, security controls, backup procedures, database password rotation, and migration workflows for Vission Academy.

---

## 1. Required Environment Variables

All configuration is supplied via environment variables or a secured `.env` file with restrictive filesystem permissions (`chmod 600 .env`).

| Variable Name | Required | Default / Format | Description |
|---|---|---|---|
| `NODE_ENV` | **Yes** | `production` | Enforces production mode: strict Content Security Policy (no `'unsafe-eval'`, no `'unsafe-inline'`), serves static bundles, disables rate-limit bypass headers, and enforces `Secure` cookies. |
| `PORT` | Optional | `3000` | Local port the Express server binds to. |
| `JWT_SECRET` | **Yes** | 64+ char random string | Secret key for signing 15-minute access JWTs. Generate via `openssl rand -base64 32`. Never commit to version control. |
| `DATABASE_URL` | **Yes** | `postgresql://user:pass@host:5432/dbname?sslmode=require` | Connection string to PostgreSQL 15+. In production, `sslmode=require` or `sslmode=verify-full` is mandatory. |
| `ALLOWED_ORIGINS` | **Yes** | `https://vissionacademy.edu,https://portal.vissionacademy.edu` | Comma-delimited list of trusted client origins for CORS. Any origin not explicitly listed is rejected with `403/CORS error`. |
| `TRUST_PROXY` | **Yes** | `1` (or `true`) | Controls Express reverse-proxy IP trust. Set to `1` when behind a single reverse proxy (e.g., NGINX, AWS ALB, Cloudflare). Ensures rate-limiting and audit logs use the true client IP (`X-Forwarded-For`). |
| `REFRESH_TOKEN_IDLE_TIMEOUT_SEC` | Optional | `7200` (2 hours) | Idle timeout before a refresh token expires due to inactivity. |
| `REFRESH_TOKEN_ABSOLUTE_TIMEOUT_SEC` | Optional | `43200` (12 hours) | Hard maximum lifetime of a login session from initial authentication. |

### Generating Secrets
```bash
# Generate high-entropy JWT secret
openssl rand -base64 48
```

---

## 2. HTTPS & Network Architecture

### Reverse Proxy Configuration (NGINX Example)
Vission Academy Node.js processes must run behind a TLS-terminating reverse proxy (NGINX, Caddy, or Cloud Load Balancer). The Node.js application should not bind directly to public interfaces.

```nginx
# /etc/nginx/sites-available/vissionacademy
server {
    listen 80;
    server_name portal.vissionacademy.edu;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name portal.vissionacademy.edu;

    ssl_certificate /etc/letsencrypt/live/portal.vissionacademy.edu/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/portal.vissionacademy.edu/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Maximum upload size matching server limit (50MB)
    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Security Headers & Cookie Flags
- **Content-Security-Policy**: Enforced via Helmet. In production (`NODE_ENV=production`), `script-src: ['self']` strictly forbids inline scripts and eval.
- **Refresh Token Cookie**: Emitted with `HttpOnly; SameSite=Strict; Path=/api/auth` and `Secure` (when `NODE_ENV=production`).
- **CSRF Protection**: Protected by `SameSite=Strict` cookie policy, custom header validation (`X-Auth-Refresh: 1`), and strict CORS origin checks.

---

## 3. Database Password Rotation Procedure

To rotate the PostgreSQL user password with zero or minimal downtime:

### Step 1: Create a Secondary Database User (Zero-Downtime Method)
```sql
-- Connect to primary DB as superuser
CREATE USER vission_app_b WITH PASSWORD 'NEW_STRONG_PASSWORD_HERE';
GRANT vission_app_role TO vission_app_b;
-- Ensure permissions on all tables and sequences
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO vission_app_b;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO vission_app_b;
```

### Step 2: Update Application Configuration
1. Update `DATABASE_URL` in production secrets manager (or `.env` file) to use `vission_app_b`.
2. Perform a graceful zero-downtime rolling restart of the application instances:
   ```bash
   pm2 reload vission-academy --update-env
   # or systemctl reload vission-academy
   ```
3. Monitor logs to verify database connectivity:
   ```bash
   tail -f logs/app.log | grep -E "PostgreSQL connected|Database schema verified"
   ```

### Step 3: Decommission Old Credentials
After all instances have reconnected successfully:
```sql
REVOKE CONNECT ON DATABASE vission_academy FROM vission_app_a;
DROP USER vission_app_a;
```

---

## 4. Database Backup & Restore Procedure

All database backups MUST be stored outside the application Git repository in an encrypted, access-controlled backup directory or S3 bucket.

### Backup Procedure
Run the automated backup script or invoke `pg_dump`:

```bash
# 1. Define backup location (outside repository)
BACKUP_DIR="/var/backups/vission-academy"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/vission_academy_backup_${TIMESTAMP}.dump"

mkdir -p "${BACKUP_DIR}"

# 2. Execute binary custom-format dump
pg_dump --format=custom \
        --compress=9 \
        --no-owner \
        --no-privileges \
        --dbname="${DATABASE_URL}" \
        --file="${BACKUP_FILE}"

# 3. Restrict permissions
chmod 600 "${BACKUP_FILE}"

# 4. Verify dump integrity
pg_restore --list "${BACKUP_FILE}" > /dev/null
echo "Backup successfully verified: ${BACKUP_FILE}"
```

### Automated Retention Cron
Add a daily cron job to retain 14 days of local backups and sync older backups to encrypted object storage:
```bash
0 2 * * * /usr/local/bin/backup-vission-db.sh >> /var/log/vission-backup.log 2>&1
```

### Restore Procedure
To restore the database from a backup file:

```bash
# 1. Terminate active application connections (or stop service)
pm2 stop vission-academy

# 2. Restore into target database
pg_restore --clean \
           --if-exists \
           --no-owner \
           --dbname="${DATABASE_URL}" \
           "${BACKUP_FILE}"

# 3. Run migration verification
npm run verify-schema

# 4. Restart application
pm2 start vission-academy
```

---

## 5. How to Run Database Migrations

Database migrations in Vission Academy are tracked in `db/schema.sql` and versioned migration scripts in `scripts/`.

### 1. Fresh Database Initialization
To initialize a completely empty database:
```bash
psql "${DATABASE_URL}" -f db/schema.sql
```

### 2. Running Incremental Migrations
Incremental migration scripts are idempotent and safe to run against production databases:

```bash
# Refresh Token & Family Reuse Tracking Migration
npx tsx scripts/migrate-refresh-tokens.ts

# URL Sanitization & Data Cleaning Migration
npx tsx scripts/clean-urls-migration.ts
```

### 3. Pre-Deployment Validation Checklist
Before releasing code changes to production:
1. `npm audit`: Verify 0 vulnerabilities (`npm audit`).
2. Typecheck & Build: Verify bundle generation (`npm run build`).
3. Run automated test suite (`npx playwright test`).
4. Ensure migration script runs cleanly before switching application traffic.
