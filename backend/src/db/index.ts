import sql from "mssql";

if (!process.env.DB_PASSWORD) {
  throw new Error("DB_PASSWORD environment variable is required");
}

const config: sql.config = {
  server: process.env.DB_SERVER ?? "localhost",
  database: process.env.DB_NAME ?? "Paraplyen",
  user: process.env.DB_USER ?? "paraplyen_app",
  password: process.env.DB_PASSWORD,
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
};

let _pool: sql.ConnectionPool | null = null;

export async function getPool(): Promise<sql.ConnectionPool> {
  if (!_pool) {
    _pool = await new sql.ConnectionPool(config).connect();
    console.log("  ✓  SQL Server connected");
  }
  return _pool;
}

export { sql };

// ── Flat-file JSON helpers (kept for migration scripts only) ─────
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const DATA_DIR = join(__dirname, "data");

export function readTable<T = Record<string, unknown>>(name: string): T[] {
  const raw = readFileSync(join(DATA_DIR, `${name}.json`), "utf-8");
  return JSON.parse(raw) as T[];
}

export function writeTable<T = Record<string, unknown>>(
  name: string,
  data: T[],
): void {
  writeFileSync(
    join(DATA_DIR, `${name}.json`),
    JSON.stringify(data, null, 2),
    "utf-8",
  );
}
