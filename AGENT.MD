# Agent Reference — Pap i Paraplyen

Quick-reference for AI agents making changes to this repository.

---

## Stack

| Layer           | Technology                                               |
| --------------- | -------------------------------------------------------- |
| Frontend        | Next.js 14 (App Router), TypeScript, Tailwind CSS        |
| Backend         | Express + TypeScript, runs on port 3001                  |
| Database        | Microsoft SQL Server (MSSQL) via `mssql` npm package     |
| Auth            | JWT (7-day expiry) in **httpOnly cookie** (`auth_token`) |
| Email           | Nodemailer (`backend/src/email.ts`)                      |
| Real-time       | SSE via `backend/src/broadcaster.ts`                     |
| Package manager | pnpm (workspace)                                         |

---

## Repository Layout

```
/                          Next.js frontend root
  src/
    app/(site)/            All user-facing pages (layout wraps with Nav+Footer)
      page.tsx             Home (server component)
      events/page.tsx
      calendar/page.tsx
      login/page.tsx
      privacy/page.tsx     GDPR privacy policy
      member/
        profile/page.tsx   Main authenticated page: chat, shifts, profile edit
        schedule/page.tsx  Admin/Vagt schedule management
        vagter/page.tsx    Vagt info page (codes, checklist, shift note)
        admin/page.tsx     Admin member management
        admin/logs/page.tsx  Superuser-only audit log browser
    components/
      Nav.tsx              Top nav — includes NotificationBell, useNotifications
      NotificationBell.tsx Notification dropdown
      MemberHero.tsx       Profile hero card (accepts `action` prop)
      UserSSEWrapper.tsx   Client wrapper that provides UserSSEContext
      EmailConsentModal.tsx  GDPR email consent modal (shown when needs_consent=true)
    lib/
      api.ts               ALL frontend API calls — single source of truth
      auth-context.tsx     useAuth() — user, logout, updateUser, pendingShiftCount
      UserSSEContext.tsx   Single SSE connection per user; useUserSSE(handler)
      useNotifications.ts  Subscribes to UserSSEContext for notification events
      useChannelSSE.ts     Subscribes to UserSSEContext for chat_message events
      useRequireAuth.ts    Redirect guard for protected pages
      renderMentions.tsx   Parses @[Name](id) syntax → React chips (inline styles only)
      auto-assign.ts       Auto-assign logic for schedule

backend/src/
  server.ts                Express app bootstrap, route mounting
  auth.ts                  JWT sign/verify, requireAuth middleware, touchPresence()
  audit.ts                 logEvent() — fire-and-forget audit log writer
  broadcaster.ts           SSE client registry: broadcast(), broadcastToUser(), initSseResponse()
  notifications.ts         createNotification(), createNotificationForMany()
  scheduleEmails.ts        queueNewNightEmail(), sendShiftAssignedEmail(), sendMentionEmail()
                           Also runs daily data-retention cleanup (tokens, notifications, audit_log)
  presence.ts              isRecentlyActive() — suppresses emails if user active < 5 min
  email.ts                 HTML email templates
  db/index.ts              mssql pool singleton — getPool(), sql tag
  routes/
    auth.ts                /api/auth/* — login, register, GET me, password, email-prefs, erasure, export
    members.ts             /api/members/*
    channels.ts            /api/channels/* — messages, SSE stream, members
    club-nights.ts         /api/club-nights/*
    schedule-reviews.ts    /api/schedule-reviews/*
    notifications.ts       /api/notifications/* — SSE stream, CRUD
    oauth.ts               OAuth strategies (Google, Facebook) + findOrCreateUser helper
    vagter.ts              /api/vagter/* — settings, checklist (Vagt/Admin only)
    audit-log.ts           /api/audit-log/* — superuser-only audit log endpoint

database/
  setup.sql                Full schema (idempotent drop+recreate) — update when adding columns
  migrations/              Incremental idempotent SQL scripts (001…013)
                           Latest: 013_audit_log.sql
```

---

## Roles & Superuser

### Roles (stored in `dbo.roles`, assigned via `dbo.member_roles`)

