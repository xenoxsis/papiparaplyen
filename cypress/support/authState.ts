/// <reference path="./index.d.ts" />

// Shared mutable state for tier-1 faux auth. The /api/auth/me intercept
// (support/e2e.ts) reads `fakeUser` at request time; cy.loginAs sets it.
// A module variable (rather than Cypress.env) keeps this test-only state out
// of the app-readable browser env and avoids the allowCypressEnv deprecation.
export const authState: { fakeUser: Cypress.AuthUser | null } = {
  fakeUser: null,
};
