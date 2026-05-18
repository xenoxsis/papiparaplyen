# Security & Code Review — Paraplyen

**Date:** 2026-05-18  
**Reviewer:** Senior Web Developer (AI-assisted)  
**Scope:** Full codebase (`backend/`, `src/`, `database/`)

---

## Summary

The codebase is generally well-structured with good foundations: parameterised SQL everywhere (no SQL-injection risk), bcrypt password hashing, httpOnly/sameSite-strict JWT cookies, rate limiting on auth endpoints, and a real-time ban check in `requireAuth`. The issues below are ranked by severity.

---

## Critical

### 1. ✅ FIXED — `sender_id` is client-controlled — message impersonation

**File:** `backend/src/routes/channels.ts`, lines ~232, 265, 301  
**OWASP:** A01 Broken Access Control

`POST /api/channels/:id/messages` accepts `sender_id` from the request body:

```ts
.input("senderId", sql.Int, req.body.sender_id ?? null)
```

Any authenticated user can post a chat message with any `sender_id`, making their message appear to come from a different member. The correct sender is already available from the JWT: `res.locals.jwt.memberId`.

**Fix:** Replace `req.body.sender_id` with the authenticated caller's ID:

```ts
const senderId = (res.locals.jwt as { memberId: number }).memberId;
.input("senderId", sql.Int, senderId)
```

The same fix applies to the mention-parsing block and the swap notification block on the same route.

---

### 2. ✅ FIXED — `swap_status` / `taken_by_member_id` can be patched by any authenticated user (IDOR)

**File:** `backend/src/routes/channels.ts` — `PATCH /:channelId/messages/:messageId`  
**OWASP:** A01 Broken Access Control

The comment in the code reads _"swap_status patches are system-internal (any authed user)"_, but any authenticated user can call this endpoint and change the `swap_status` or `taken_by_member_id` on **any** message in any channel. This lets a user accept or cancel another user's shift-swap request without permission.

**Fix:** Add authorisation checks:

- `swap_status = "taken"` → only the user setting themselves as `taken_by_member_id` should be allowed.
- `swap_status = "cancelled"` → only the original sender (owner) should be allowed.
- Admin may override both.

---

### 3. ✅ FIXED — Password-reset token stored in the audit log

**File:** `backend/src/routes/auth.ts` — `POST /api/auth/forgot-password`  
**OWASP:** A02 Cryptographic Failures / A09 Security Logging Failures

The full `resetUrl` (which contains the live reset token) is persisted in `dbo.audit_log.detail`:

```ts
logEvent({
  eventType: "email.password_reset",
  detail: {
    subject: "...",
    html: resetHtml, // resetHtml contains the raw resetUrl with the token
  },
});
```

Anyone who gains read access to the audit log (currently only the superuser, but the DB row is permanent) can extract a valid reset token and take over any account until the token expires.

**Fix:** Remove `html` from the detail payload. Log only non-sensitive metadata:

```ts
detail: { subject: "Nulstil din adgangskode — Esbjerg Brætspil", tokenExpiry: expiresAt }
```

The same issue exists for the `oauth_account_notice` audit event — remove `html` there too.

---

## High

### 4. ✅ FIXED — No HTTP security headers (missing `helmet`)

**File:** `backend/src/server.ts`  
**OWASP:** A05 Security Misconfiguration

The Express server does not set any security-related HTTP response headers. Headers such as `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Strict-Transport-Security`, and `Permissions-Policy` are absent, leaving the app vulnerable to clickjacking, MIME sniffing, and other browser-level attacks.

**Fix:** Install and apply `helmet` before other middleware:

```ts
import helmet from "helmet";
app.use(helmet());
```

---

### 5. ✅ FIXED — No access gate on `POST /api/channels/:id/messages` for the vagter channel

**File:** `backend/src/routes/channels.ts`  
**OWASP:** A01 Broken Access Control

