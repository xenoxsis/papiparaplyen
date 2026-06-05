# Agent Reference — Pap i Paraplyen

Quick-reference for AI agents making changes to this repository.

---

## Agent Rules

> **Never run database migrations or project builds.**
> The user runs both manually. Do not execute `pnpm build`, `tsc`, `docker-compose build/up`, or any SQL migration script — even to verify changes — unless the user explicitly asks for it for debugging purposes.

> **Keep AGENT.MD up to date.**
> After implementing any feature, update this file to reflect: new/changed DB columns, new migrations, new components, new SSE event types, new API endpoints, new env vars, or new patterns. AGENT.MD is the single source of truth for future agents.

---

## Stack

| Layer           | Technology                                               |
| --------------- | -------------------------------------------------------- |
| Frontend        | Next.js 16 (App Router), TypeScript, Tailwind CSS        |
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
      events/page.tsx      Public events listing
      about/page.tsx       Public about/team page (shows Vagter with avatars)
      calendar/page.tsx    Public calendar view
      boardgames/page.tsx  Public boardgames list (BGG collection)
      login/page.tsx
      privacy/page.tsx     GDPR privacy policy
      reset-password/      Password reset flow
      oauth-callback/      OAuth landing page
      member/
        dashboard/page.tsx   Member home: chat, upcoming shifts, swap requests
        profile/page.tsx     Settings: name, password, email prefs, avatar, BGG
        schedule/page.tsx    Admin/Vagt schedule management (drag-and-drop)
        vagter/page.tsx      Vagt info page (codes, checklist, shift note)
        admin/page.tsx       Admin member management
        admin/logs/page.tsx  Superuser-only audit log browser
    components/
      Nav.tsx              Top nav — includes NotificationBell, useNotifications
      NotificationBell.tsx Notification dropdown
      MemberAvatar.tsx     Reusable circle avatar — shows photo (next/image) or initials fallback
                           Props: initials, size, colorClass, memberId?, hasAvatar?, avatarVersion?
      AvatarCropModal.tsx  Circular crop + zoom modal; uses react-easy-crop; emits a JPEG Blob
      MemberHero.tsx       Profile hero card (accepts `action` prop)
      UserSSEWrapper.tsx   Client wrapper that provides UserSSEContext
      EmailConsentModal.tsx  GDPR email consent modal (shown when needs_consent=true)
    lib/
      api.ts               ALL frontend API calls — single source of truth
      auth-context.tsx     useAuth() — user, logout, updateUser, pendingShiftCount
                           User type: { id, name, initials, roles, is_superuser?, has_avatar? }
      config.ts            App feature flags — AVATAR_UPLOAD_ROLES (controls who can upload)
      UserSSEContext.tsx   Single SSE connection per user; useUserSSE(handler)
      useNotifications.ts  Subscribes to UserSSEContext for notification events
      useChannelSSE.ts     Subscribes to UserSSEContext for chat_message events
      useRequireAuth.ts    Redirect guard for protected pages
      renderMentions.tsx   Parses @[Name](id) syntax → React chips (inline styles only)
      auto-assign.ts       Auto-assign logic for schedule
      theme-context.tsx   useTheme() — theme: 'light' | 'dark' | 'system'; setTheme(); resolvedTheme
                           ThemeProvider wraps the app; persists to localStorage key 'theme'

