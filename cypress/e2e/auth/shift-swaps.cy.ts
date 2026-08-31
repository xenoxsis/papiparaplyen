/**
 * Mutual shift swaps ("Byt vagt") on the member dashboard — tier 1 (stubbed).
 *
 * Fixture world, signed in as Administrator (id 700):
 *   night 902 "Strategispilsaften"        → assigned to 700 (our own shift)
 *   night 901 "Klubaften i Cypress-land"  → assigned to 701 "Test Vagt"
 * so 901 is the only legal swap target for 902.
 *
 * The handover flow ("Afgiv vagt") is the older broadcast request in the
 * vagter channel; it is asserted here only where the two interact.
 */

/** Stub everything the dashboard touches. `swapsFixture` seeds the proposals. */
function stubDashboard(swapsFixture?: string) {
  cy.loginAs("Administrator");

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
  }).as("shifts");
  cy.intercept("GET", "**/api/notifications", {
    body: { notifications: [], unreadCount: 0 },
  });
  cy.intercept("PATCH", "**/api/notifications/read-by-link", {
    body: { ok: true },
  });
  cy.intercept("POST", "**/api/channels/*/mark-read", { body: { ok: true } });
  // SSE stream — keep it from hanging the page.
  cy.intercept("GET", "**/api/notifications/stream", {
    statusCode: 204,
    body: "",
  });

  cy.intercept(
    "GET",
    "**/api/shift-swaps",
    swapsFixture ? { fixture: swapsFixture } : { body: [] },
  ).as("swaps");

  cy.visit("/member/dashboard");
  cy.wait("@swaps");
}

describe("Vagtbytte — proposing a swap", () => {
  beforeEach(() => stubDashboard());

  it("offers both ways of giving up a shift", () => {
    cy.contains("button", "Afgiv vagt").should("be.enabled");
    cy.contains("button", "Byt vagt").should("be.enabled");
  });

  it("lists only other members' shifts as swap targets", () => {
    cy.contains("button", "Byt vagt").click();

    cy.get('[role="dialog"]').within(() => {
      cy.contains("h2", "Byt vagt").should("be.visible");
      // What we hand over is the shift we started from…
      cy.contains("Du afgiver")
        .parent()
        .should("contain.text", "Strategispilsaften");
      // …and the only candidate is the other member's night.
      cy.contains("button", "Klubaften i Cypress-land")
        .should("be.visible")
        .and("contain.text", "Test Vagt");
      cy.contains("button", "Strategispilsaften").should("not.exist");
    });
  });

  it("keeps the submit button disabled until a target is picked", () => {
    cy.contains("button", "Byt vagt").click();

    cy.get('[role="dialog"]').within(() => {
      cy.contains("button", "Send forslag").should("be.disabled");
      cy.contains("button", "Klubaften i Cypress-land").click();
      cy.contains("button", "Send forslag").should("be.enabled");
    });
  });

  it("posts both night ids plus the message, then shows the pending proposal", () => {
    cy.fixture("dashboard/shift-swaps.outgoing.json").then((swaps) => {
      cy.intercept("POST", "**/api/shift-swaps", {
        statusCode: 201,
        body: swaps[0],
      }).as("propose");
    });

    cy.contains("button", "Byt vagt").click();
    cy.get('[role="dialog"]').within(() => {
      cy.contains("button", "Klubaften i Cypress-land").click();
      cy.get('textarea[placeholder*="den anden vagt"]').type("Kan du tage min?");
      cy.contains("button", "Send forslag").click();
    });

    cy.wait("@propose").then(({ request }) => {
      expect(request.body).to.deep.equal({
        from_night_id: 902,
        to_night_id: 901,
        message: "Kan du tage min?",
      });
    });

    cy.get('[role="dialog"]').should("not.exist");
    cy.contains("Byttet er foreslået").should("be.visible");
    cy.contains("Du har foreslået et bytte til").should(
      "contain.text",
      "Test Vagt",
    );
  });
});

