/// <reference types="cypress" />
/// <reference path="./index.d.ts" />

const FAKE_USERS: Record<Cypress.RoleName, Cypress.AuthUser> = {
  Administrator: {
    id: 700,
    name: "Test Admin",
    initials: "TA",
    roles: ["Administrator", "Vagt"],
    is_superuser: false,
    has_avatar: false,
  },
  Vagt: {
    id: 701,
    name: "Test Vagt",
    initials: "TV",
    roles: ["Vagt"],
    is_superuser: false,
    has_avatar: false,
  },
  Medlem: {
    id: 702,
    name: "Test Medlem",
    initials: "TM",
    roles: ["Medlem"],
    is_superuser: false,
    has_avatar: false,
  },
  Tilskuer: {
    id: 703,
    name: "Test Tilskuer",
    initials: "TT",
    roles: ["Tilskuer"],
    is_superuser: false,
    has_avatar: false,
  },
};

// Fake auth without a backend. AuthProvider authenticates from GET /api/auth/me
// on mount, so stubbing /me with a 200 user is what actually establishes the
// session (useRequireAuth doesn't redirect while the auth check is loading).
// We additionally seed localStorage["auth_user"] on the NEXT page load — via a
// one-shot window:before:load hook — so the app hydrates without a flash, the
// same way a real session does. Call BEFORE cy.visit().
Cypress.Commands.add(
  "loginAs",
  (role: Cypress.RoleName, overrides?: Partial<Cypress.AuthUser>) => {
    const user: Cypress.AuthUser = { ...FAKE_USERS[role], ...overrides };
    cy.intercept("GET", "**/api/auth/me", {
      statusCode: 200,
      body: user,
    }).as("me");

    const seed = (win: Window) => {
      win.localStorage.setItem("auth_user", JSON.stringify(user));
      Cypress.removeListener("window:before:load", seed);
    };
    Cypress.on("window:before:load", seed);

    return cy.wrap(user, { log: false });
  },
);

// Real login through the app's own form, so cookie flags/domain match prod.
Cypress.Commands.add("loginReal", (email: string, password: string) => {
  cy.visit("/login");
  cy.get("input#email").clear().type(email);
  cy.get("input#password").clear().type(password, { log: false });
  cy.contains("button", "Log ind").click();
  cy.location("pathname", { timeout: 15000 }).should(
    "eq",
    "/member/dashboard",
  );
});

Cypress.Commands.add("stubPublicApis", () => {
  cy.intercept("GET", "**/api/club-nights*", {
    fixture: "club-nights.upcoming.json",
  }).as("nights");
  cy.intercept("GET", "**/api/boardgames", {
    fixture: "boardgames.member.json",
  }).as("memberGames");
  cy.intercept("GET", "**/api/boardgames/club", {
    fixture: "boardgames.club.json",
  }).as("clubGames");
  cy.intercept("GET", "**/api/members/public", {
    fixture: "members.public.json",
  }).as("members");
  cy.intercept("GET", "**/api/locations/default", {
    fixture: "locations.default.json",
  }).as("location");
});

Cypress.Commands.add("assertSiteChrome", () => {
  cy.contains("nav a", "Hjem").should("exist");
  cy.contains("nav a", "Om os").should("exist");
  cy.contains("nav a", "Events").should("exist");
  cy.contains("nav a", "Brætspil").should("exist");
});

export {};
