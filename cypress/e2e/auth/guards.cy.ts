// Auth/role redirects enforced by useRequireAuth (src/lib/useRequireAuth.ts).
describe("Route guards", () => {
  it("redirects an unauthenticated visitor from a protected page to /login", () => {
    // No session — make the silent /me check resolve as logged-out.
    cy.intercept("GET", "**/api/auth/me", { statusCode: 401, body: {} }).as("me");
    cy.visit("/member/dashboard");
    cy.location("pathname", { timeout: 10000 }).should("eq", "/login");
  });

  it("redirects a non-admin away from the admin page to the dashboard", () => {
    cy.loginAs("Medlem");
    // Dashboard fetches the nav needs so the redirect target renders cleanly.
    cy.intercept("GET", "**/api/club-nights*", { body: [] });
    cy.intercept("GET", "**/api/schedule-reviews/me", { body: null });
    cy.intercept("GET", "**/api/channels", { body: [] });
    cy.intercept("GET", "**/api/members/*/shifts", { body: [] });
    cy.intercept("GET", "**/api/notifications", {
      body: { notifications: [], unreadCount: 0 },
    });
    cy.intercept("GET", "**/api/notifications/stream", { statusCode: 204, body: "" });

    cy.visit("/member/admin");
    cy.location("pathname", { timeout: 10000 }).should("eq", "/member/dashboard");
  });
});
