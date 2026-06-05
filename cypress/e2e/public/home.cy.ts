// Home page (`/`) is a Next.js Server Component — its club-nights / club-games
// data is fetched on the server, so cy.intercept cannot stub it. We assert on
// the static Danish copy that is always present regardless of data.
describe("Home page", () => {
  beforeEach(() => {
    cy.visit("/");
  });

  it("renders the hero", () => {
    cy.contains("h1", "Esbjerg Brætspil").should("be.visible");
    cy.contains("Din lokale brætspilsklub - alle er velkomne!").should(
      "be.visible",
    );
    cy.contains("Brætspilsklub siden 2024").should("be.visible");
  });

  it("links to login and events from the hero", () => {
    cy.contains("a", "Bliv medlem").should("have.attr", "href", "/login");
    cy.contains("a", "Se kommende aftener").should(
      "have.attr",
      "href",
      "/events",
    );
  });

  it("shows the about and upcoming-events sections", () => {
    cy.contains("h2", "Hvem er vi?").should("be.visible");
    cy.contains("h2", "Næste klubaftener").should("be.visible");
    cy.contains("Kontingent").should("exist");
    cy.contains("Hver torsdag aften - bare mød op").should("exist");
  });

  it("shows the global navigation", () => {
    cy.assertSiteChrome();
  });
});