backend/src/
  server.ts                Express app bootstrap, route mounting
  auth.ts                  JWT sign/verify, requireAuth middleware, touchPresence()
  audit.ts                 logEvent() — fire-and-forget audit log writer
  broadcaster.ts           SSE client registry: broadcast(), broadcastToUser(), initSseResponse()
  notifications.ts         createNotification(), createNotificationForMany()
                           NotificationType union — all valid notification type strings
  scheduleEmails.ts        queueNewNightEmail(), sendShiftAssignedEmail(), sendMentionEmail()
                           Also runs daily data-retention cleanup (tokens, notifications, audit_log)
  presence.ts              isRecentlyActive() — suppresses emails if user active < 5 min
  push.ts                  OneSignal Web Push via sendPushToMembers(); PUSH_ENABLED_TYPES controls
                           which NotificationTypes also trigger a push notification
  ical.ts                  RFC 5545 iCalendar builder for subscription feeds
  silence.ts               isSilenced() / setSilenced() — in-memory flag to suppress all emails
                           and push notifications (resets on server restart, useful for testing)
  email.ts                 HTML email templates
  db/index.ts              mssql pool singleton — getPool(), sql tag
  routes/
    auth.ts                /api/auth/* — login, register, GET me, password, email-prefs, erasure, export
    members.ts             /api/members/*
    avatar.ts              /api/members/me/avatar (POST, DELETE) + /api/members/:id/avatar (GET public)
    channels.ts            /api/channels/* — messages, SSE stream, members
    club-nights.ts         /api/club-nights/* — includes GET /ical for calendar subscriptions
    schedule-reviews.ts    /api/schedule-reviews/*
    notifications.ts       /api/notifications/* — SSE stream, CRUD
    oauth.ts               OAuth strategies (Google, Facebook) + findOrCreateUser helper
    vagter.ts              /api/vagter/* — settings, checklist (Vagt/Admin only)
    audit-log.ts           /api/audit-log/* — superuser-only audit log endpoint
    boardgames.ts          /api/boardgames/* — member BGG collection (public list) + CSV upload;
                           also /club (public list) + /club/upload (admin-only CSV) for games always available in the club
    locations.ts           /api/locations/* — venue locations (admin CRUD, public GET)
    address-autocomplete.ts  /api/address-autocomplete?q=... — proxies api.danskadresseapi.dk

database/
  setup.sql                Full schema (idempotent drop+recreate) — update when adding columns
  migrations/              Incremental idempotent SQL scripts (001…024)
                           Latest: 026_club_boardgames.sql
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
dbo.members            id, name, initials(UNIQUE), email, joined_date,
                       is_virtual BIT DEFAULT 0,          -- virtual = no login account
                       show_on_about_page BIT DEFAULT 1,
                       rule_allow_two_in_a_row BIT,        -- auto-assign scheduling rules
                       rule_allow_weekday_after_sunday BIT,
                       rule_no_weekends BIT

dbo.users              id, member_id FK, password NVARCHAR(255) NULL (NULL = pure OAuth),
                       banned BIT DEFAULT 0,
                       email_on_mention BIT DEFAULT 0,
                       email_on_nights  BIT DEFAULT 0,
                       email_on_shift   BIT DEFAULT 0,
                       email_consent_at DATETIME2 NULL  (NULL = consent not given),
                       bgg_share_collection BIT DEFAULT 1,
                       bgg_share_name       BIT DEFAULT 1,
                       ical_token NVARCHAR(64) NULL       -- secret token for personal iCal feed

dbo.user_oauth_providers  id, user_id FK→users, provider NVARCHAR(50),
                          provider_id NVARCHAR(255), linked_at DATETIME2
                          UNIQUE(provider, provider_id)
                          -- One user can have multiple OAuth providers linked

dbo.roles              id, name
dbo.member_roles       member_id FK, role_id FK

dbo.club_nights        id, number, name, date, time_from, time_to,
                       location NVARCHAR (legacy free text),
                       location_id INT NULL FK→dbo.locations,
                       vagt_member_id FK nullable, vagt_confirmed BIT,
                       cancelled BIT DEFAULT 0, cancelled_at DATETIME2 NULL,
                       status NVARCHAR(20) DEFAULT 'published'  -- 'draft' | 'published'
                       created_at, updated_at

dbo.club_night_opt_outs   club_night_id FK, member_id FK
dbo.club_night_followers  club_night_id FK, member_id FK
                          -- member has opted-in to notifications for a specific night
dbo.club_schedule_reviews member_id FK, reviewed_at

dbo.channels           id, name, type ('general'|'vagter')
dbo.channel_members    channel_id FK, member_id FK
dbo.messages           id, channel_id FK, sender_id FK, body NVARCHAR(MAX),
                       sent_at, type, shift_night_id, swap_status,
                       taken_by_member_id, is_deleted BIT,
                       reply_to_id INT NULL FK→dbo.messages
                       -- reply_to_id: populated for threaded replies; NULL = top-level message

dbo.notifications      id, member_id FK, type, content, link, read_at DATETIME2 NULL, created_at

dbo.password_reset_tokens  id, token, member_id FK, expires_at, used BIT

dbo.vagt_settings      key NVARCHAR(100) PK, value NVARCHAR(MAX)
dbo.vagt_checklist     id, text, sort_order INT, is_header BIT

dbo.boardgames         id, bgg_id INT UNIQUE, name, avg_weight, min_players, max_players,
                       year_published, playing_time, updated_at
dbo.member_boardgames  member_id FK, bgg_id INT FK→boardgames
                       -- join table: which member owns which game
dbo.club_boardgames    bgg_id INT PK FK→boardgames (CASCADE DELETE)
                       -- games always available IN the club (left by members) — no owner attribution

dbo.locations          id, name, address, disabled BIT DEFAULT 0, created_at, updated_at
                       -- reusable venues for club nights (admin managed)

dbo.audit_log          id, event_type NVARCHAR(50), actor_member_id INT NULL,
                       actor_email NVARCHAR(255) NULL, target_member_id INT NULL,
                       target_email NVARCHAR(255) NULL, detail NVARCHAR(MAX) NULL (JSON),
                       ip NVARCHAR(45) NULL, created_at DATETIME2 DEFAULT GETUTCDATE()
                       -- Purged after 90 days by daily retention job

dbo.member_avatars     member_id INT PK FK→members (CASCADE DELETE),
                       image_data VARBINARY(MAX) NOT NULL,
                       content_type NVARCHAR(50) NOT NULL DEFAULT 'image/jpeg',
                       updated_at DATETIME2 NOT NULL DEFAULT SYSDATETIME()
                       -- Row is absent when no avatar has been uploaded
                       -- Image is stored as 256×256 JPEG compressed server-side by sharp
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

**Server push events** (sent via `broadcastToUser(memberId, payload)`):

```ts
{ event: "notification",     data: ApiNotification }
{ event: "chat_message",     data: { channelId: number; message: ApiMessage } }
{ event: "message_edited",   data: { channelId: number; message: ApiMessage } }
{ event: "message_deleted",  data: { channelId: number; message: ApiMessage } }
{ event: "typing",           data: { channelId: number; memberId: number; name: string } }
{ event: "roles_changed",    data?: unknown }  // forces JWT refresh on frontend
{ event: "schedule_updated", data: { type: "night_confirmed" | "drafts_published" | "review_submitted" } }
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
`ApiPublicMember`, `ApiVagterPageData`, `AuditLogRow`, `AuditLogFilters`.

Notable type fields added for avatars:

- `ApiClubNight.vagt_member_has_avatar: boolean` — whether the assigned vagt has a photo
- `ApiPublicMember.has_avatar: boolean` — used on the About page
- `ApiChannelMember.has_avatar?: boolean` — used in chat @mention dropdown
- `ApiMember.has_avatar: boolean` — used in admin / assignment modals

Avatar API helpers:

```ts
await uploadAvatar(blob); // POST /api/members/me/avatar — multipart, no JSON wrapper
await deleteAvatar(); // DELETE /api/members/me/avatar
// Serving is public: GET /api/members/:id/avatar — long-lived Cache-Control, ETag
```

**Always update `api.ts`** when adding new backend endpoints.

---

## Member Avatars

Members with a role in `AVATAR_UPLOAD_ROLES` (currently `["Vagt", "Administrator"]`) can upload a profile photo. This replaces the letter-initial circle everywhere in the UI.

### Storage

- Table: `dbo.member_avatars` — one row per member, absence = no avatar
- Images are stored as **256×256 JPEG** (~15–30 KB) compressed server-side by `sharp`
- Upload accepts any image up to 10 MB; `sharp` crops to square + resizes

### Backend route (`backend/src/routes/avatar.ts`)

| Method   | Path                      | Auth                     | Notes                                                               |
| -------- | ------------------------- | ------------------------ | ------------------------------------------------------------------- |
| `POST`   | `/api/members/me/avatar`  | requireAuth + role check | `multipart/form-data`, field name `image`; uses `multer` + `sharp`  |
| `DELETE` | `/api/members/me/avatar`  | requireAuth              | Removes the row                                                     |
| `GET`    | `/api/members/:id/avatar` | Public                   | Streams bytes; `Cache-Control: public, max-age=31536000, immutable` |

### Role gate

`AVATAR_UPLOAD_ROLES` in **`src/lib/config.ts`** — add `"Medlem"` (or other roles) here to open uploads to more users. The backend route mirrors this check independently.

### `has_avatar` propagation

- Every query that returns member data LEFT JOINs `dbo.member_avatars` and exposes `has_avatar: boolean`
- `GET /api/auth/me` returns `has_avatar` — the `User` type in `auth-context.tsx` carries it
- After upload/delete, call `updateUser({ has_avatar: true/false })` to update the auth context in place without a full re-fetch

### Cache-busting after upload

`MemberAvatar` accepts an optional `avatarVersion` prop (a timestamp number). Pass `Date.now()` after a successful upload to force a fresh fetch while keeping the long-lived cache for all other visitors.

### UI components

- **`AvatarCropModal`** — drag-to-position + zoom crop modal using `react-easy-crop`; emits a JPEG `Blob` via `onConfirm(blob)`
- **`MemberAvatar`** — drops in as a replacement for any initials circle; pass `memberId` + `hasAvatar` to show the photo
- **`MemberHero`** — automatically shows the photo when `user.has_avatar` is true
- **Nav** — `NavAvatar` helper component handles both desktop and mobile nav buttons

### Push notifications (OneSignal)

`backend/src/push.ts` — `sendPushToMembers(memberIds, title, body, url?)` targets users by their OneSignal External User ID (= `String(memberId)`, set by the frontend via `OneSignal.login()` after login).

- `PUSH_ENABLED_TYPES` in `push.ts` lists which `NotificationType` values also trigger a Web Push
- Remove a type from that array to silence push for it without touching notification creation
- Requires `ONESIGNAL_APP_ID` and `ONESIGNAL_REST_API_KEY` env vars; silently skips if absent
- Frontend provider: `<OneSignalProvider>` in `src/components/OneSignalProvider.tsx`

### iCal feed

`GET /api/club-nights/ical` — public subscription URL. Also `GET /api/club-nights/ical/me?token=<ical_token>` — personal feed filtered to the member's own confirmed shifts. The `ical_token` is a random 64-char secret stored on `dbo.users`; members can generate/revoke it from the vagter page.

### Virtual members

Members with `is_virtual = 1` have no login account — they can be assigned to shifts but cannot log in. Created via `POST /api/members` (admin only). They appear in shift assignment dropdowns but not on the About page.

### Draft nights

Club nights have `status: 'draft' | 'published'`. Drafts are only visible to Administrators. Vagter only see published nights. Bulk-publish via `POST /api/club-nights/publish`.

---

## Dark Mode

The site supports light / dark / system themes via a `.dark` class on `<html>`.

### How it works

- CSS custom properties (in `globals.css` and `globals.scss`) have a `.dark { ... }` block overriding all semantic tokens (`--background`, `--card`, `--border`, etc.)
- Tailwind variant: `@custom-variant dark (&:is(.dark *))` — use `dark:` prefixes freely in TSX
- Theme preference persisted in `localStorage` key **`theme`** — values: `'light' | 'dark' | 'system'`; default `'system'`
- An inline `<script>` in `layout.tsx` applies the class synchronously before first paint (no FOUC)

### Theme context

`src/lib/theme-context.tsx` — exports `ThemeProvider` and `useTheme()`:

```ts
const { theme, setTheme, resolvedTheme } = useTheme();
// theme: 'light' | 'dark' | 'system'
// resolvedTheme: 'light' | 'dark' (never 'system')
```

`ThemeProvider` wraps `<AuthProvider>` in `layout.tsx`. It listens to `prefers-color-scheme` changes when `theme === 'system'`.

### User toggle

Exposed as an "Udseende" section in **`src/app/(site)/member/profile/page.tsx`** — a 3-way Light / Dark / System selector.

### Adding dark variants

When building new components, always add `dark:` counterparts for any hardcoded light-mode classes:

```tsx
className =
  "bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-700 text-neutral-900 dark:text-neutral-100";
```

---

## Threaded Replies (Chat)

Messages support quote-replies via `reply_to_id INT NULL FK→dbo.messages`.

- `reply_to_id` is NULL for top-level messages; set to the parent message's id for replies
- The API returns a `reply_preview` object on the message: `{ id, sender_name, body }` (populated server-side)
- Frontend: `replyingTo` state in `ChatPanel.tsx` drives a reply preview bar above the input
- Send: `reply_to_id` is included in the POST body when sending a reply
- Display: `MessageGroup.tsx` renders the quoted reply context above the message bubble when `reply_to_id` is set
- Clicking a reply preview scrolls to the original message (`onScrollToMessage` prop)

---

## Notification Types

All valid values for `NotificationType` (defined in `backend/src/notifications.ts`):

`swap_requested`, `swap_accepted`, `swap_cancelled`,
`shift_assigned`, `shift_unassigned`, `shift_deleted`, `shift_cancelled`,
`nights_added`, `nights_published`,
`mentioned`,
`night_changed`, `night_deleted`, `night_cancelled`

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
| `ONESIGNAL_APP_ID`            |          | Web Push — skipped if absent             |
| `ONESIGNAL_REST_API_KEY`      |          | Web Push REST API key                    |
| `DANISH_ADDRESS_API_TOKEN`    |          | Address autocomplete proxy               |

---

## Running Migrations

Migrations live in `database/migrations/` and are **idempotent** (safe to re-run).
They must be run manually against the SQL Server container after deploying schema changes.
Latest migration: **026_club_boardgames.sql**

> **Agents must not run migrations.** Write the SQL file and inform the user — they will apply it themselves.
