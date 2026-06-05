import "./commands";
import { authState } from "./authState";

// Start each test from a clean slate so a stubbed/real session from one test
// can't leak into the next.
beforeEach(() => {
  cy.clearLocalStorage();
  cy.clearCookies();
  authState.fakeUser = null;

  // Tier 1 runs with no backend, so AuthProvider's GET /api/auth/me would be
  // proxied to a non-running backend (noisy ECONNREFUSED). One intercept owns
  // /me: it returns the faux user set by cy.loginAs (read at request time, so
  // there's no intercept-precedence ambiguity) or 401 (logged out) by default.
  // Skipped for tier-2 (real backend), where the genuine /me response is needed.
  // cy.env() (not Cypress.env()) is used because allowCypressEnv is disabled;
  // it takes an array of keys and returns a map.
  cy.env(["realBackend"]).then((env) => {
    if (env.realBackend !== true) {
      cy.intercept("GET", "**/api/auth/me", (req) => {
        req.reply(
          authState.fakeUser
            ? { statusCode: 200, body: authState.fakeUser }
            : { statusCode: 401, body: {} },
        );
      }).as("me");
    }
  });
});

// The app pings OneSignal and opens an SSE connection (/api/notifications/stream).
// In tests those are stubbed or simply unavailable; their errors are unrelated
// to what we're asserting, so don't let them fail the run.
Cypress.on("uncaught:exception", () => false);