`GET /api/channels/:id/messages` and `GET /api/channels/:id/members` both check channel type and reject users without the Vagt/Administrator/Tilskuer role. However, `POST /api/channels/:id/messages` performs **no channel-type check** — any authenticated user who knows the vagter channel's ID can post to it.

**Fix:** Add the same role-gate used by the read endpoints at the top of the POST handler.

---

### 6. ✅ FIXED — `GET /api/channels/:id/members` returns ALL members, not channel members

**File:** `backend/src/routes/channels.ts`  
**OWASP:** A01 Broken Access Control

The SQL query in this endpoint ignores the `channelId` parameter completely:

```sql
SELECT m.id, m.name, m.initials
FROM dbo.members m
LEFT JOIN dbo.users u ON u.member_id = m.id
WHERE ISNULL(u.banned, 0) = 0
ORDER BY m.name
```

It returns every non-banned member in the system regardless of channel membership. This is both a logic bug and an information-disclosure issue.

**Fix:** Join through `dbo.channel_members`:

```sql
SELECT m.id, m.name, m.initials
FROM dbo.members m
JOIN dbo.channel_members cm ON cm.member_id = m.id
LEFT JOIN dbo.users u ON u.member_id = m.id
WHERE cm.channel_id = @channelId
  AND ISNULL(u.banned, 0) = 0
ORDER BY m.name
```

---

## Medium

### 7. `messageLimiter` uses a different (less accurate) IP key than all other rate limiters

**File:** `backend/src/routes/channels.ts`  
**OWASP:** A04 Insecure Design

All rate limiters in `server.ts` use the custom `rateLimitKey` function that normalises IPv4+port addresses (e.g. `1.2.3.4:5678 → 1.2.3.4`). The `messageLimiter` defined in `channels.ts` uses the default Express key generator, so the IPv4 normalisation is skipped. Behind a reverse proxy this can cause rate-limit keys to differ per port, making per-IP limiting ineffective.

**Fix:** Import and apply `rateLimitKey` (or move the limiter to `server.ts`):

```ts
import { rateLimitKey } from "../server"; // export the function
const messageLimiter = rateLimit({ ..., keyGenerator: rateLimitKey });
```

---

### 8. ✅ FIXED — `SUPERUSER_EMAIL` defaults to the string `"REDACTED"` in `members.ts`

**File:** `backend/src/routes/members.ts`, line 8  
**OWASP:** A05 Security Misconfiguration

```ts
const SUPERUSER_EMAIL = process.env.SUPERUSER_EMAIL ?? "REDACTED";
```

If the environment variable is not set, the superuser guard `mapMember` will mark any member with the literal email `redacted` as `is_superuser: true`. This is also inconsistent with all other files which default to `""`. Defaulting to `""` is safe because an empty string can never match a real email.

**Fix:**

```ts
const SUPERUSER_EMAIL = (process.env.SUPERUSER_EMAIL ?? "").toLowerCase();
```

---

### 9. ✅ FIXED — HTML email templates interpolate values without HTML-encoding

**File:** `backend/src/email.ts`  
**OWASP:** A03 Injection

`oauthAccountEmailHtml(provider)` inserts the provider name directly into an HTML string:

```ts
<p>Din konto bruger <strong>${providerName}</strong> login</p>
```

`providerName` is derived from the database value `op.provider`. If a future OAuth provider is registered with a name containing `<script>` or similar characters, email clients that render HTML could be affected. The same pattern exists in `resetPasswordEmailHtml(resetUrl)` — the URL is interpolated directly into `href`.

**Fix:** HTML-encode user-derived values before interpolating into email HTML, or use a templating library that auto-escapes.

---

### 10. ✅ FIXED — Global JSON body limit of 5 MB

**File:** `backend/src/server.ts`, line ~35  
**OWASP:** A04 Insecure Design / DoS

```ts
app.use(express.json({ limit: "5mb" }));
```

