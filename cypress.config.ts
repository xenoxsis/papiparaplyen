import { defineConfig } from "cypress";
import * as fs from "fs";
import * as path from "path";
import type sql from "mssql";

/**
 * Reads simple KEY=VALUE pairs out of backend/.env so the seed task can reach
 * the same database the backend uses, without duplicating credentials. Only
 * used by the tier-2 (real backend) seed/reset tasks.
 */
function loadBackendEnv(): Record<string, string> {
  const envPath = path.resolve(__dirname, "backend", ".env");
  if (!fs.existsSync(envPath)) return {};
  const out: Record<string, string> = {};
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

export default defineConfig({
  e2e: {
    baseUrl: process.env.CYPRESS_BASE_URL || "http://localhost:3010",
    specPattern: "cypress/e2e/**/*.cy.ts",
    supportFile: "cypress/support/e2e.ts",
    fixturesFolder: "cypress/fixtures",
    video: false,
    retries: { runMode: 2, openMode: 0 },
    defaultCommandTimeout: 8000,
    setupNodeEvents(on, config) {
      const dbEnv = loadBackendEnv();
      const sqlConfig: sql.config = {
        server: process.env.DB_SERVER || dbEnv.DB_SERVER || "localhost",
        database: process.env.DB_NAME || dbEnv.DB_NAME || "Paraplyen_test",
        user: process.env.DB_USER || dbEnv.DB_USER || "paraplyen_app",
        password: process.env.DB_PASSWORD || dbEnv.DB_PASSWORD || "",
        options: {
          encrypt: (dbEnv.DB_ENCRYPT ?? "true") !== "false",
          trustServerCertificate:
            (dbEnv.DB_TRUST_SERVER_CERTIFICATE ?? "true") === "true",
        },
      };

      on("task", {
        async "db:seed"() {
          const { seed } = await import("./cypress/tasks/seed");
          await seed(sqlConfig);
          return null;
        },
        async "db:reset"() {
          const { reset } = await import("./cypress/tasks/seed");
          await reset(sqlConfig);
          return null;
        },
      });

      return config;
    },
  },
  env: {
    // Tier 2 (real backend) flags — override locally via cypress.env.json.
    realBackend: false,
    realEmail: "",
    realPassword: "",
  },
});
