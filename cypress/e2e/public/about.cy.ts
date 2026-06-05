describe("About page (stubbed)", () => {
  beforeEach(() => {
    cy.intercept("GET", "**/api/members/public", {
      fixture: "members.public.json",
    }).as("members");
    cy.intercept("GET", "**/api/boardgames/club", {
      fixture: "boardgames.club.json",
    }).as("clubGames");
    cy.intercept("GET", "**/api/locations/default", {
      fixture: "locations.default.json",
    }).as("location");
    cy.visit("/about");
  });

  it("renders the intro and values sections", () => {
    cy.contains("h2", "Hvem er vi?").should("be.visible");
    cy.contains("Hvad gør os specielle?").should("be.visible");
    cy.contains("Fællesskab").should("exist");
    cy.contains("Sjove spil").should("exist");
    cy.contains("Lær nyt").should("exist");
  });

  it("shows the default location", () => {
    cy.wait("@location");
    cy.contains("Testlokation").should("exist");
  });
});