- **Administrator** — full access to everything
- **Vagt** — access to schedule, vagter channel, shift swap
- **Tilskuer** — read-only access to vagter channel
- _(no role)_ — regular member, public channels only

JWT payload: `{ memberId: number, roles: string[] }`

### Superuser

- Not a role — identified by `SUPERUSER_EMAIL` environment variable
- Backend: `email.toLowerCase() === process.env.SUPERUSER_EMAIL?.toLowerCase()`
- Frontend: `user.is_superuser` boolean on the `User` type (populated by `GET /api/auth/me`)
- Superuser is the only one who can access `/member/admin/logs` and `GET /api/audit-log`
- The superuser account cannot be banned or have its roles changed via the admin UI

---

## Database Tables

```
dbo.members            id, name, initials(UNIQUE), email, joined_date

dbo.users              id, member_id FK, password NVARCHAR(255) NULL (NULL = pure OAuth),
                       banned BIT DEFAULT 0,
                       email_on_mention BIT DEFAULT 0,
                       email_on_nights  BIT DEFAULT 0,
                       email_on_shift   BIT DEFAULT 0,
                       email_consent_at DATETIME2 NULL  (NULL = consent not given)

dbo.user_oauth_providers  id, user_id FK→users, provider NVARCHAR(50),
                          provider_id NVARCHAR(255), linked_at DATETIME2
                          UNIQUE(provider, provider_id)
                          -- One user can have multiple OAuth providers linked

dbo.roles              id, name
dbo.member_roles       member_id FK, role_id FK

dbo.club_nights        id, number, name, date, time_from, time_to, location,
                       vagt_member_id FK nullable, vagt_confirmed BIT,
                       created_at, updated_at

dbo.club_night_opt_outs   club_night_id FK, member_id FK
dbo.club_schedule_reviews member_id FK, reviewed_at

dbo.channels           id, name, type ('general'|'vagter')
dbo.channel_members    channel_id FK, member_id FK
dbo.messages           id, channel_id FK, sender_id FK, body NVARCHAR(MAX),
                       sent_at, type, shift_night_id, swap_status,
                       taken_by_member_id, is_deleted BIT

dbo.notifications      id, member_id FK, type, content, link, read_at DATETIME2 NULL, created_at

dbo.password_reset_tokens  id, token, member_id FK, expires_at, used BIT

dbo.vagt_settings      key NVARCHAR(100) PK, value NVARCHAR(MAX)
dbo.vagt_checklist     id, text, sort_order INT, is_header BIT

dbo.audit_log          id, event_type NVARCHAR(50), actor_member_id INT NULL,
                       actor_email NVARCHAR(255) NULL, target_member_id INT NULL,
                       target_email NVARCHAR(255) NULL, detail NVARCHAR(MAX) NULL (JSON),
                       ip NVARCHAR(45) NULL, created_at DATETIME2 DEFAULT GETUTCDATE()
                       -- Purged after 90 days by daily retention job
```

**When adding columns:** update **both** `database/setup.sql` (in the CREATE TABLE block) **and** create a new `database/migrations/0NN_description.sql` (idempotent — check `IF NOT EXISTS` / `IF EXISTS`).

---

## Auth Flow

- Login (`POST /api/auth/login`) / OAuth callback → sets **httpOnly cookie** `auth_token` + returns user JSON
- `GET /api/auth/me` → returns fresh `{ id, name, initials, roles, is_superuser }` using the cookie
- Auth context (`auth-context.tsx`) on mount: reads localStorage for instant display, then calls `GET /api/auth/me` to refresh (picks up new fields like `is_superuser` without requiring re-login)
- All protected backend routes use `requireAuth` middleware which verifies the cookie JWT and does a real-time banned check on every request
- **Never store sensitive info in localStorage** — the JWT itself lives in the httpOnly cookie only; localStorage holds the display user object only

---

## Audit Logging

All significant actions are logged via `logEvent()` in `backend/src/audit.ts`.

