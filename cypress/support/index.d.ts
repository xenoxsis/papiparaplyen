/// <reference types="cypress" />

declare namespace Cypress {
  /** Mirrors the `User` shape persisted by AuthProvider (src/lib/auth-context.tsx). */
  type AuthUser = {
    id: number;
    name: string;
    initials: string;
    roles: string[];
    is_superuser?: boolean;
    has_avatar?: boolean;
  };

  type RoleName = "Administrator" | "Vagt" | "Medlem" | "Tilskuer";

  interface Chainable {
    /**
     * Fakes an authenticated session WITHOUT a backend. Seeds
     * localStorage["auth_user"] AND stubs GET /api/auth/me with a matching
     * user (both are required — AuthProvider clears the session on mount if
     * /me does not return a user). Call BEFORE cy.visit().
     */
    loginAs(
      role: RoleName,
      overrides?: Partial<AuthUser>,
    ): Chainable<AuthUser>;

    /** Performs a real login through the /login form (tier 2, real backend). */
    loginReal(email: string, password: string): Chainable<void>;

    /** Registers the common public-page API intercepts backed by fixtures. */
    stubPublicApis(): Chainable<void>;

    /** Asserts the global nav chrome (logo + public links) is present. */
    assertSiteChrome(): Chainable<void>;
  }
}
