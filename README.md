# DMS — QR-Based Device Management System

Enterprise asset lifecycle platform: generate QR labels in bulk, stick them on
devices, scan to map, and track everything from warranty to issue tickets.

**Stack:** React 18 + Tailwind CSS · Go 1.26 (Gin) · PostgreSQL 18 · JWT + RBAC

---

## Quick start

```bash
# 1. Backend  (terminal 1)
cd backend
go run ./cmd/server

# 2. Frontend (terminal 2)
cd frontend
npm install     # first time only
npm run dev
```

Open **http://localhost:5173**

Or just double-click **`start.bat`** in the project root to launch both.

### Demo accounts

| Role   | Email             | Password    |
| ------ | ----------------- | ----------- |
| Admin  | admin@dms.local   | `Admin@123` |
| User   | user@dms.local    | `User@123`  |
| Client | client@dms.local  | `Client@123`|

> Change these before going live. The seed only runs when the account is absent.

---

## Setting up email (required for query notifications)

Every query a user raises is emailed to **one admin address**. Open
`backend/.env` and fill in:

```ini
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=you@yourdomain.com
SMTP_PASSWORD=your-app-password
SMTP_FROM=you@yourdomain.com
ADMIN_EMAIL=admin@yourdomain.com   # <-- receives every new query
EMAIL_ENABLED=true                 # <-- flip this on
```

Restart the backend, then go to **Settings → Email notifications → Send test**
to confirm it works.

