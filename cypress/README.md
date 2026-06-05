# Cypress E2E tests

End-to-end tests for the Pap i Paraplyen frontend (Next.js, port 3010).

## Two tiers

**Tier 1 — stubbed (default, fast, no backend).** Every public page and a
faux-authenticated dashboard run against `cy.intercept` + JSON fixtures. No
backend, DB, or secrets required — only the Next.js dev server.

**Tier 2 — real backend (smoke, opt-in).** `cypress/e2e/smoke/login.real.cy.ts`
exercises the genuine login flow (httpOnly cookie + `/api/auth/me`). Skipped
unless `realBackend` is set in `cypress.env.json`.

## Running tier 1

```bash
pnpm dev            # or pnpm dev:local, in one terminal
pnpm cypress:open   # interactive
pnpm cypress:run:stubbed   # headless, public + auth specs only
# or boot the server and run in one command:
pnpm e2e
```

> The home page (`/`) is a Server Component, so its data is fetched server-side
> and cannot be stubbed with `cy.intercept`. `home.cy.ts` asserts static copy.

## Running tier 2

1. Create a **local test database** from `database/setup.sql` + `database/migrations/`
   whose name ends in `_test` (e.g. `Paraplyen_test`). The seed task refuses to
   touch any non-`*_test` database.
2. Point `backend/.env` `DB_NAME` at that test DB and run `pnpm dev:local`
   (frontend) + the backend against the same DB.
3. `cp cypress.env.example.json cypress.env.json` and set the credentials.
4. `pnpm e2e:local`

`cypress/tasks/seed.ts` seeds/cleans only tagged rows (test email + high id
ranges), invoked via `cy.task("db:seed")` / `cy.task("db:reset")`.

## Conventions

- UI is Danish — assert on Danish text, existing `aria-label`s, and stable ids
  (`#email`, `#password`). There are no `data-testid`s.
- Custom commands live in `cypress/support/commands.ts`:
  `cy.loginAs(role)`, `cy.loginReal(email, pw)`, `cy.stubPublicApis()`,
  `cy.assertSiteChrome()`.
- One spec per page, grouped by access tier under `cypress/e2e/{public,auth,smoke}/`.