A 5 MB limit is unnecessarily large for an API that mostly exchanges small JSON payloads. Only the boardgames CSV upload legitimately needs a large body. Authenticated users can repeatedly send 5 MB requests, potentially straining memory.

**Fix:** Set the global limit low (e.g. `"100kb"`) and apply a higher limit only to the upload route:

```ts
app.use(express.json({ limit: "100kb" }));
// in boardgames router:
router.post("/upload", requireAuth, express.json({ limit: "5mb" }), async (req, res) => { ... });
```

---

### 11. ✅ FIXED — `name` field in `PATCH /api/auth/me` has no maximum-length validation

**File:** `backend/src/routes/auth.ts`  
**OWASP:** A03 Injection (input validation)

The endpoint validates that `name` is a non-empty string and trims it, but does not enforce a maximum length. While the MSSQL column definition will ultimately reject overlong values with an error, this should be caught at the application layer with a clear error response rather than an unhandled DB exception.

**Fix:**

```ts
if (trimmedName.length > 100) {
  return res.status(400).json({ error: "name must be at most 100 characters" });
}
```

---

## Low / Informational

### 12. In-process SSE event replay buffer is not cluster-safe

**File:** `backend/src/broadcaster.ts`  
**OWASP:** A04 Insecure Design (availability)

The `eventBuffer` and `sseClients` structures are plain in-process variables. In a multi-worker deployment (e.g. PM2 cluster mode, as configured in `ecosystem.config.cjs`) each worker maintains its own isolated buffer and client list. A client reconnecting to a different worker will not receive missed events and will not receive live broadcasts from activity on other workers.

This is not a security issue but is a correctness/availability concern. A shared pub/sub layer (Redis) would be required to support clustering.

---

### 13. No explicit CSRF protection (mitigated by `sameSite: "strict"`)

**File:** `backend/src/auth.ts`  
**OWASP:** A01 Broken Access Control

There is no CSRF token middleware. This is substantially mitigated because the auth cookie is set with `sameSite: "strict"`, which modern browsers will not send on cross-site requests. However, if the application ever needs to support cross-origin requests with credentials, or if running on a subdomain shared with a less-trusted application, a proper CSRF token should be added.

---

### 14. Unauthenticated endpoints expose member-related data

**Files:** `backend/src/routes/club-nights.ts` (GET /api/club-nights), `backend/src/routes/boardgames.ts` (GET /api/boardgames)

These endpoints intentionally serve public data but they expose member names/initials and assigned shift information. If this is unintentional (e.g. the club wants a member-only site), these endpoints should be protected with `requireAuth`.

---

### 15. `db/index.ts` exposes flat-file `writeTable` helper in the production bundle

**File:** `backend/src/db/index.ts`

The `readTable` and `writeTable` helpers that write JSON files to disk are exported from the main DB module and are compiled into the production bundle. They are documented as "migration scripts only". If accidentally called from production code, they write to the filesystem under `__dirname`. Consider moving them to a separate migration-only module that is not imported by `server.ts`.

---

## Positive Findings

The following security practices were correctly implemented and deserve recognition:

- All SQL queries use parameterised inputs (`mssql` named parameters) — no SQL injection risk found anywhere.
- Passwords are hashed with `bcrypt` at cost factor 12.
- Auth cookie is `httpOnly`, `sameSite: "strict"`, `secure` in production.
- `requireAuth` performs a real-time ban check on every request.
- Rate limiting is applied to all auth endpoints (login, register, forgot-password, reset-password).
- `forgot-password` always returns `{ ok: true }` to prevent user enumeration.
- Admin-only and superuser-only routes use both JWT role checks and DB-level verification.
- Audit logging covers all sensitive events including login failures, password resets, and membership changes.
- Message body is length-capped (4000 chars) and null-byte stripped before storage.
- The global error handler scrubs email addresses from error messages before logging.
