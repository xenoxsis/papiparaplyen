// Tier 2 — real backend smoke test. Skipped unless Cypress.env("realBackend")
// is true (set in cypress.env.json). Run against `pnpm dev:local` + a seeded
// LOCAL test database (DB_NAME ending in _test). See cypress/tasks/seed.ts.
const enabled = Cypress.env("realBackend") === true;

(enabled ? describe : describe.skip)("Real login flow (smoke)", () => {
  before(() => {
    cy.task("db:seed");
  });

  after(() => {
    cy.task("db:reset");
  });

  it("logs in with seeded credentials and lands on the dashboard", () => {
    cy.loginReal(Cypress.env("realEmail"), Cypress.env("realPassword"));
    cy.location("pathname").should("eq", "/member/dashboard");
    // The real backend set the httpOnly auth cookie.
    cy.getCookie("auth_token").should("exist");
  });

  it("rejects wrong credentials with a Danish error", () => {
    cy.visit("/login");
    cy.get("input#email").type(Cypress.env("realEmail"));
    cy.get("input#password").type("definitely-wrong-password");
    cy.contains("button", "Log ind").click();
    cy.contains("Forkert e-mail eller adgangskode.").should("be.visible");
  });
});
