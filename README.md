# Student Profile SaaS

Multi-tenant college profile and academic records platform for students, teachers, and college administrators.

## Development

Install dependencies:

```bash
npm install
```

Start your native PostgreSQL Windows service, then initialize the schema and demo data:

```powershell
npm run db:init
```

The script looks for `psql.exe` on PATH or in `C:\Program Files\PostgreSQL\<version>\bin`. Set `PG_BIN` if PostgreSQL is installed elsewhere. Configure `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, and `PGDATABASE` to match your local server.

Copy `.env.example` to `.env`, then start the API and web app in separate terminals:

```bash
npm run dev:api
npm run dev
```

Optional document storage configuration is required for real photo/resume uploads:

- `STORAGE_BUCKET`, `STORAGE_REGION`, `STORAGE_ACCESS_KEY_ID`, and `STORAGE_SECRET_ACCESS_KEY` for S3/R2-compatible storage.
- `STORAGE_ENDPOINT` and `STORAGE_FORCE_PATH_STYLE=true` for providers such as MinIO.
- `GEMINI_API_KEY` enables the server-side Gemini function-calling assistant; `REDIS_URL` is reserved for distributed background jobs.

For local MinIO storage, start Docker Desktop and run:

```powershell
docker compose up -d minio minio-init
```

The Compose stack exposes MinIO at `http://localhost:9000` and its console at `http://localhost:9001`. The local defaults are `student-local` / `student-local-secret`; set `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, and `MINIO_SECRET_KEY` in `.env`. The API accepts these aliases and uses path-style S3 requests for MinIO.

The API runs at `http://localhost:4000` and the web app at `http://localhost:5173`.

Demo accounts are seeded by `database/seed.sql` with password `ChangeMe123!`:

- `admin@northstar.edu`
- `teacher@northstar.edu`
- `student@northstar.edu`

The database seed is for local development only. Change all credentials before deployment.

## Validation

```bash
npm run build:api
npm run build
npm run lint
npm run test:regression
```

`npm run test:regression` runs the transparent analytics regression unit tests.

## Architecture

- React + Vite + TypeScript frontend
- Express + JWT API
- Native PostgreSQL schema with college tenant ownership
- S3-compatible presigned document uploads
- Server-side teacher assignment scoping for marks, students, analytics, and AI tools
- Gemini function-calling AI tools with server-side scope checks and audit logging
