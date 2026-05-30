# GDPR Compliance Tracker

> Last updated: 2026-05-10 — all issues resolved ✅

Each item references the relevant GDPR article(s) and the file(s) touched.  
Status: 🔴 TODO · 🟡 IN PROGRESS · ✅ DONE

---

## Critical — ✅ All resolved (Art. 5, 17, 20, 32, 7, 13)

| #   | Issue                                                                                                                      | Article    | File(s)                                                                                                                                    | Status  |
| --- | -------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------- |
| 1   | `GET /api/members` and `GET /api/members/:id` expose PII (name, email, joined_date, banned) to **unauthenticated callers** | Art. 5, 32 | `backend/src/routes/members.ts`                                                                                                            | ✅ DONE |
| 2   | No **right to erasure** endpoint — members cannot delete/anonymise their account                                           | Art. 17    | `backend/src/routes/auth.ts`                                                                                                               | ✅ DONE |
| 3   | No **data portability** endpoint — members cannot export their personal data                                               | Art. 20    | `backend/src/routes/auth.ts`                                                                                                               | ✅ DONE |
| 4   | Email notification prefs default to **opt-in** (`1`) without explicit consent; no consent timestamp stored                 | Art. 7     | `database/migrations/003_email_prefs.sql`, `backend/src/routes/auth.ts`, `backend/src/routes/oauth.ts`, `database/migrations/008_gdpr.sql` | ✅ DONE |
| 5   | No **privacy policy** page; no notice of data categories, legal basis, or data-subject rights                              | Art. 13    | `src/app/(site)/privacy/page.tsx`, `src/components/Footer.tsx`                                                                             | ✅ DONE |
| 6   | DB connection has `encrypt: false` — data in transit to SQL Server is unencrypted                                          | Art. 32    | `backend/src/db/index.ts`                                                                                                                  | ✅ DONE |

---

## High — ✅ All resolved (Art. 5, 7, 17, 32)

| #   | Issue                                                                                                             | Article | File(s)                                                                                         | Status  |
| --- | ----------------------------------------------------------------------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------- | ------- |
| 7   | No server-side token invalidation on logout/ban — banned users retain API access until JWT expires (up to 7 days) | Art. 32 | `backend/src/auth.ts`, `database/migrations/008_gdpr.sql`                                       | ✅ DONE |
| 8   | No **consent timestamp** — when user first agreed to email communications is not recorded                         | Art. 7  | `database/migrations/008_gdpr.sql`, `backend/src/routes/auth.ts`, `backend/src/routes/oauth.ts` | ✅ DONE |
| 9   | `password_reset_tokens` with `used = 1` are never purged — accumulate indefinitely, each tied to a `member_id`    | Art. 5  | `backend/src/scheduleEmails.ts`                                                                 | ✅ DONE |
| 10  | Notifications stored **indefinitely** with no retention enforced                                                  | Art. 5  | `backend/src/scheduleEmails.ts`                                                                 | ✅ DONE |
| 11  | Soft-deleted messages retain `body` PII — only `is_deleted = 1` is set, actual content kept in DB                 | Art. 17 | `backend/src/routes/channels.ts`                                                                | ✅ DONE |

---

## Medium — ✅ All resolved (Art. 7, 13, 32)

| #   | Issue                                                                                                                          | Article | File(s)                           | Status  |
| --- | ------------------------------------------------------------------------------------------------------------------------------ | ------- | --------------------------------- | ------- |
| 12  | Error handler logs raw error objects — may include email addresses or request bodies in server logs                            | Art. 32 | `backend/src/server.ts`           | ✅ DONE |
| 13  | OAuth-created accounts auto-enrolled in email notifications with no consent step                                               | Art. 7  | `backend/src/routes/oauth.ts`     | ✅ DONE |
| 14  | No documented legal basis for storing OAuth `provider_id` (Google/Facebook sub-identifiers)                                    | Art. 13 | `src/app/(site)/privacy/page.tsx` | ✅ DONE |
| 15  | Minimum password length is 6 characters — below recommended security threshold (GDPR Art. 32 "appropriate technical measures") | Art. 32 | `backend/src/routes/auth.ts`      | ✅ DONE |

---

## Migration

| File                               | Purpose                                                                                                            |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `database/migrations/008_gdpr.sql` | Adds `email_consent_at`, `gdpr_erasure_requested_at`, `revoked_tokens` table; changes `email_on_*` defaults to `0` |

---

## Verification Checklist

- [x] `GET /api/members` without `Authorization` cookie → `401 Unauthorized`
- [x] `DELETE /api/auth/me` → member row anonymised, email NULLed, user row deleted, messages body NULLed
- [x] `GET /api/auth/me/export` → JSON containing all personal data for calling member
- [x] New registration → `email_on_mention`, `email_on_nights`, `email_on_shift` all `0`; `email_consent_at` set to `NULL` (explicit opt-in required separately)
- [x] `/privacy` page renders and is linked from footer
- [x] DB connection uses `encrypt: true` in production
- [x] Banned user's subsequent requests → `403` on next API call (banned check in `requireAuth`)
- [x] `password_reset_tokens` with `used = 1` older than 30 days purged by scheduler
- [x] Notifications older than 90 days purged by scheduler
- [x] Deleted message has `body = NULL` in DB, not just `is_deleted = 1`
- [x] Server error logs do not print email addresses
- [x] Minimum password length enforced at 10 characters