```ts
import { logEvent } from "../audit";

logEvent({
  eventType: "shift.assign", // AuditEventType union
  actorMemberId: callerId(res), // who did it
  actorEmail: "...", // denormalised — survives erasure
  targetMemberId: assignedId, // who it affected
  targetEmail: "...",
  detail: { nightId, name, date }, // any JSON-serialisable object
  ip: req.ip,
});
```

- Fire-and-forget — never throws, never blocks the request
- `actor_email` / `target_email` are denormalised so logs survive GDPR erasure
- Entries purged after **90 days** by the daily retention job in `scheduleEmails.ts`

**Event types** (all defined in `AuditEventType`):
`login.success`, `login.failure`, `auth.register`, `oauth.login`, `oauth.register`,
`email.password_reset`, `auth.erasure`,
`shift.create`, `shift.edit`, `shift.delete`, `shift.assign`, `shift.unassign`,
`shift.confirm`, `shift.optout`, `shift.optout_remove`,
`vagter.settings`, `vagter.checklist_create`, `vagter.checklist_edit`, `vagter.checklist_delete`,
`email.sent`

---

## OAuth

- Strategies: Google, Facebook (both optional via env vars)
- `findOrCreateUser()` in `oauth.ts`:
  1. Look up by `provider` + `provider_id` in `dbo.user_oauth_providers` (fast path)
  2. Fall back to `members.email` match → link the new provider to the existing account
  3. If no match → create new member + users row + provider row
- A single user can have both a local password and one or more OAuth providers linked
- `users.password` is NULL for pure OAuth accounts

---

## SSE Architecture

One SSE connection per logged-in user, keyed `"user:<memberId>"` in the broadcaster.

**Server push events** (both sent via `broadcast("user:<memberId>", payload)`):

```json
{ "event": "notification", "data": { ...ApiNotification } }
{ "event": "chat_message", "data": { "channelId": 1, "message": { ...ApiMessage } } }
```

**Frontend subscription:**

```ts
useUserSSE((evt) => {
  if (evt.event === "chat_message") { ... }
  if (evt.event === "notification") { ... }
});
```

`UserSSEProvider` is mounted in `src/app/(site)/layout.tsx` via `UserSSEWrapper`.

To add a new SSE event type:

1. Add it to the `UserSSEEvent` union in `UserSSEContext.tsx`
2. Broadcast from the backend: `broadcastToUser(memberId, { event: "my_event", data: ... })`
3. Subscribe on the frontend with `useUserSSE`

---

## API Frontend Calls (`src/lib/api.ts`)

All API calls go through the `api<T>()` helper — uses `credentials: "include"` (sends the httpOnly cookie). Throws on non-2xx; dispatches `auth:unauthorized` event on 401 which triggers logout.

Key exported types: `AuthUser`, `ApiClubNight`, `ApiChannel`, `ApiMessage`, `ApiMember`,
`ApiScheduleReview`, `ApiChannelMember`, `ApiNotification`, `ApiEmailPrefs`,
`ApiVagterPageData`, `AuditLogRow`, `AuditLogFilters`.

**Always update `api.ts`** when adding new backend endpoints.

---

## GDPR

- `DELETE /api/auth/me` — right to erasure: anonymises member row, deletes user + oauth providers + tokens
- `GET /api/auth/me/export` — data portability: returns all member data as JSON
- `email_consent_at` on `dbo.users` — NULL = consent not given → `EmailConsentModal` shown
- `password_reset_tokens` purged after 30 days; `notifications` + `audit_log` purged after 90 days
- Audit logs are operational records, not subject to the privacy policy

---

## Email System

- All templates in `backend/src/email.ts` — pure functions returning HTML strings
- Sending logic in `backend/src/scheduleEmails.ts`
- Each send function checks the user's `email_on_*` pref from DB
- `sendMentionEmail` also checks `isRecentlyActive(memberId)` — skips if user active in last 5 min
- New nights use a 30-min debounce (`queueNewNightEmail`); shift + mention emails are immediate
- Every `sendEmail` call logs an `email.sent` audit event

---

## Common Patterns

### Date/time filtering

