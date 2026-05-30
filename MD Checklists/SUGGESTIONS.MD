# Suggestions

Ideas for new features and enhancements to the Pap i Paraplyen member portal.

---

## New Features

### 1. Event RSVP / Attendance Tracking

Allow members to indicate whether they plan to attend a club night. This gives organizers a headcount in advance and helps with planning.

- Add an `rsvp` column or separate `dbo.rsvps` table (`member_id`, `club_night_id`, `status`: attending/maybe/not attending)
- Show attendee count on `NightCard` and the calendar
- Optional reminder notification 24h before the event for members who haven't responded
- Post-event: mark actual attendance for historical stats

### 2. Board Game Ratings & Play Logging

Extend the existing board game collection page with member engagement:

- **Rate games** — 1–5 star rating per member; show average rating on game cards
- **Log plays** — record which games were played on which club night, with which members
- **"Want to play" list** — members mark games they'd like to try; surface popular requests on the events page
- **Game suggestions for tonight** — based on player count of confirmed attendees, surface games that fit

### 3. Board Game Reservation / Bring Request

- Members can request that someone brings a specific game to the next club night
- Owner of the game gets a notification
- Shows a "requested games" list on the upcoming night detail

### 4. Member Achievements / Gamification

Light gamification to encourage participation:

- Badges for milestones (e.g., "10 vagter", "First message", "50 games played")
- "Most active" leaderboard (opt-in) based on attendance streak
- Profile section showing earned badges

### 5. Photo Gallery

- Upload photos from club nights
- Gallery view per event or chronological feed
- Members can tag who's in the photo
- GDPR: require consent before tagging, allow members to request removal

### 6. Polls & Voting

- Create quick polls in chat or as standalone items (e.g., "Which game should we play next week?")
- Anonymous or named voting
- Auto-close after deadline
- Results visible in chat or on event page

### 7. Recurring Events / Season Planner

- Admin can generate a full season of club nights in one action (e.g., every other Wednesday for 6 months)
- Draft mode already exists — combine with bulk creation
- Visual season overview timeline

### 8. Guest Pass System

- Members can register a guest for a specific night
- Guest gets a temporary link with event info (no login required)
- Track guest attendance for potential new-member onboarding

### 9. Public Waitlist / Sign-up Page

- If the club has limited capacity, allow a public waitlist for people interested in joining
- Admin can review and invite from the waitlist

---

## Enhancements to Existing Features

### 10. Calendar — Show Club Nights & Game Details

The calendar currently shows only day numbers. Enhance it to:

- Highlight dates that have scheduled club nights (dot indicator or colored background)
- Click a date to see event details (time, location, assigned vagter, attendee count)
- Show Danish public holidays (the `date-holidays` package is already a dependency)

### 11. Chat — Threaded Replies

- Allow replying to a specific message (quote-reply style)
- Show reply context above the new message
- Useful for busy channels where conversations overlap

### 12. Chat — Pinned Messages

- Admins/vagter can pin important messages in a channel
- Pinned messages shown in a collapsible banner at the top
- Good for rules, recurring info, or event reminders

### 13. Chat — File & Image Sharing

The attachment button is already commented out in the UI. Complete the implementation:

- Upload images/files via a dedicated endpoint
- Inline image preview in chat
- File size limits and type restrictions
- GDPR: include attachments in data export

### 14. Schedule — Shift Preference / Availability

- Members can mark dates they're available or unavailable (beyond the current opt-out)
- Admin sees availability when assigning shifts
- Auto-assign algorithm respects preferences
- "I prefer early/late shifts" setting per member

### 15. Schedule — Shift Statistics

- Show each member's total shifts this season vs. average
- Fairness indicator — highlight members who are over/under the average
- Historical graph of shifts per member over time

### 16. Schedule — Swap Marketplace

Expand the existing swap-request feature:

- A dedicated "open swaps" board visible to all members
- Members post shifts they want to give away
- Others can claim directly without back-and-forth
- Auto-notifications to eligible members

