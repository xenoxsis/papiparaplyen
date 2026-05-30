# PWA Improvements — Implementation Checklist

Covers three sub-features: offline fallback page, add-to-homescreen prompt, and background sync for chat messages.
The OneSignal worker at `/OneSignalSDKWorker.js` is **not touched** — it stays on its own scope.
The new service worker registers at `/sw.js` via `@ducanh2912/next-pwa` (Workbox-based).

---

## 1. Install & Configure next-pwa

- [ ] `pnpm add @ducanh2912/next-pwa` (prod dep; Workbox is bundled)
- [ ] Wrap the existing export in `next.config.ts` with `withPWA({ dest: "public", cacheOnFrontEndNav: true, reloadOnOnline: true, fallbacks: { document: "/offline" } })`
- [ ] Add a `runtimeCaching` entry for `GET /api/club-nights` (and `?upcoming=true`) using Workbox `NetworkFirst` strategy, 24 h expiry, cache name `"club-nights"`
- [ ] Add `public/sw.js`, `public/sw.js.map`, `public/workbox-*.js`, `public/workbox-*.js.map` to `.gitignore`
- [ ] Verify after `pnpm build`: `public/sw.js` exists and is served; Chrome DevTools → Application → Service Workers shows both `sw.js` and `OneSignalSDKWorker.js` registered

---

## 2. Offline Fallback Page

- [ ] Create `src/app/(site)/offline/page.tsx` — client component (`"use client"`)
- [ ] On mount, open the `"club-nights"` Workbox cache via `caches.open(...)` and read the cached `/api/club-nights?upcoming=true` response
- [ ] Render a list of upcoming nights (date, name, location) using the same `NightCard` component or a lightweight inline variant
- [ ] Show a banner: _"Du er offline — viser gemte data fra seneste besøg."_
- [ ] If no cache entry exists yet, show a friendly empty state: _"Ingen gemte data endnu. Besøg siden online for at aktivere offline-visning."_
- [ ] Confirm in DevTools: go offline → navigate to any page → redirects to `/offline` → cached nights render

---

## 3. iOS & Manifest Improvements

- [ ] Add to `src/app/layout.tsx` `<head>`:
  - `<meta name="apple-mobile-web-app-capable" content="yes" />`
  - `<meta name="apple-mobile-web-app-status-bar-style" content="default" />`
  - `<meta name="apple-mobile-web-app-title" content="Paraplyen" />`
  - `<link rel="apple-touch-icon" href="/papiparaplyen-logo.png" />`
- [ ] Add `"id": "/"` field to `public/manifest.json` (required by newer install prompt specs)
- [ ] Ideally provide separate 192×192 and 512×512 icon files; update `manifest.json` icons array accordingly (nice-to-have, not a blocker)

---

## 4. Add-to-Homescreen Prompt Component

Create `src/components/InstallPrompt.tsx` (client component):

- [ ] Listen for `beforeinstallprompt` event (Android/Chrome); store the deferred event in a ref
- [ ] Detect iOS: `navigator.userAgent` matches iPhone/iPad **and** `!('standalone' in navigator && navigator.standalone)`
- [ ] Show a dismissible bottom banner:
  - Android: "Tilføj Paraplyen til din hjemmeskærm" + "Installer"-knap that calls `deferredPrompt.prompt()`
  - iOS: "Tryk på Del-ikonet → 'Føj til hjemmeskærm'" with a share icon hint
- [ ] On dismiss (×-button), set `localStorage.setItem("installPromptDismissed", "1")` and hide
- [ ] On mount, read `localStorage` — skip rendering if already dismissed or already running in standalone mode (`window.matchMedia("(display-mode: standalone)").matches`)
- [ ] Mount `<InstallPrompt />` in `src/app/layout.tsx` (inside `<body>`, after other providers)

---

## 5. Background Sync for Chat Messages

### 5a. Custom SW sync handler

- [ ] Create `worker/index.ts` (next-pwa's custom worker entry — set `customWorkerSrc: "worker/index.ts"` in `withPWA` config)
- [ ] In `worker/index.ts`, register a `sync` event listener for tag `"chat-message-sync"`:
  - Open IndexedDB store `"pending-messages"`
  - For each queued record `{ channelId, body, tempId, ... }`, POST to `/api/channels/${channelId}/messages`
  - On success: delete the record from IDB
  - On failure: let the sync retry (do not swallow the error — return a rejected promise so the browser retries)

### 5b. Client-side queue hook

- [ ] Add `idb-keyval` as a dependency (`pnpm add idb-keyval`) — ~600 B, wraps IndexedDB
- [ ] Create `src/lib/useSendMessageWithSync.ts`:
  - Wraps `postMessage` from `src/lib/api.ts`
  - On network error, writes `{ channelId, body, tempId: crypto.randomUUID(), queuedAt: Date.now() }` to IDB store `"pending-messages"` via `idb-keyval`
  - Calls `navigator.serviceWorker.ready.then(sw => sw.sync.register("chat-message-sync"))` if `"SyncManager" in window`
  - Returns `{ send, pendingIds }` — `pendingIds` is a set of `tempId` values for messages not yet confirmed by server
- [ ] Show pending messages in the chat UI with a muted "Afventer netværk…" indicator (update the relevant chat send handler to use the new hook)

### 5c. Wire into chat UI

- [ ] Locate the chat send handler in `src/app/(site)/profile/ChatPanel.tsx` (or wherever `postMessage` is called)
- [ ] Replace direct `postMessage(...)` call with `useSendMessageWithSync`
- [ ] Optimistically append the message to the local message list with `status: "pending"`; on SW sync success (listen for a `sync-complete` postMessage from the SW), update status to confirmed or let the SSE stream deliver the server message naturally

---

## Verification Checklist

- [ ] `pnpm build` completes without errors; `public/sw.js` generated
- [ ] DevTools → Application → Service Workers: `sw.js` active, `OneSignalSDKWorker.js` still active independently
- [ ] DevTools → Application → Cache Storage: `club-nights` cache populated after visiting the home/events page
- [ ] DevTools → Network → Offline: navigating any page shows `/offline` with cached upcoming nights
- [ ] Android Chrome: install banner appears on second visit; tapping "Installer" triggers native prompt; app launches standalone
- [ ] iOS Safari: iOS-specific banner appears with share icon instructions
- [ ] Both banners do not reappear after dismissal (localStorage flag respected)
- [ ] Send chat message while offline → appears with pending indicator → come back online → message delivered → pending indicator clears

---

_Added: 2026-05-30_