- **Public event lists / home page:** hide when `new Date(date + 'T' + time_from) <= now`
- **Schedule page:** hide when `new Date(date + 'T' + time_to) <= now`

### Tailwind gotcha

**Never use dynamic Tailwind class strings** (e.g. `` `bg-${color}-100` ``).
Tailwind purges them at build time. Use **inline styles** for any runtime-dynamic values.

### Backend auth helpers

```ts
requireAuth; // middleware — sets res.locals.jwt = { memberId, roles }
callerId(res); // → number | null
isAdmin(res); // → boolean  (checks roles includes "Administrator")
requireAdmin(req, res); // → boolean, also sends 403 if false
```

`requireAuth` automatically calls `touchPresence(memberId)` on every authenticated request.

### Creating notifications

```ts
await createNotification(
  memberId,
  "shift_assigned",
  "Du er tildelt...",
  "/member/schedule",
);
await createNotificationForMany(
  [id1, id2],
  "nights_added",
  "...",
  "/member/schedule",
);
```

### Broadcast SSE event

```ts
import { broadcast, getConnectedUserIds } from "../broadcaster";
broadcast(`user:${memberId}`, { event: "my_event", data: { ... } });
```

---

## Dev Commands

```bash
# Frontend (port 3000)
pnpm run dev

# Backend (port 3001) — from /backend
pnpm run dev

# Docker (SQL Server + everything)
docker-compose up -d --build

# Type check frontend
npx tsc --noEmit

# Type check backend
cd backend && npx tsc --noEmit
```

### Environment variables

| Variable                      | Required | Notes                                    |
| ----------------------------- | -------- | ---------------------------------------- |
| `JWT_SECRET`                  | ✅       | No default — must be set                 |
| `SUPERUSER_EMAIL`             | ✅       | Email of the superuser account           |
| `DB_SERVER`                   | ✅       | SQL Server host                          |
| `DB_USER` / `DB_PASSWORD`     | ✅       |                                          |
| `DB_NAME`                     | ✅       |                                          |
| `DB_ENCRYPT`                  |          | `true` in prod (default `true`)          |
| `DB_TRUST_SERVER_CERTIFICATE` |          | Set `true` if using self-signed cert     |
| `FRONTEND_URL`                | ✅       | Used in email links and CORS             |
| `BASE_URL`                    |          | Backend public URL (for OAuth callbacks) |
| `NEXT_PUBLIC_API_URL`         |          | Frontend → backend base URL              |
| `GOOGLE_CLIENT_ID/SECRET`     |          | Enables Google OAuth                     |
| `FACEBOOK_APP_ID/SECRET`      |          | Enables Facebook OAuth                   |
| `SMTP_HOST/PORT/USER/PASS`    | ✅       | Nodemailer config                        |
| `SMTP_FROM`                   |          | Sender address                           |
| `SCHEDULE_EMAIL_DEBOUNCE_MS`  |          | Default 30 min (1 800 000 ms)            |

---

## Running Migrations

Migrations live in `database/migrations/` and are **idempotent** (safe to re-run).
They must be run manually against the SQL Server container after deploying schema changes.
Latest migration: **013_audit_log.sql**

---

## Stack

| Layer           | Technology                                                   |
| --------------- | ------------------------------------------------------------ |
| Frontend        | Next.js 14 (App Router), TypeScript, Tailwind CSS            |
| Backend         | Express + TypeScript, runs on port 3001                      |
| Database        | Microsoft SQL Server (MSSQL) via `mssql` npm package         |
| Auth            | JWT (7-day expiry), stored in `localStorage` as `auth_token` |
| Email           | Nodemailer (`backend/src/email.ts`)                          |
| Real-time       | SSE via `backend/src/broadcaster.ts`                         |
| Package manager | pnpm (workspace)                                             |

---

## Repository Layout

