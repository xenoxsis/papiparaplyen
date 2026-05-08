# Agent Reference — Pap i Paraplyen

Quick-reference for AI agents making changes to this repository.

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
