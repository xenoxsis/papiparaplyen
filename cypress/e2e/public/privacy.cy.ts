// Static server-rendered page, no API calls.
describe("Privacy page", () => {
  beforeEach(() => {
    cy.visit("/privacy");
  });

  it("renders the policy heading and sections", () => {
    cy.contains("h1", "Privatlivspolitik").should("be.visible");
    cy.contains("Sidst opdateret:").should("exist");
    cy.contains("h2", "1. Dataansvarlig").should("exist");
    cy.contains("h2", "2. Hvilke oplysninger indsamler vi?").should("exist");
  });
});
