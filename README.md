# Forum Registration API

A small production-ready registration API built with Node.js, Express, and Supabase. It accepts public event registrations, exposes an admin-only paginated list, and streams the full dataset as CSV.

## Stack

- Node.js 20+ (ESM, modern JavaScript)
- Express 4
- Supabase (PostgreSQL via `@supabase/supabase-js`, service role key server-side)
- Helmet, CORS allowlist, express-rate-limit
- k6 load test

## Prerequisites

- Node.js 20 or newer
- A Supabase project
- k6 (optional, only for load testing)

## Supabase setup

1. Open your Supabase project, go to **SQL Editor**, and run the contents of `schema.sql`.
   - The table `public.registrations` is created if absent.
   - A unique index on `lower(email)` prevents duplicate emails.
   - Row Level Security is enabled.
2. Go to **Project Settings -> API** and copy:
   - **Project URL** into `SUPABASE_URL`
   - **service_role key** into `SUPABASE_SERVICE_ROLE_KEY`
3. Important:
   - The service role key bypasses RLS. Use it only in this server. Never put it in a frontend, mobile app, or public repository.
   - RLS is enabled and **no public policies are defined intentionally**. Direct anon/authenticated access to `registrations` is denied. All access goes through this backend.

## Local run

```bash
npm install
cp .env.example .env
# edit .env and fill in real values
npm start
```

On PowerShell, copy with:

```powershell
Copy-Item .env.example .env
```

Health check:

```bash
curl http://localhost:3000/api/health
# {"status":"ok"}
```

Development mode with file watching:

```bash
npm run dev
```

The API fails fast at boot if a required environment variable is missing or invalid. The error lists variable names only, never values.

## Environment variables

| Variable | Required | Default | Notes |
|---|---|---|---|
| `SUPABASE_URL` | yes | — | Absolute `https://` project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | — | Minimum 20 characters; server-side only |
| `ADMIN_API_KEY` | yes | — | Minimum 16 characters; sent as `X-Admin-Api-Key` |
| `CORS_ORIGIN` | yes | — | Comma-separated absolute http/https origins, no wildcard, no trailing slash |
| `PORT` | no | `3000` | HTTP port |
| `BODY_LIMIT` | no | `10kb` | Maximum JSON body size |
| `RATE_LIMIT_ENABLED` | no | `true` | Only `true` or `false` |
| `RATE_LIMIT_WINDOW_MS` | no | `60000` | Rate limit window |
| `RATE_LIMIT_MAX` | no | `10` | Requests per window per IP |

## API reference

All error responses use this shape:

```json
{ "error": { "code": "ERROR_CODE", "message": "Human sentence." } }
```

Validation errors may also include `details`:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "One or more fields are invalid.",
    "details": [{ "field": "email", "message": "Email must be a valid email address." }]
  }
}
```

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/health` | none | Liveness check. No database call. |
| `POST` | `/api/register` | none | Create a registration. Rate limited when enabled. |
| `GET` | `/api/registrations` | `X-Admin-Api-Key` | Paginated registrations, newest first. |
| `GET` | `/api/registrations/export` | `X-Admin-Api-Key` | Stream all registrations as CSV, oldest first. |

### Register

```bash
curl -X POST http://localhost:3000/api/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Ada Lovelace","email":"ada@example.com","university":"SUPCOM"}'
```

Success: `201`

```json
{ "data": { "id": "uuid", "created_at": "2026-11-09T10:00:00.000Z" } }
```

Rules:

- Only `name`, `email`, `university`, and the honeypot field `website` are accepted. Unknown fields return `400`.
- `name`: 2–100 characters after trimming, control characters and NFC normalization.
- `email`: lowercased, at most 254 characters, valid `local@domain.tld` format.
- `university`: 2–150 characters after cleaning.
- Duplicate email: `409 EMAIL_ALREADY_REGISTERED`.
- `website` is a hidden anti-bot field. If it contains any non-whitespace value, the API returns a fake `201` without writing to the database.

### List registrations

```bash
curl -H "X-Admin-Api-Key: $ADMIN_API_KEY" \
  "http://localhost:3000/api/registrations?page=1&page_size=20"
```

Response:

```json
{
  "data": [
    {
      "id": "uuid",
      "full_name": "Ada Lovelace",
      "email": "ada@example.com",
      "university": "SUPCOM",
      "created_at": "2026-11-09T10:00:00.000Z"
    }
  ],
  "pagination": { "page": 1, "page_size": 20, "total": 1, "total_pages": 1 }
}
```

