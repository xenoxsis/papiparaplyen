describe("Login page (stubbed)", () => {
  beforeEach(() => {
    cy.visit("/login");
  });

  it("renders the login form", () => {
    cy.contains("h1", "Medlemslogin").should("be.visible");
    cy.get("input#email").should("exist");
    cy.get("input#password").should("exist");
    cy.contains("button", "Log ind").should("exist");
    cy.contains("Glemt adgangskode?").should("exist");
  });

  it("switches to the register tab", () => {
    cy.contains("button", "Bliv medlem").click();
    cy.contains("h1", "Bliv medlem").should("be.visible");
    cy.get("input#reg-name").should("exist");
    cy.get("input#reg-email").should("exist");
    cy.get("input#reg-password").should("exist");
  });

  it("shows the forgot-password form", () => {
    cy.contains("Glemt adgangskode?").click();
    cy.get("input#forgot-email").should("exist");
    cy.contains("button", "Send nulstillingslink").should("exist");
  });

  it("shows a Danish error on bad credentials", () => {
    cy.intercept("POST", "**/api/auth/login", {
      statusCode: 401,
      body: { error: "Invalid credentials" },
    }).as("login");

    cy.get("input#email").type("nobody@example.com");
    cy.get("input#password").type("wrong-password");
    cy.contains("button", "Log ind").click();

    cy.wait("@login");
    cy.contains("Forkert e-mail eller adgangskode.").should("be.visible");
  });

  it("client-side validation rejects mismatched registration passwords", () => {
    cy.contains("button", "Bliv medlem").click();
    cy.get("input#reg-name").type("Ny Bruger");
    cy.get("input#reg-email").type("ny@example.com");
    cy.get("input#reg-password").type("hemmelig123");
    cy.get("input#reg-password2").type("noget-andet");
    cy.contains("button", "Opret konto").click();
    cy.contains("Adgangskoderne matcher ikke.").should("be.visible");
  });
});
