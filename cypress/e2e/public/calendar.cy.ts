// The calendar page is purely client-side and makes no API calls.
describe("Calendar page", () => {
  beforeEach(() => {
    cy.visit("/calendar");
  });

  it("renders the heading and description", () => {
    cy.contains("h1", "Kalender").should("be.visible");
    cy.contains("Find ud af hvornår vi mødes næste gang!").should("be.visible");
  });

  it("can navigate between months", () => {
    cy.get('[aria-label="Næste måned"]').should("exist").click();
    cy.get('[aria-label="Forrige måned"]').should("exist").click();
  });
});
