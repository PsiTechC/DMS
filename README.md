# DMS — QR-Based Device Management System

Enterprise asset lifecycle platform: generate QR labels in bulk, stick them on
devices, scan to map, and track everything from warranty to issue tickets.

**Stack:** React 18 + Tailwind CSS · Go 1.26 (Gin) · PostgreSQL 18 · JWT + RBAC

---

## Quick start

Double-click **`start.bat`** in the project root, wait ~15 seconds, then open:

### **http://localhost:5180**

Or run the two services by hand:

```bash
# 1. Backend  (terminal 1)
cd backend
go run ./cmd/server          # -> http://localhost:8090

# 2. Frontend (terminal 2)
cd frontend
npm install                  # first time only
npm run dev                  # -> http://localhost:5180
```

You need **both** running. The frontend is what you open in the browser; it
proxies `/api` and `/uploads` through to the backend.

> **Ports:** this project uses **8090** (backend) and **5180** (frontend), not
> the usual 8080/5173 — an unrelated older project on this machine already
> holds those. The three places that must agree are `PORT` and
> `PUBLIC_BASE_URL` in `backend/.env`, and `server.port` + `proxy` in
> `frontend/vite.config.js`.

**Database:** `dms_psitech` on local PostgreSQL 18. Tables and the three demo
accounts are created automatically on first run — there is no migration step.

### Demo accounts

| Role   | Email             | Password    |
| ------ | ----------------- | ----------- |
| Admin  | admin@dms.local   | `Admin@123` |
| User   | user@dms.local    | `User@123`  |
| Client | client@dms.local  | `Client@123`|

> Change these before going live. The seed only runs when the account is absent.

---

## Email notifications

**Already configured and working.** Every query raised is emailed to the single
address in `ADMIN_EMAIL` (`backend/.env`) via the PSI Tech mail server on port
**465** (implicit TLS — the dialer enables SSL automatically for 465; use 587
if you ever want STARTTLS instead).

Two separate settings, easy to confuse:

| Setting         | Meaning                                   | Current                        |
| --------------- | ----------------------------------------- | ------------------------------ |
| `SMTP_USERNAME` | the account that **sends** the mail        | `licensingteam@psitech.co.in`  |
| `ADMIN_EMAIL`   | the mailbox that **receives** the tickets  | `nupurpatil4134@gmail.com` (temporary — testing) |

To redirect notifications, change **`ADMIN_EMAIL`** only and restart the
backend. The sending account stays as-is.

> `.env` is read once at startup, so **any `.env` change needs a backend
> restart** to take effect.

Verify any time with **Settings → Email notifications → Send test**.

The admin email contains every field from the ticket: ticket number, device
number, QR number, device name, brand, model, serial, company, project,
department, assigned employee, location, reporter name, employee ID, email,
priority, issue title, description, and submission timestamp. `Reply-To` is set
to the reporter, so replying from the inbox reaches them directly. Any
attachment is attached to the email.

Sending happens on a background goroutine — a slow or unreachable SMTP server
never blocks or fails the user's submission. The ticket is committed first,
then the notification is attempted; failures are logged, not surfaced.

The reporter also gets a status-change email whenever an admin moves their
ticket. That send is best-effort too — an undeliverable reporter address is
logged and never fails the admin's status update.

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
| View **own** query status      |   ✓   |  ✓   |   ✓    |
| View **all** queries           |   ✓   |  —   |   ✓    |
| Generate / print QR codes      |   ✓   |  —   |   —    |
| Map QR → device                |   ✓   |  —   |   —    |
| Add / edit / delete devices    |   ✓   |  —   |   —    |
| Upload media                   |   ✓   |  —   |   —    |
| Manage users                   |   ✓   |  —   |   —    |
| Change query status            |   ✓   |  —   |   —    |
| Reports & audit logs           |   ✓   |  —   |   —    |

Every rule is enforced server-side in `internal/middleware/auth.go`. The UI
hides what a role cannot do, but the API is the actual gate.

**Query visibility** (`utils.SeesAllQueries`) is the one rule that is not
simply "admin or not":

- **User** — sees only tickets they raised. They raise queries, so their own
  list is what they want.
- **Client** — sees *every* ticket, read-only. A client **cannot raise a
  query**, so scoping them to "their own" would leave the page permanently
  empty. They already read every device, so the full ticket list is consistent.
  This grants reading only; changing a status stays admin-only.
- **Admin** — sees and changes everything.

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