```
/                          Next.js frontend root
  src/
    app/(site)/            All user-facing pages (layout wraps with Nav+Footer)
      page.tsx             Home (server component)
      events/page.tsx      Public events listing
      calendar/page.tsx
      login/page.tsx
      member/
        profile/page.tsx   Main authenticated page: chat, shifts, profile edit
        schedule/page.tsx  Admin/Vagt schedule management
        admin/page.tsx     Admin member management
    components/
      Nav.tsx              Top nav — includes NotificationBell, useNotifications
      NotificationBell.tsx Notification dropdown
      MemberHero.tsx       Profile hero card (accepts `action` prop)
      UserSSEWrapper.tsx   Client wrapper that provides UserSSEContext
    lib/
      api.ts               ALL frontend API calls — single source of truth
      auth-context.tsx     useAuth() — user, logout, updateUser, pendingShiftCount
      UserSSEContext.tsx   Single SSE connection per user; useUserSSE(handler)
      useNotifications.ts  Subscribes to UserSSEContext for notification events
      useChannelSSE.ts     Subscribes to UserSSEContext for chat_message events
      useRequireAuth.ts    Redirect guard for protected pages
      renderMentions.tsx   Parses @[Name](id) syntax → React chips (inline styles only)
      auto-assign.ts       Auto-assign logic for schedule

backend/src/
  server.ts                Express app bootstrap, route mounting
  auth.ts                  JWT sign/verify, requireAuth middleware, touchPresence()
  broadcaster.ts           SSE client registry: broadcast(), broadcastToUser(), initSseResponse()
  notifications.ts         createNotification(), createNotificationForMany()
  scheduleEmails.ts        queueNewNightEmail(), sendShiftAssignedEmail(), sendMentionEmail()
  presence.ts              isRecentlyActive() — suppresses emails if user active < 5 min
  email.ts                 HTML email templates
  db/index.ts              mssql pool singleton — getPool(), sql tag
  routes/
    auth.ts                /api/auth/* — login, register, me, password, email-prefs, oauth
    members.ts             /api/members/*
    channels.ts            /api/channels/* — messages, SSE stream (legacy), members
    club-nights.ts         /api/club-nights/*
    schedule-reviews.ts    /api/schedule-reviews/*
    notifications.ts       /api/notifications/* — SSE stream, CRUD
    oauth.ts               OAuth callback handling

database/
  setup.sql                Full schema (idempotent drop+recreate) — update this when adding columns
  migrations/              Incremental idempotent SQL scripts (001, 002, 003…)
```

---

## Roles

Three roles are stored in `dbo.roles` and assigned via `dbo.member_roles`:

- **Administrator** — full access to everything
- **Vagt** — access to schedule, vagter channel, shift swap
- **Tilskuer** — read-only access to vagter channel
- _(no role)_ — regular member, public channels only

JWT payload: `{ memberId: number, roles: string[] }`

---

## Database Tables (key ones)

```
dbo.members       id, name, initials(UNIQUE), email, joined_date
dbo.users         id, member_id FK, password(bcrypt), banned BIT,
                  oauth_provider, oauth_id,
                  email_on_mention BIT DEFAULT 1,
                  email_on_nights  BIT DEFAULT 1,
                  email_on_shift   BIT DEFAULT 1
dbo.roles         id, name
dbo.member_roles  member_id FK, role_id FK
dbo.club_nights   id, number, name, date, time_from, time_to, location,
                  vagt_member_id FK nullable, vagt_confirmed BIT, created_at, updated_at
dbo.club_night_opt_outs  club_night_id FK, member_id FK
dbo.club_schedule_reviews  member_id FK, reviewed_at
dbo.channels      id, name, type ('general'|'vagter')
dbo.channel_members  channel_id FK, member_id FK
dbo.messages      id, channel_id FK, sender_id FK, body NVARCHAR(MAX),
                  sent_at, type, shift_night_id, swap_status, taken_by_member_id
dbo.notifications id, member_id FK, type, body, link, is_read BIT, created_at
```

When adding columns: update **both** `database/setup.sql` (in the CREATE TABLE) **and** create a new `database/migrations/00N_description.sql` (idempotent).

---

## SSE Architecture

One SSE connection per logged-in user, keyed `"user:<memberId>"` in the broadcaster.