describe("Vagtbytte — answering an incoming proposal", () => {
  beforeEach(() => stubDashboard("dashboard/shift-swaps.incoming.json"));

  it("shows the trade from the reader's own perspective", () => {
    cy.contains("h2", "Vagtbytte").should("be.visible");
    cy.contains("vil bytte vagt med dig").should("contain.text", "Test Vagt");
    cy.contains("Jeg kan ikke den 15. — bytter du?").should("be.visible");

    // We hold 902 and would receive 901 — not the other way round.
    cy.contains("Du afgiver")
      .parent()
      .should("contain.text", "Strategispilsaften");
    cy.contains("Du overtager")
      .parent()
      .should("contain.text", "Klubaften i Cypress-land");
  });

  it("tells the reader that no confirmation step follows", () => {
    cy.contains("Accepterer du, er begge vagter bekræftet med det samme").should(
      "be.visible",
    );
  });

  it("accepts via the accept endpoint and clears the card", () => {
    cy.intercept("POST", "**/api/shift-swaps/*/accept", {
      statusCode: 200,
      body: { id: 9001, status: "accepted" },
    }).as("accept");

    cy.contains("button", "Accepter bytte").click();

    cy.wait("@accept")
      .its("request.url")
      .should("include", "/api/shift-swaps/9001/accept");
    cy.contains("Vagtbyttet er gennemført").should("be.visible");
    cy.contains("vil bytte vagt med dig").should("not.exist");
  });

  it("declines via the decline endpoint and clears the card", () => {
    cy.intercept("POST", "**/api/shift-swaps/*/decline", {
      statusCode: 200,
      body: { id: 9001, status: "declined" },
    }).as("decline");

    cy.contains("button", "Afvis").click();

    cy.wait("@decline")
      .its("request.url")
      .should("include", "/api/shift-swaps/9001/decline");
    cy.contains("Byttet er afvist").should("be.visible");
    cy.contains("vil bytte vagt med dig").should("not.exist");
  });

  it("surfaces a server rejection instead of pretending the swap happened", () => {
    cy.intercept("POST", "**/api/shift-swaps/*/accept", {
      statusCode: 409,
      body: { error: "Vagterne er ændret — byttet kan ikke gennemføres" },
    }).as("accept");

    cy.contains("button", "Accepter bytte").click();

    cy.wait("@accept");
    cy.contains("Vagterne er ændret — byttet kan ikke gennemføres").should(
      "be.visible",
    );
  });
});

describe("Vagtbytte — an outgoing proposal in flight", () => {
  beforeEach(() => stubDashboard("dashboard/shift-swaps.outgoing.json"));

  it("shows it as awaiting an answer, with no accept buttons", () => {
    cy.contains("Du har foreslået et bytte til").should(
      "contain.text",
      "Test Vagt",
    );
    cy.contains("Afventer svar…").should("be.visible");
    cy.contains("button", "Accepter bytte").should("not.exist");
  });

  it("blocks handing the same shift over while the swap is live", () => {
    cy.contains("button", "Afgiv vagt").should("be.disabled");
    cy.contains("button", "Byt vagt").should("be.disabled");
  });

  it("marks the shift in the full shift list", () => {
    cy.contains("Se alle mine vagter").click();
    cy.contains("Bytte foreslået").should("be.visible");
  });

  it("withdraws the proposal", () => {
    cy.intercept("DELETE", "**/api/shift-swaps/*", {
      statusCode: 200,
      body: { id: 9002, status: "cancelled" },
    }).as("withdraw");

    cy.contains("button", "Træk tilbage").click();

    cy.wait("@withdraw")
      .its("request.url")
      .should("include", "/api/shift-swaps/9002");
    cy.contains("Byttet er trukket tilbage").should("be.visible");
    cy.contains("Du har foreslået et bytte til").should("not.exist");
  });
});
