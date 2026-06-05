describe("Events page (stubbed)", () => {
  it("renders confirmed nights from the API", () => {
    cy.intercept("GET", "**/api/club-nights*", {
      fixture: "club-nights.upcoming.json",
    }).as("nights");
    cy.visit("/events");
    cy.wait("@nights");

    cy.contains("h1", "Alle kommende aftener").should("be.visible");
    cy.contains("Klubaften i Cypress-land").should("be.visible");
    cy.contains("Strategispilsaften").should("be.visible");
  });

  it("can toggle between card and list view", () => {
    cy.intercept("GET", "**/api/club-nights*", {
      fixture: "club-nights.upcoming.json",
    }).as("nights");
    cy.visit("/events");
    cy.wait("@nights");

    cy.get('[aria-label="Listevisning"]').click();
    cy.contains("Klubaften i Cypress-land").should("be.visible");
    cy.get('[aria-label="Kortvisning"]').click();
    cy.contains("Klubaften i Cypress-land").should("be.visible");
  });

  it("shows the empty state when there are no nights", () => {
    cy.intercept("GET", "**/api/club-nights*", { body: [] }).as("empty");
    cy.visit("/events");
    cy.wait("@empty");

    cy.contains("Ingen kommende klubaftener planlagt endnu.").should(
      "be.visible",
    );
  });
});