**Gmail:** `SMTP_PASSWORD` must be a 16-character
[App Password](https://myaccount.google.com/apppasswords), not your login
password, and 2-Step Verification must be on. Use port `587`.

**Office 365:** `smtp.office365.com`, port `587`.

Email sends on a background goroutine — a slow or broken SMTP server never
blocks or fails the user's query submission. The ticket is saved first.

### WhatsApp (phase 2)

Wired and ready but disabled. The message builder and Meta Cloud API client
live in `backend/internal/services/whatsapp.go`. To turn it on, set
`WHATSAPP_ENABLED=true` plus the token/phone-id values in `.env`.

---

## How the QR lifecycle works

```
Admin generates QR codes in bulk   →  DMS000001, DMS000002, … (status: available)
        ↓
Download the A4 label sheet PDF, print, stick on devices
        ↓
Someone scans a sticker            →  /device/DMS000001
        ↓
   ┌─────────────── Is it mapped? ───────────────┐
   │ NO                                       YES │
   ↓                                            ↓
"This QR is not assigned to any            Device Details page
 device. Please login as Admin."           (Overview · Specs · Images ·
   ↓                                        Videos · Manuals · Service ·
Admin logs in → Map form                    Warranty)
   ↓                                            ↓
Fill details + upload media → Save          "Raise a query" → email to admin
   ↓
QR status becomes "mapped"  (one device per QR unless remapped)
```

Scanning never requires a login — that's the point of a sticker on a wall.
Raising a query does.

---

## Roles

| Capability                     | Admin | User | Client |
| ------------------------------ | :---: | :--: | :----: |
| Scan QR & view device          |   ✓   |  ✓   |   ✓    |
| View images / videos / manuals |   ✓   |  ✓   |   ✓    |
| Raise a query                  |   ✓   |  ✓   |   —    |
| View own query status          |   ✓   |  ✓   |   ✓    |
| Generate / print QR codes      |   ✓   |  —   |   —    |
| Map QR → device                |   ✓   |  —   |   —    |
| Add / edit / delete devices    |   ✓   |  —   |   —    |
| Upload media                   |   ✓   |  —   |   —    |
| Manage users                   |   ✓   |  —   |   —    |
| Change query status            |   ✓   |  —   |   —    |
| Reports & audit logs           |   ✓   |  —   |   —    |

Every rule is enforced server-side in `internal/middleware/auth.go`. The UI
hides what a role cannot do, but the API is the actual gate — non-admins also
only ever see queries they raised themselves.

---

## Project layout

```
backend/
  cmd/server/main.go            entrypoint, graceful shutdown
  internal/
    config/                     .env loading
    database/                   connection, migrations, seed, atomic sequences
    models/                     GORM models + enums
    middleware/                 JWT auth, RBAC, rate limit, CORS
    handlers/                   route handlers  (routes.go = the API map)
    services/                   qr, email, whatsapp, upload, report
  uploads/                      images · videos · manuals · attachments
  .env                          your secrets  (gitignored)

frontend/
  src/
    pages/                      one file per screen
    components/                 Layout, UI kit, RaiseQueryModal
    context/                    Auth + Theme
    lib/                        axios client, constants
```

---

## Key API endpoints

| Method | Endpoint                  | Access | Purpose                        |
| ------ | ------------------------- | ------ | ------------------------------ |
| POST   | `/api/auth/login`         | public | Get a JWT                      |
| GET    | `/api/scan/:assetId`      | public | **QR scan** — mapped or not    |
| GET    | `/api/qr/:assetId/image`  | public | QR PNG                         |
| POST   | `/api/qr/generate`        | admin  | Bulk generate (1–5000)         |
| POST   | `/api/qr/print`           | admin  | A4 label sheet PDF             |
| POST   | `/api/qr/:assetId/map`    | admin  | **Map QR → device**            |
| POST   | `/api/devices/:id/media`  | admin  | Upload images/videos/manuals   |
| POST   | `/api/queries`            | admin+user | **Raise a query** → email  |
| PATCH  | `/api/queries/:id/status` | admin  | Change ticket status           |
| GET    | `/api/reports/:type`      | admin  | `?format=excel\|pdf\|csv`      |

Report types: `devices`, `qr_codes`, `queries`, `warranty`, `inventory`,
`department_assets`, `audit`.

---

## Security

- **Passwords** — bcrypt hashed, never returned by the API (`json:"-"`).
- **JWT** — HS256, 12h expiry. The role is re-read from the database on every
  request, so deactivating a user takes effect immediately rather than when
  their token expires.
- **RBAC** — enforced per route group, not per handler.
- **Rate limiting** — per-IP token bucket. Login is throttled harder
  (0.2 req/s, burst 8) than the global ceiling to blunt credential stuffing.
- **Uploads** — extension *and* sniffed content-type must both match; files are
  stored under a random UUID name, never the client-supplied one.
- **SQL injection** — parameterised throughout; `ORDER BY` columns are
  whitelisted (`utils.SafeSort`).
- **Audit** — every mutating action records user, role, action, reference, IP,
  and timestamp.

### Before going to production

1. Set a long random `JWT_SECRET` (64+ chars).
2. Change all three seeded passwords.
3. `APP_ENV=production` (switches Gin to release mode).
4. Point `PUBLIC_BASE_URL` at your real domain **before generating QR codes** —
   the URL is baked into every code at generation time.
5. Use a dedicated Postgres role, not `postgres`.
6. Put the API behind HTTPS.
7. `/uploads` is served statically — filenames are unguessable UUIDs, but add
   auth there if you store confidential manuals.

---

## Notes

- **Asset IDs** (`DMS000001`) and **ticket numbers** (`DMS-2026-000001`) come
  from an atomic `UPDATE … RETURNING` counter, so two admins generating
  batches at the same moment can never collide on a number.
- **Query snapshots** — a ticket copies the device and reporter fields at
  submit time. Re-assigning the device later never rewrites the history of an
  old ticket.
- **Label sheet** — A4, 4×7 = 28 labels/page with cut guides. Print at 100%
  scale (no "fit to page") or the labels come out the wrong size.
- Deleting a device frees its QR code back to `available` and removes its media
  files — but only after the DB transaction commits, so a rolled-back delete
  never leaves dangling rows pointing at missing files.
