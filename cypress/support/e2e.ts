import "./commands";

// Start each test from a clean slate so a stubbed/real session from one test
// can't leak into the next.
beforeEach(() => {
  cy.clearLocalStorage();
  cy.clearCookies();
});

// The app pings OneSignal and opens an SSE connection (/api/notifications/stream).
// In tests those are stubbed or simply unavailable; their errors are unrelated
// to what we're asserting, so don't let them fail the run.
Cypress.on("uncaught:exception", () => false);
