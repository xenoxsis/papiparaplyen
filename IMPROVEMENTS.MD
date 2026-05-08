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

### MEDIUM — Dual message store in profile page

`messages` and `allMessages` are kept in sync manually across SSE push, poll, and swap operations. Replace with a single `Record<channelId, ApiMessage[]>` with a derived view for the active channel.

### MEDIUM — 30+ `useState` calls

Group related states with `useReducer`:

- Edit modal: `editTab`, `editName`, `editCurrentPw`, `editNewPw`, `editConfirmPw`, `editSaving`, `emailPrefs`
- Swap flow: `showSwapModal`, `swapTargetShift`, `swapModalMessage`, `swapConfirmMsg`
- Mention: `mentionQuery`, `mentionIndex`, `channelMembers`

### MEDIUM — Missing `useCallback` and `useMemo`

- `sendMessage`, `requestSwap`, `confirmTakeSwap`, etc. re-create every render
- `messageSearchResults` is computed every render even when search is closed
- `Math.max(0, ...allMessages.filter(...))` runs per channel per render (O(channels × messages))
- `filteredNights` in schedule page calls `new Date()` on every render

### MEDIUM — Inconsistent error handling

Some operations show `toast.error`, most silently `console.error`. Standardize: user-facing actions should always toast on failure. Network fetches that populate lists should show an error state or retry button.

### MEDIUM — Silent `catch {}` or `catch(console.error)` in backend

`broadcaster.ts` heartbeat, `channels.ts` broadcastChatMessage — should at minimum log for monitoring. Consider a shared `logError()` utility.

### LOW — `api.ts` helpers are duplicative

Create `apiPost`, `apiPatch`, `apiDelete` wrappers around the generic `api<T>()` to reduce boilerplate and enforce correct `Content-Type` only when a body is present.

### LOW — Separate `ClubNight` type in home page

`src/app/(site)/page.tsx` defines its own `ClubNight` type instead of importing `ApiClubNight`. Consolidate.

### LOW — Hardcoded channel ID `2` for Vagter

The swap workflow hardcodes channel ID `2` in multiple places. Query for the channel by `type === "vagter"` instead.

### LOW — `broadcastChatMessage` queries all members on every message

In `channels.ts`, every POST/PATCH queries all non-banned members to broadcast. Cache the member list or maintain a connected-user set from SSE registrations.

### LOW — Broadcaster memory leak

Empty `Set` entries in `sseClients` are never removed when all clients disconnect. Add cleanup in `unregisterClient`.

### LOW — No `Last-Event-ID` support in SSE

If a client disconnects briefly, it misses events with no way to catch up. Consider storing a sequence ID per event.

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

### HIGH — Remove redundant polling

Active channel gets updates via SSE **and** a 3-second poll **and** a 15-second all-channels poll. With the new single-SSE architecture, the per-channel 3-second poll can be removed entirely. The 15-second all-channels poll can be reduced to a much longer interval (or removed — just fetch on channel switch).

### MEDIUM — `allMessages` is a flat array scanned linearly

Replace with `Map<channelId, ApiMessage[]>` for O(1) channel lookups instead of repeated `.filter()`.

### ✅ DONE — IIFE message grouping in JSX

The IIFE was replaced with a `useMemo`-d `messageGroups` computation in `ChatPanel.tsx`. Message rendering is extracted into `profile/MessageGroup.tsx` — a `memo`-ized component receiving `group`, `user`, `nights`, `highlightMessageId`, `outgoingColor`, `accentColor`, and `onSwapConfirm`.

### MEDIUM — Refetch entire list after mutations

`toggleOptOut`, `confirmShift`, `optOut` all refetch the complete club nights list. Use optimistic updates or targeted re-fetch.

### LOW — Events page fetches all nights then filters client-side

Add a query parameter `?upcoming=true` to the backend endpoint.

---

## Security Improvements

### MEDIUM — JWT in localStorage (XSS risk)

`auth_token` is stored in `localStorage`. Any XSS vulnerability exposes it. Consider `httpOnly` cookie approach for the JWT.

### MEDIUM — No rate limiting

No rate limiting on login, password reset, message send, or SSE connections. Express middleware like `express-rate-limit` would help.

### LOW — Superuser email exposed client-side

`SUPERUSER_EMAIL` is hardcoded in `admin/page.tsx`. The protection is already enforced server-side in `members.ts`, but the client-side constant leaks the superuser's email. Remove the client-side check or use a server-returned flag.

### LOW — No input sanitization on message body

Chat message bodies are stored raw. While React escapes HTML on render, consider sanitizing or length-limiting on the backend.

---

## Feature Ideas

### Direct Messages (DMs)

The SSE architecture already supports this — one stream per user, events tagged by channelId. Implementation:

1. Add `type = 'dm'` channels
2. New endpoint: `POST /api/channels/dm` to create/find a DM channel between two members
3. Show DM list in chat sidebar alongside group channels
4. Reuse all existing message components

### Message Read Receipts / "Last Read" Persistence

Currently `lastSeenIds` is in-memory and resets on page reload. Store `last_read_message_id` per user per channel in the DB. This also enables proper unread counts.

### Message Reactions (Emoji)

Lightweight engagement feature:

- `dbo.message_reactions` table (message_id, member_id, emoji)
- Render reaction badges under messages
- Broadcast reaction events via SSE

### Message Edit & Delete

Users can't edit or correct typos in chat messages. Implementation:

- `edited_at` column on `dbo.messages`
- PATCH endpoint already exists — add owner check
- Show "(redigeret)" indicator
- Soft-delete with `deleted_at` column

### Typing Indicators

Broadcast `{ event: "typing", data: { channelId, memberId, name } }` through the user SSE stream. Show "X is typing…" in the chat input area.

### File Attachments in Chat

The Paperclip button is already present (commented out). Implementation:

- Upload endpoint returning a file URL
- `attachment_url` column on messages or a separate `dbo.attachments` table
- Inline preview for images, link for other files

### Channel Last Message Preview

`GroupChatItem` already accepts `lastMsg` and `lastTime` props but they're always `""`. Compute from `allMessages` or store the last message when broadcasting.

### Loading / Skeleton States

All data-fetching pages show either nothing or "Ingen…" during loading. Add:

- Pulse/skeleton loaders for shift cards, night cards, channel list, message list
- Spinner overlays for mutation actions (swap, confirm, save)

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
