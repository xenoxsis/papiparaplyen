/// <reference types="cypress" />
/// <reference path="./index.d.ts" />

import { authState } from "./authState";

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
// on mount, so driving the shared /me intercept (registered in support/e2e.ts)
// to return this user is what establishes the session. We set it via shared
// module state, which the intercept reads at request time — avoiding precedence
// ambiguity with the default logged-out response. We also seed
// localStorage["auth_user"] on the NEXT page load (one-shot window:before:load
// hook) so the app hydrates without a flash, the same way a real session does.
// Call BEFORE cy.visit().
Cypress.Commands.add(
  "loginAs",
  (role: Cypress.RoleName, overrides?: Partial<Cypress.AuthUser>) => {
    const user: Cypress.AuthUser = { ...FAKE_USERS[role], ...overrides };
    authState.fakeUser = user;

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
  // "Log ind" is also the tab label, so target the form's submit button.
  cy.get('form button[type="submit"]').click();
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