**Server push events** (both sent via `broadcast("user:<memberId>", payload)`):

```json
{ "event": "notification", "data": { ...ApiNotification } }
{ "event": "chat_message", "data": { "channelId": 1, "message": { ...ApiMessage } } }
```

**Frontend subscription:**

```ts
// In any client component:
useUserSSE((evt) => {
  if (evt.event === "chat_message") { ... }
  if (evt.event === "notification") { ... }
});
```

`UserSSEProvider` is mounted in `src/app/(site)/layout.tsx` via `UserSSEWrapper`.

To add a new SSE event type:

1. Add it to the `UserSSEEvent` union in `UserSSEContext.tsx`
2. Broadcast from the backend: `broadcastToUser(memberId, { event: "my_event", data: ... })`
3. Subscribe on the frontend with `useUserSSE`

---

## API Frontend Calls (`src/lib/api.ts`)

All API calls go through the `api<T>()` helper which reads `auth_token` from localStorage and throws on non-2xx.

Key types exported: `ApiClubNight`, `ApiChannel`, `ApiMessage`, `ApiMember`, `ApiScheduleReview`, `ApiChannelMember`, `ApiNotification`, `ApiEmailPrefs`.

Always update `api.ts` when adding new backend endpoints.

---

## Mention Syntax

Messages stored in DB use `@[Name](memberId)` syntax.

- **Render:** `renderMessageBody(body, currentUserId)` → React nodes with inline-styled chips
- **Parse IDs:** `extractMentionIds(body)` → `number[]`
- **Always use inline styles** in `renderMentions.tsx` — Tailwind dynamic class names get purged

---

## Email System

- All templates in `backend/src/email.ts` — pure functions returning HTML strings
- Sending logic in `backend/src/scheduleEmails.ts`
- Each send function checks the user's `email_on_*` pref from DB
- `sendMentionEmail` also checks `isRecentlyActive(memberId)` — skips if user was active in last 5 min
- New nights use a 30-min debounce (`queueNewNightEmail`); shift+mention emails are immediate

---

## Common Patterns

### Date/time filtering

- **Public event lists / home page:** hide when `new Date(date + 'T' + time_from) <= now` (hides at start)
- **Schedule page:** hide when `new Date(date + 'T' + time_to) <= now` (hides after end)

### Tailwind gotcha

**Never use dynamic Tailwind class strings** (e.g. `` `bg-${color}-100` ``).  
Tailwind purges them at build time. Use **inline styles** for any runtime-dynamic values.

### Backend auth

```ts
requireAuth; // middleware — sets res.locals.jwt
callerId(res); // → number | null
isAdmin(res); // → boolean
```

`requireAuth` automatically calls `touchPresence(memberId)` on every authenticated request.

### Creating notifications

```ts
// Single recipient
await createNotification(memberId, "shift_assigned", "...", "/member/schedule");

// Multiple recipients
await createNotificationForMany(
  [id1, id2],
  "nights_added",
  "...",
  "/member/schedule",
);
```

### Broadcasting a new SSE event type (full checklist)

1. Add to `UserSSEEvent` union in `src/lib/UserSSEContext.tsx`
2. Call `broadcastToUser(memberId, { event: "...", data: ... })` from backend
3. Subscribe with `useUserSSE` on frontend
4. If needed, export a new hook in `src/lib/`

---

## Dev Commands

```bash
# Frontend (port 3000)
pnpm run dev

# Backend (port 3001) — from /backend
pnpm run dev

# Docker (SQL Server + backend)
docker-compose up -d --build

# Type check frontend
npx tsc --noEmit

# Type check backend
cd backend && npx tsc --noEmit
```

Environment variables needed:

- `NEXT_PUBLIC_API_URL` — backend base URL (frontend)
- `JWT_SECRET` — required, no default
- `DATABASE_URL` or individual `DB_*` vars — MSSQL connection
- `FRONTEND_URL` — used in email links and CORS
- `SMTP_*` — nodemailer config
- `SCHEDULE_EMAIL_DEBOUNCE_MS` — optional, default 30 min
