# Improvements & Feature Ideas

Reference document for AI agents and developers working on this codebase.

---

## Code Quality Improvements

### ✅ DONE — Decompose `profile/page.tsx` (1 900 lines)

Extracted into focused files; `page.tsx` is now ~580 lines:

- `profile/ChatPanel.tsx` — messages, input, @mention autocomplete, search, message grouping (memoized)
- `profile/ShiftsPanel.tsx` — pending shifts, next shift card, all-shifts list
- `profile/EditProfileModal.tsx` — name / password / email-prefs tabs
- `profile/SwapModal.tsx` + `profile/SwapConfirmModal.tsx` — swap request flow
- `src/components/DateBadge.tsx` — shared date tile used across all panels
- `profile/GroupChatItem.tsx` — channel list item (also fixed `<div onClick>` → `<button>`)

### ✅ DONE — Duplicated components across pages

| Pattern                             | Where                                                 | Fix                               | Status                                                                                    |
| ----------------------------------- | ----------------------------------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------- |
| Night card (date + details + badge) | `page.tsx`, `events/page.tsx`                         | Extract `<NightCard>`             | ✅ `src/components/NightCard.tsx` — `variant="card"` (grid) + `variant="row"` (list)      |
| Avatar circle (initials)            | Nav, Admin, ScheduleNightCard, VagterPanel, ChatPanel | Extract `<Avatar>`                | ✅ `src/components/MemberAvatar.tsx` created                                              |
| Search input (icon + input)         | Schedule, Admin, VagterPanel                          | Extract `<SearchInput>`           | ✅ `src/components/SearchInput.tsx` created                                               |
| Modal backdrop + close              | Profile (3x), Schedule (2x), Admin                    | Extract `<Modal>` with focus trap | ✅ Used by SwapModal, SwapConfirmModal, admin ban dialog, schedule replace/delete dialogs |
| Date badge (weekday / day / month)  | Profile page (4x)                                     | Extract `<DateBadge>`             | ✅ `src/components/DateBadge.tsx` created, used in profile + ScheduleNightCard            |

### ✅ DONE — Hardcoded colors