### 17. Notifications — Push Notification Preferences

OneSignal is already integrated. Add granular controls:

- Per-type toggles (shift reminders, chat mentions, swap requests, event reminders)
- Quiet hours setting (no push between e.g. 22:00–08:00)
- Digest mode — batch non-urgent notifications into a daily summary

### 18. Profile — Activity Feed

- Show a personal timeline of recent activity (shifts worked, messages sent, games played)
- Visible only to the member themselves
- Useful for tracking personal engagement

### 19. Admin — Bulk Operations

- Select multiple members for batch actions (role change, send message, export)
- Bulk-create club nights from a CSV or date range
- Bulk-assign shifts using the auto-assign algorithm

### 20. Admin — Analytics Dashboard

Replace any hardcoded stats with real data:

- Member growth chart over time
- Average attendance per night
- Most active chat channels
- Popular games (if play logging is added)
- Shift distribution fairness chart

### 21. Dark Mode

The site already uses dark tones in header/hero sections. Extend to a full system-preference-aware dark mode:

- CSS custom properties already exist via Tailwind `@theme` — add dark variants
- Toggle in user settings or auto-detect via `prefers-color-scheme`
- Persist preference in `localStorage`

### 22. PWA Improvements

`manifest.json` and the OneSignal service worker already exist. Enhance the PWA experience:

- Offline fallback page (show cached upcoming events)
- Add-to-homescreen prompt on mobile
- Background sync for chat messages composed offline

### 23. Multi-language Support (i18n)

The site is currently Danish-only. For inclusivity:

- Extract all UI strings to a translation file
- Support Danish (default) and English
- Language toggle in footer or user settings
- Keep backend error messages language-aware

### 24. Location Map Integration

The `locations` table and address autocomplete already exist. Add:

- Embedded map on event detail showing the venue location
- Directions link (Google Maps / Apple Maps)
- "Nearest club night to me" feature using browser geolocation

### 25. iCal Subscription Feed

The `ical_token` column already exists (migration 017). Extend to:

- Personal iCal feed URL with all assigned shifts
- Club-wide public iCal feed for all upcoming club nights
- Auto-update when events change (standard iCal polling)

---

## Quality of Life

### 26. Onboarding Flow for New Members

- Step-by-step welcome wizard after first login
- Set avatar, notification preferences, browse game collection
- Short tour of key features (chat, schedule, vagter)

### 27. Keyboard Shortcuts

- `Ctrl+K` — quick search (members, games, channels)
- `Escape` — close modals (already done)
- Arrow keys for navigating schedule grid on desktop

### 28. Email Digest

- Weekly summary email: upcoming nights, your shifts, unread messages count
- Configurable frequency (daily/weekly/off)
- Respects existing email consent preferences

### 29. Maintenance Mode

- Admin toggle to put the site in read-only mode during maintenance
- Shows a banner to all users
- Disables mutations (shift changes, chat messages) temporarily

### 30. Export & Reporting

- Admin can export member list, attendance data, or shift history as CSV
- Schedule printable view (PDF-friendly layout)
- Annual report generation with key stats

---

## Technical Suggestions

### 31. WebSocket Upgrade Path

SSE works well but is unidirectional. If real-time features grow (typing indicators, presence, reactions), consider migrating to WebSockets for bidirectional communication and reduced connection overhead.

### 32. Image Optimization Pipeline

If photo gallery or file attachments are added:

- Resize and compress uploads server-side (sharp)
- Serve responsive images with `next/image`
- Store in object storage (S3/Azure Blob) rather than local disk

### 33. End-to-End Tests

- Add Playwright or Cypress for critical user flows (login, schedule shift, send message)
- Run in CI before deploy
- Catch regressions in the full-stack interaction

### 34. API Documentation

- Auto-generate OpenAPI/Swagger docs from route definitions
- Useful for future mobile app development or third-party integrations
- Interactive API explorer for developers

---

*Last updated: 2026-05-29*
