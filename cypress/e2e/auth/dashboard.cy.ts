describe("Member dashboard (faux auth)", () => {
  beforeEach(() => {
    cy.loginAs("Administrator");

    // Stub every endpoint the dashboard + nav touch so it renders cleanly.
    cy.intercept("GET", "**/api/club-nights*", {
      fixture: "club-nights.upcoming.json",
    }).as("nights");
    cy.intercept("GET", "**/api/schedule-reviews/me", {
      fixture: "dashboard/schedule-review.me.json",
    });
    cy.intercept("GET", "**/api/channels", {
      fixture: "dashboard/channels.json",
    });
    cy.intercept("GET", "**/api/channels/*/messages", {
      fixture: "dashboard/messages.json",
    });
    cy.intercept("GET", "**/api/channels/*/members", {
      fixture: "dashboard/channel-members.json",
    });
    cy.intercept("GET", "**/api/members/*/shifts", {
      fixture: "dashboard/member-shifts.json",
    });
    cy.intercept("GET", "**/api/notifications", {
      body: { notifications: [], unreadCount: 0 },
    });
    cy.intercept("PATCH", "**/api/notifications/read-by-link", { body: { ok: true } });
    cy.intercept("POST", "**/api/channels/*/mark-read", { body: { ok: true } });
    // SSE stream — keep it from hanging the page.
    cy.intercept("GET", "**/api/notifications/stream", { statusCode: 204, body: "" });

    cy.visit("/member/dashboard");
  });

  it("authenticates and stays on the dashboard (no redirect to /login)", () => {
    cy.wait("@me");
    cy.location("pathname").should("eq", "/member/dashboard");
    cy.contains("h2", "Klubaftener").should("be.visible");
  });

  it("renders the club-nights list from the API", () => {
    cy.wait("@nights");
    cy.contains("Strategispilsaften").should("be.visible");
  });
});
