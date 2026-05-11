# Pap i Paraplyen

Member portal for the board game club **Pap i Paraplyen**.

---

## Features

### Public pages

- **Home** — upcoming club nights (horizontally scrollable on mobile)
- **Events** — full event list
- **Calendar** — monthly view
- **About** — club info

### Authentication

- Email + password (bcrypt, 12 rounds)
- OAuth via Google and/or Facebook (optional, env-controlled)
- httpOnly JWT cookie (7-day expiry), refreshed on every page load via `GET /api/auth/me`
- Password reset by email
- GDPR: right to erasure (`DELETE /api/auth/me`), data export (`GET /api/auth/me/export`)

### Member area

- **Profile** — edit name, initials, avatar; upcoming shifts; pending confirmations
- **Chat** — real-time channels via SSE; @-mentions with email notification
- **Schedule (Vagtplan)** — drag-and-drop shift assignment on desktop, drawer on mobile; opt-out; shift swap requests; "I have reviewed" banner
- **Vagter page** — open/close codes, checklist, shift note (Vagt/Admin only)

### Admin area

- Member management (roles, ban, delete)
- **Audit log** — superuser-only; filterable table of all significant actions with rendered email preview

---

## Tech stack

| Layer           | Technology                                                   |
| --------------- | ------------------------------------------------------------ |
| Frontend        | Next.js 14 (App Router), TypeScript, Tailwind CSS v4         |
| Backend         | Express 4, TypeScript, runs on port 3001                     |
| Database        | Microsoft SQL Server (via `mssql`)                           |
| Auth            | JWT in httpOnly cookie + optional OAuth (Google / Facebook)  |
| Real-time       | Server-Sent Events (SSE) — one connection per logged-in user |
| Email           | Nodemailer — HTML templates in `backend/src/email.ts`        |
| Package manager | pnpm (workspaces)                                            |
| Container       | Docker + pm2 (single image, single port 3000)                |

---

## Getting started (development)

### Prerequisites

- Node.js >= 20
- pnpm
- A running SQL Server instance (local or Docker)

### 1 — Install dependencies

```bash
pnpm install
```

### 2 — Configure environment

**`backend/.env`** (local dev only):

```
DB_SERVER=localhost
DB_NAME=paraplyen
DB_USER=sa
DB_PASSWORD=yourpassword
JWT_SECRET=changeme
FRONTEND_URL=http://localhost:3000
SUPERUSER_EMAIL=you@example.com

# Optional OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
FACEBOOK_CLIENT_ID=
FACEBOOK_CLIENT_SECRET=

# Optional email (Nodemailer)
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=noreply@example.com
```

**`.env`** (root — read by docker-compose):

```
DB_SERVER=db
DB_NAME=paraplyen
DB_USER=sa
DB_PASSWORD=yourpassword
JWT_SECRET=changeme
FRONTEND_URL=https://yourdomain.com
SUPERUSER_EMAIL=you@example.com
# ... same optional keys
```

### 3 — Initialise the database

```bash
# Run the full schema against your SQL Server instance
sqlcmd -S localhost -U sa -P yourpassword -d paraplyen -i database/setup.sql

# Then apply migrations in order
sqlcmd ... -i database/migrations/001_add_notifications.sql
# ... through the latest (013_audit_log.sql)
```

### 4 — Start dev servers

```bash
# Terminal 1 — backend (port 3001)
cd backend && pnpm dev

# Terminal 2 — frontend (port 3000)
pnpm dev
```

Open http://localhost:3000.

---

## Running with Docker

```bash
# Builds the image and starts everything (reads root .env automatically)
docker-compose up -d --build
```

Only port `3000` is exposed. The Next.js server proxies all `/api/*` requests internally to the Express backend on port `3001`.

---

## Project structure

```
/
├── src/                          Next.js frontend
│   ├── app/(site)/               All user-facing pages
│   │   ├── page.tsx              Home (server component)
│   │   ├── events/
│   │   ├── calendar/
│   │   ├── login/
│   │   └── member/
│   │       ├── profile/          Chat, shifts, profile edit
│   │       ├── schedule/         Vagtplan (admin/vagt)
│   │       ├── vagter/           Codes, checklist, shift note
│   │       └── admin/
│   │           ├── page.tsx      Member management
│   │           └── logs/         Audit log browser (superuser only)
│   ├── components/               Shared UI components
│   └── lib/
│       ├── api.ts                All frontend API calls (single source of truth)
│       ├── auth-context.tsx      useAuth() — user, logout, updateUser
│       └── UserSSEContext.tsx    Single SSE connection per user
├── backend/src/
│   ├── server.ts                 Express bootstrap + route mounting
│   ├── auth.ts                   JWT helpers, requireAuth middleware
│   ├── audit.ts                  logEvent() — fire-and-forget audit writer
│   ├── broadcaster.ts            SSE client registry
│   ├── email.ts                  HTML email templates
│   ├── scheduleEmails.ts         Email send logic + daily data-retention cleanup
│   ├── notifications.ts          createNotification() helper
│   ├── presence.ts               isRecentlyActive() — suppresses mention emails
│   ├── db/index.ts               mssql pool singleton
│   └── routes/                   One file per API resource
├── database/
│   ├── setup.sql                 Full idempotent schema
│   └── migrations/               Incremental scripts (001–013)
├── docker-compose.yml
├── Dockerfile
└── ecosystem.config.cjs          pm2 process config
```

---

## Roles & superuser

| Role              | Access                                                     |
| ----------------- | ---------------------------------------------------------- |
| _(none)_          | Member profile, general chat                               |
| **Vagt**          | + Schedule, vagter channel, shift swap                     |
| **Tilskuer**      | + Read-only vagter channel                                 |
| **Administrator** | + Full admin panel, member management                      |
| **Superuser**     | + Audit log (identified by `SUPERUSER_EMAIL` env var only) |

The superuser account cannot be banned or have its roles changed via the admin UI.

---

## Audit log

All significant actions are logged to `dbo.audit_log` (auto-purged after 90 days):

- **Auth:** `login.success`, `login.failure`, `auth.register`, `oauth.login`, `oauth.register`, `auth.erasure`
- **Email:** `email.sent`, `email.password_reset`
- **Shifts:** `shift.create`, `shift.edit`, `shift.delete`, `shift.assign`, `shift.unassign`, `shift.confirm`, `shift.optout`, `shift.optout_remove`
- **Vagter:** `vagter.settings`, `vagter.checklist_create`, `vagter.checklist_edit`, `vagter.checklist_delete`

Email log entries include the rendered HTML — click **Vis email** in the audit log UI to preview it in an iframe.

---

## Email notifications

Users opt in via the email consent modal and can configure preferences per type:

| Preference         | Trigger                                                 |
| ------------------ | ------------------------------------------------------- |
| `email_on_nights`  | New club nights digest (30-min debounce)                |
| `email_on_shift`   | Shift assigned / unassigned / deleted                   |
| `email_on_mention` | @-mention in chat (skipped if user active within 5 min) |

---

## Adding a database column

1. Update `database/setup.sql` (in the relevant `CREATE TABLE` block)
2. Create `database/migrations/0NN_description.sql` (idempotent — use `IF NOT EXISTS` / `IF EXISTS`)
3. Run the migration against the production database