`#e63946`, `#2a9d8f`, `#f4a261`, `#3d5a80` replaced across all TSX/TS source files. Tokens defined via Tailwind v4 `@theme` block in `globals.css` as `--color-brand-red`, `--color-brand-teal`, `--color-brand-orange`, `--color-brand-blue`. All classes now use `bg-brand-red`, `text-brand-teal`, etc. Backend `email.ts` intentionally kept as raw hex (CSS vars don't work in email clients).

### ✅ DONE — Dual message store in profile page

`messages` and `allMessages` replaced with a single `messageMap: Record<number, ApiMessage[]>`. `messages` is now a derived constant (`messageMap[activeChannelId] ?? []`). A shared `upsertIntoMap()` helper handles SSE push, swap mutations, and polls. `pendingSwap` and the auto-refresh effect now read directly from `messageMap[2]` (channel 2) instead of scanning the full flat array.

### ✅ DONE — 30+ `useState` calls

Grouped related states with `useReducer`:

- **Swap flow** in `profile/page.tsx`: `showSwapModal`, `swapTargetShift`, `swapModalMessage`, `swapConfirmMsg` → single `useReducer` with `SwapState` / `SwapAction` (`OPEN`, `CLOSE`, `SET_MESSAGE`, `SET_CONFIRM`)
- **Edit modal** in `EditProfileModal.tsx`: `editTab`, `editName`, `editCurrentPw`, `editNewPw`, `editConfirmPw`, `editSaving`, `emailPrefs` → single `useReducer` with `EditState` / `EditAction` (`SET`, `RESET`)

### ✅ DONE — Missing `useCallback` and `useMemo`

- `handleSendMessage`, `requestSwap`, `confirmTakeSwap`, `cancelSwap` in `profile/page.tsx` wrapped in `useCallback` with correct dependency arrays
- `filteredNights` in `schedule/page.tsx` wrapped in `useMemo`; single `now` reference computed once per memo invocation

### ✅ DONE — Inconsistent error handling

- All user-triggered mutations in `profile/page.tsx`, `schedule/page.tsx` now show `toast.error` on failure
- `ClubNightModal.tsx` silent `.catch(() => {})` replaced with `toast.error("Kunne ikke hente vagtliste.")`
- Backend: `asyncRoute` wrapper added in `channels.ts` so DB errors propagate via `next(err)` to a global error handler in `server.ts` (returns `500` JSON response + logs).

### ✅ DONE — Silent `catch {}` or `catch(console.error)` in backend

`broadcastChatMessage` is now synchronous (no more `.catch()` needed). An `asyncRoute` wrapper in `channels.ts` ensures all route-handler errors call `next(err)`, which is caught by the new global error handler in `server.ts`.

### ✅ DONE — `api.ts` helpers are duplicative

Added `apiPost<T>`, `apiPatch<T>`, `apiDelete<T>` wrappers in `src/lib/api.ts`. All exported functions migrated to use them, eliminating inline `{ method, body: JSON.stringify(...) }` boilerplate.

### ✅ DONE — Separate `ClubNight` type in home page

`src/app/(site)/page.tsx` already imports `ApiClubNight` from `@/lib/api` — no local type alias exists.

### ✅ DONE — Hardcoded channel ID `2` for Vagter

Derived `vagterChannelId = channels.find(c => c.type === "vagter")?.id` (memoized) in `profile/page.tsx`. All 6 hardcoded `2` references replaced. Swap operations guard against `vagterChannelId === undefined`.

### ✅ DONE — `broadcastChatMessage` queries all members on every message

`getConnectedUserIds()` exported from `broadcaster.ts` reads live `sseClients` Map keys. `broadcastChatMessage` (now synchronous) iterates only connected users — zero DB round-trips per message.

### ✅ DONE — Broadcaster memory leak

`unregisterClient` in `broadcaster.ts` now deletes the Map entry when its Set becomes empty: `if (set.size === 0) sseClients.delete(channelKey)`.

### ✅ DONE — No `Last-Event-ID` support in SSE

Every SSE event is now assigned a monotonic `id:` field in `broadcaster.ts` (global `nextEventId` counter). Events are stored in an in-memory circular buffer (last 1 000 events across all channels). On reconnect, `EventSource` automatically sends the `Last-Event-ID` header; both stream endpoints (`/api/channels/:id/stream` and `/api/notifications/stream`) read the header and pass it to `initSseResponse()`, which replays all buffered events for that channel with `id > lastEventId` before registering the client for live events. No frontend changes required — the browser `EventSource` spec handles the header automatically.

---

## Accessibility Improvements

### ✅ DONE — Modals lack focus trap and `Escape` handling

`src/components/Modal.tsx` created with full accessibility support:

- Focus trapping (Tab cycles within modal)
- `Escape` key closes modal
- `role="dialog"` / `aria-modal="true"`
- Focus saved and restored on close

`SwapModal` and `SwapConfirmModal` use `<Modal>`. `EditProfileModal` has equivalent inline implementation. Admin ban confirmation modal and both schedule-page confirm dialogs (replace-vagt, delete night) have been converted to use `<Modal>` ✅.

### ✅ DONE — Clickable `<div>` elements

- `GroupChatItem` `<div onClick>` → `<button>` ✅ (fixed during extraction to `profile/GroupChatItem.tsx`)
- Vagt badge in `ScheduleNightCard` — added `role="button"`, `tabIndex`, `onKeyDown` and `aria-label` for admin ✅

### ✅ DONE — Toggle switches need ARIA

Email pref toggles in `EditProfileModal.tsx` now have `role="switch"`, `aria-checked`, and `aria-label`.

### ✅ DONE — Chat feed has no `aria-live`

`role="log"` and `aria-live="polite"` added to the messages container div in `ChatPanel.tsx`. New SSE messages are now announced to screen readers.

### ✅ DONE — Missing `aria-label` on icon-only buttons

- Send button → `aria-label="Send besked"` ✅ (in `ChatPanel.tsx`)
- Scroll-to-bottom button → `aria-label="Scroll til bunden"` ✅ (in `ChatPanel.tsx`)
- Edit modal close "✕" → `aria-label="Luk"` ✅ (in `EditProfileModal.tsx`)
- Hamburger menu → `aria-label="Toggle menu"` ✅ (in `Nav.tsx`)

### ✅ DONE — Missing `<label htmlFor>` on form inputs

Edit modal name/password inputs in `EditProfileModal.tsx` now have `<label htmlFor>` with matching `id` attributes. Chat input has `aria-label`. Search inputs in `admin/page.tsx`, `schedule/page.tsx`, and `VagterPanel.tsx` now have `aria-label` ✅.

### LOW — Drag-and-drop is mouse-only

`VagterPanel` drag-and-drop has no keyboard alternative for assigning shifts.

---

## Performance Improvements

### ✅ DONE — Remove redundant polling

The always-on 15-second all-channels poll in `profile/page.tsx` (which fired N `getMessages()` requests every 15 s regardless of SSE state) has been removed entirely. SSE delivers all new messages in real time, making the poll redundant. The SSE-disconnect fallback poll is retained but slowed from 3 s → **10 s** and continues to fetch the active channel only.

### ✅ DONE — `allMessages` is a flat array scanned linearly

Replaced with `messageMap: Record<number, ApiMessage[]>`. Unread badge per channel reads `messageMap[ch.id]` directly (O(channel size)). `lastSeenIds` auto-mark reads `messageMap[activeChannelId]` — O(1) instead of O(total messages). `messageSearchResults` in `ChatPanel` flattens `Object.values(messageMap)` only when the search query is active.

### ✅ DONE — IIFE message grouping in JSX

The IIFE was replaced with a `useMemo`-d `messageGroups` computation in `ChatPanel.tsx`. Message rendering is extracted into `profile/MessageGroup.tsx` — a `memo`-ized component receiving `group`, `user`, `nights`, `highlightMessageId`, `outgoingColor`, `accentColor`, and `onSwapConfirm`.

### ✅ DONE — Refetch entire list after mutations

`toggleOptOut` in `schedule/page.tsx` now applies an **optimistic in-place update** to `nights` state before the API call, rolling back to a fresh `getClubNights()` only on error. `submitReview` in `useScheduleData.ts` no longer calls `getClubNights()` at all after posting a review — review submission doesn’t mutate night data, only the review record, so only the reviews state is updated.

### ✅ DONE — Events page fetches all nights then filters client-side

Backend `GET /api/club-nights` now accepts `?upcoming=true`, which adds `WHERE n.date >= CAST(GETDATE() AS DATE)` to the SQL query (and scopes the opt-outs join to the same set). `getClubNights(upcoming?)` in `api.ts` threads the flag through. Both the events page and the home page server component now call `?upcoming=true` and skip the client-side date filter. The schedule and admin pages continue to call without the flag to get the full list.

---

## Security Improvements

### ✅ DONE — JWT moved to httpOnly cookie (XSS risk resolved)

`auth_token` is no longer stored in `localStorage`. The backend now sets it as an `httpOnly; SameSite=Strict` cookie on login, register, and OAuth callbacks. All `fetch` calls use `credentials: "include"` so the cookie travels automatically. `UserSSEContext` uses `{ withCredentials: true }` on the `EventSource`. A `POST /api/auth/logout` endpoint clears the cookie. `auth_user` (non-sensitive display data) remains in `localStorage`.

### ✅ DONE — Rate limiting added

`express-rate-limit` installed. Limits applied in `server.ts`:

- `POST /api/auth/login`, `/register`, `/forgot-password`, `/reset-password` — **10 req / 15 min** per IP
- `POST /api/channels/:id/messages` — **30 req / min** per IP (applied in `channels.ts`)
- General fallback — **100 req / min** per IP across all routes

Exceeded limits return `429` with a Danish error message.

### ✅ DONE — Superuser email removed from client bundle

`SUPERUSER_EMAIL` constant removed from `admin/page.tsx`. The backend (`routes/members.ts`) now compares against `process.env.SUPERUSER_EMAIL` and exposes an `is_superuser: boolean` field on each member in the list response. The admin UI uses `member.is_superuser` to hide role controls and show the "Beskyttet" / "🔒 Superbruger" label — the actual email never leaves the backend.

### ✅ DONE — Input sanitization on message body

`POST /api/channels/:id/messages` in `channels.ts` now validates `req.body.body` before INSERT:

- Rejects missing, non-string, or whitespace-only bodies with `400`
- Caps length at **4 000 characters** — returns `400` if exceeded
- Trims leading/trailing whitespace
- Strips null bytes (`\0`) before storing

---

## Feature Ideas

### Direct Messages (DMs)

The SSE architecture already supports this — one stream per user, events tagged by channelId. Implementation:

1. Add `type = 'dm'` channels
2. New endpoint: `POST /api/channels/dm` to create/find a DM channel between two members
3. Show DM list in chat sidebar alongside group channels
4. Reuse all existing message components

### ✅ DONE — Message Read Receipts / "Last Read" Persistence

`dbo.message_last_read` table stores `(member_id, channel_id, last_message_id, updated_at)`. Backend exposes `GET /:id/last-read` and `POST /:id/mark-read` (MERGE upsert). Frontend debounces `markChannelRead` (1.5 s) in `profile/page.tsx` whenever the active channel changes or new messages arrive.

### Message Reactions (Emoji)

Lightweight engagement feature:

- `dbo.message_reactions` table (message_id, member_id, emoji)
- Render reaction badges under messages
- Broadcast reaction events via SSE

### ✅ DONE — Message Edit & Delete

- `edited_at DATETIME2` and `is_deleted BIT` added to `dbo.messages` (migration 005)
- PATCH endpoint checks ownership; sets `edited_at = GETUTCDATE()` on body edits
- New DELETE soft-delete endpoint; broadcasts `message_deleted` SSE event
- `handleEditMessage` / `handleDeleteMessage` in `page.tsx` do optimistic updates
- `MessageGroup.tsx` shows hover pencil + trash on own messages, inline edit textarea (Escape = cancel, Enter = save), `(redigeret)` suffix, and grey italic "Besked slettet" for deleted messages

### ✅ DONE — Typing Indicators

`POST /api/channels/:id/typing` broadcasts `{ event: "typing", data: { channelId, memberId, name } }` over the per-user SSE stream. `ChatPanel.tsx` throttles `postTyping` to once per 2 s, tracks active typers with 3 s expiry, and renders bouncing dots + "X skriver…" with `aria-live="polite"`.

### File Attachments in Chat

The Paperclip button is already present (commented out). Implementation:

- Upload endpoint returning a file URL
- `attachment_url` column on messages or a separate `dbo.attachments` table
- Inline preview for images, link for other files

### ✅ DONE — Channel Last Message Preview

`GroupChatItem` `lastMsg` and `lastTime` props are now computed from `messageMap` in `ChatPanel.tsx`:

- `lastMsg` — body of the last message in `messageMap[ch.id]`; `shift_swap` messages show "📅 Vagtvagt" instead of the raw body
- `lastTime` — clock time (`HH:MM`) for today, abbreviated weekday for within 7 days, `d/m` for older
- Updates live when SSE pushes a new message (no extra fetches)

### ✅ DONE — Loading / Skeleton States

All data-fetching pages now show pulse skeleton placeholders instead of blank screens or premature "Ingen…" empty states:

- `src/components/ui/skeleton.tsx` — base `<Skeleton>` primitive using Tailwind `animate-pulse`
- `src/components/NightCardSkeleton.tsx` — mimics `NightCard` in both `card` and `row` variants
- `src/app/(site)/events/page.tsx` — `loading` boolean added; shows 4 `NightCardSkeleton` items while fetching; "Ingen…" empty state only shown after load completes
- `src/app/(site)/member/schedule/ScheduleNightCard.tsx` — `ScheduleNightCardSkeleton` exported
- `src/app/(site)/member/schedule/useScheduleData.ts` — `loading` state exposed in return value
- `src/app/(site)/member/schedule/page.tsx` — shows 6 `ScheduleNightCardSkeleton` items while `scheduleLoading` is true
- `src/app/(site)/member/admin/page.tsx` — shows 6 skeleton table rows (avatar circle + text lines) while fetching members
- `src/app/(site)/member/profile/ShiftsPanel.tsx` — optional `loading` prop; renders 3 skeleton shift cards when true
- `src/app/(site)/member/profile/ChatPanel.tsx` — optional `loading` prop; renders skeleton channel list rows in sidebar and 5 skeleton message bubbles in message area
- `src/app/(site)/member/profile/page.tsx` — `loading` state controls all initial fetches via `Promise.all`; passed to `<ShiftsPanel>` and `<ChatPanel>`

### Calendar Page — Event Detail View

The calendar page exists but has limited interactivity. Allow clicking a date to see full event details and RSVP (for future public events).

### Mobile Chat Experience

Chat is crammed into a small column on mobile. Consider:

- Full-screen chat view when a channel is selected (hide sidebar)
- Swipe gesture to return to channel list
- The channel drawer already exists but could be improved with last-message preview

### Notification Preferences — Per-Type Toggle for In-App Notifications

Currently only email preferences are toggleable. Some users might want to mute in-app notifications for certain types (e.g., swap_requested) while keeping others.

### Admin Dashboard Stats

Replace hardcoded homepage stats with real data:

- Total members count
- Total games played (if tracked)
- Active club nights count
- Member growth over time chart

### Dark Mode

The site uses `bg-neutral-900` for the hero and header — a system-preference-aware dark mode would be a natural extension.

### Auto-expire Password Reset Tokens

The `password_reset_tokens` table stores expired/used tokens indefinitely. Add a scheduled cleanup job.

### Notification Cleanup

`dbo.notifications` grows unbounded. Consider:

- Auto-delete read notifications older than 90 days
- Archive or soft-delete pattern
- Backend scheduled job via `node-cron`

### Export Schedule to iCal

Allow Vagter to export their assigned shifts as an `.ics` file for integration with Google Calendar / Outlook.

---

## Database Schema Notes

- ✅ DONE — `dbo.messages`: `IX_messages_channel_sent` on `(channel_id, sent_at)` added in `database/migrations/004_add_indexes.sql`.
- ✅ DONE — `dbo.notifications`: `IX_notifications_member` on `(member_id, created_at DESC)` added in `database/migrations/004_add_indexes.sql`.
- `dbo.club_nights.time_from` and `time_to` are stored as `NVARCHAR(5)` instead of `TIME`. This works but prevents time-based SQL queries.
- `dbo.password_reset_tokens` has no index on `expires_at` for cleanup queries.
- `dbo.users.email` is `UNIQUE` but `dbo.members.email` is also `UNIQUE` — the same email constraint exists in two tables. Since login looks up via `members.email`, the `users.email` column is effectively redundant (they're set to the same value on insert).