Pagination:

- `page`: integer >= 1, default `1`
- `page_size`: integer 1–100, default `20`
- Invalid values return `400 VALIDATION_ERROR`.
- `total_pages` is `0` when there are no rows, otherwise `ceil(total / page_size)`.

### Export CSV

```bash
curl -H "X-Admin-Api-Key: $ADMIN_API_KEY" \
  -o registrations.csv \
  http://localhost:3000/api/registrations/export
```

The response is streamed as `text/csv; charset=utf-8` with an attachment filename such as `registrations-2026-11-09.csv`. CSV fields follow RFC 4180 quoting, and cells beginning with `=`, `+`, `-`, `@`, tab, or carriage return are prefixed with a single quote to block spreadsheet formula injection.

## Error codes

| Status | Code | Meaning |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Invalid body or query parameters |
| 400 | `INVALID_JSON` | Malformed JSON body |
| 401 | `UNAUTHORIZED` | Missing or incorrect admin API key |
| 404 | `NOT_FOUND` | Unknown route |
| 409 | `EMAIL_ALREADY_REGISTERED` | Email already exists |
| 413 | `PAYLOAD_TOO_LARGE` | Body exceeds `BODY_LIMIT` |
| 429 | `RATE_LIMITED` | Too many registration attempts |
| 500 | `INTERNAL_ERROR` | Unexpected server or database error |

## Security notes

- `trust proxy` is set to `1` for Railway/Render-style single-proxy deployments so rate limiting sees the real client IP.
- Helmet is enabled with its default headers for a JSON API.
- Request bodies are capped at 10kb by default.
- CORS only allows exact configured origins. It never echoes a wildcard.
- `POST /api/register` is rate limited by default. Set `RATE_LIMIT_ENABLED=false` for load tests, then turn it back on.
- The honeypot is a client-hidden field named `website`. Real users never see or fill it.
- Logs are JSON lines and exclude IPs, names, emails, universities, headers, and bodies. Only method, path, status, duration, and request ID are logged per request. Server errors are logged with stack traces using the request ID.
- Admin authentication hashes both keys with SHA-256 before `timingSafeEqual`, so key length is not leaked.
- CSV export neutralizes formula injection and uses explicit column selection everywhere.

## Railway deployment

1. Push the project to a GitHub repository.
2. In Railway, create a new project and deploy from that repository.
3. Set every variable from `.env.example` in the Railway service settings. Do not commit `.env`.
4. Railway provides `PORT`; keep the app listening on it (the server already does).
5. Set the healthcheck path to `/api/health`.
6. Deploy, then smoke test:

   ```bash
   curl https://your-service.up.railway.app/api/health
   curl -X POST https://your-service.up.railway.app/api/register \
     -H "Content-Type: application/json" \
     -d '{"name":"Smoke Test","email":"smoke+1@example.com","university":"SUPCOM"}'
   ```

7. Confirm `schema.sql` has been applied in the Supabase project used by the deployment. The table, unique index, and RLS setting must exist before traffic arrives.

## k6 load test

Install k6: https://k6.io/docs/get-started/installation/

Set environment variables:

- `BASE_URL` (default `http://localhost:3000`)
- `K6_VUS` (default `20`)
- `K6_DURATION` (default `30s`)
- `K6_ADMIN_API_KEY` (optional; enables the admin list scenario)

Disable API rate limiting first, or the test will be dominated by `429` responses:

```bash
# .env
RATE_LIMIT_ENABLED=false
```

Example run:

```bash
k6 run \
  -e BASE_URL=http://localhost:3000 \
  -e K6_VUS=20 \
  -e K6_DURATION=30s \
  loadtest/k6.js
```

With the admin scenario:

```bash
k6 run \
  -e BASE_URL=http://localhost:3000 \
  -e K6_VUS=20 \
  -e K6_DURATION=30s \
  -e K6_ADMIN_API_KEY="$ADMIN_API_KEY" \
  loadtest/k6.js
```

PowerShell:

```powershell
$env:K6_ADMIN_API_KEY="your-admin-key"
k6 run -e BASE_URL=http://localhost:3000 -e K6_VUS=20 -e K6_DURATION=30s loadtest/k6.js
```

The register scenario generates unique emails (`loadtest+<runId>-<VU>-<ITER>-<random>@example.com`), so repeated runs do not collide on the unique email index and avoid false `409` responses. If rate limiting is enabled, `429` responses are counted in `register_rate_limited`; the `register_created` threshold (`rate>0.95`) will fail if too many requests are throttled.
