// Tier 2 — real backend smoke test. Skipped unless cy.env(["realBackend"])
// is true (set in cypress.env.json). Run against `pnpm dev:local` + a seeded
// LOCAL test database (DB_NAME ending in _test). See cypress/tasks/seed.ts.
// Uses cy.env() (not Cypress.env()) because allowCypressEnv is disabled; it
// takes an array of keys and returns a map.
describe("Real login flow (smoke)", () => {
  before(function () {
    cy.env(["realBackend"]).then((env) => {
      if (env.realBackend !== true) {
        this.skip();
      } else {
        cy.task("db:seed");
      }
    });
  });

  after(() => {
    cy.env(["realBackend"]).then((env) => {
      if (env.realBackend === true) cy.task("db:reset");
    });
  });

  it("logs in with seeded credentials and lands on the dashboard", () => {
    cy.env(["realEmail", "realPassword"]).then((env) => {
      cy.loginReal(env.realEmail, env.realPassword);
    });
    cy.location("pathname").should("eq", "/member/dashboard");
    // The real backend set the httpOnly auth cookie.
    cy.getCookie("auth_token").should("exist");
  });

  it("rejects wrong credentials with a Danish error", () => {
    cy.env(["realEmail"]).then((env) => {
      cy.visit("/login");
      cy.get("input#email").type(env.realEmail);
      cy.get("input#password").type("definitely-wrong-password");
      cy.get('form button[type="submit"]').click();
      cy.contains("Forkert e-mail eller adgangskode.").should("be.visible");
    });
  });
});
