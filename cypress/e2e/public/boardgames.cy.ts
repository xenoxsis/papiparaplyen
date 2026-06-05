describe("Boardgames page (stubbed)", () => {
  beforeEach(() => {
    cy.intercept("GET", "**/api/boardgames", {
      fixture: "boardgames.member.json",
    }).as("memberGames");
    cy.intercept("GET", "**/api/boardgames/club", {
      fixture: "boardgames.club.json",
    }).as("clubGames");
    cy.visit("/boardgames");
    cy.wait(["@memberGames", "@clubGames"]);
  });

  it("defaults to the club tab and lists club games", () => {
    cy.contains("h1", "Brætspil").should("be.visible");
    cy.contains("Spil der altid er tilgængelige i klubben").should("exist");
    cy.contains("td", "Gloomhaven (Cypress)").should("be.visible");
    cy.contains("td", "Azul (Cypress)").should("be.visible");
  });

  it("switches to the members tab", () => {
    cy.contains("button", "Medlemmernes spil").click();
    cy.contains("td", "Catan (Cypress)").should("be.visible");
    cy.contains("th", "Ejere").should("be.visible");
  });

  it("filters by name", () => {
    cy.get('input[placeholder="Navn…"]').type("Azul");
    cy.contains("td", "Azul (Cypress)").should("be.visible");
    cy.contains("td", "Gloomhaven (Cypress)").should("not.exist");
    cy.contains("Ryd filtre").click();
    cy.contains("td", "Gloomhaven (Cypress)").should("be.visible");
  });
});
