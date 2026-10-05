/**
 * Migration runner for database/migrations/*.sql
 *
 *   pnpm migrate                   apply all pending migrations
 *   pnpm migrate --status          list applied / pending, change nothing
 *   pnpm migrate --dry-run         show what would be applied, change nothing
 *   pnpm migrate --baseline 028    record 001…028 as applied WITHOUT running them
 *   pnpm migrate --baseline 0      start tracking with nothing applied (fresh DB)
 *
 * Applied migrations are tracked in dbo.schema_migrations (created on first
 * use). Each file runs in its own transaction, split into batches on `GO`
 * lines like sqlcmd does; the tracking row is written in the same
 * transaction, so a failing file leaves no trace and stops the run.
 *
 * Existing databases: migrations were applied by hand before this runner
 * existed, and some (e.g. 016) are not safe to re-run. The runner therefore
 * refuses to run against a database that has tables but no tracking table —
 * run `--baseline <last applied number>` once first.
 *
 * Connection settings come from backend/.env (DB_SERVER, DB_NAME, …), the
 * same as `pnpm dev`.
 */

import { createHash } from "crypto";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { getPool, sql } from "../src/db";

const MIGRATIONS_DIR = join(__dirname, "../../database/migrations");
const FILE_RE = /^(\d{3})_.+\.sql$/;
const GO_RE = /^[ \t]*GO[ \t]*(?:--.*)?$/gim;

type MigrationFile = { number: number; name: string; sql: string; checksum: string };
type AppliedRow = { name: string; checksum: string | null; applied_at: Date; baselined: boolean };

// ── CLI ──────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const statusOnly = args.includes("--status");
const dryRun = args.includes("--dry-run");
const baselineIdx = args.indexOf("--baseline");
const baselineArg = baselineIdx >= 0 ? args[baselineIdx + 1] : undefined;

if (baselineIdx >= 0 && !/^\d{1,3}$/.test(baselineArg ?? "")) {
  fail("--baseline needs a migration number, e.g. --baseline 028");
}

function fail(msg: string): never {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}

// ── Files ────────────────────────────────────────────────────────────────────

function loadFiles(): MigrationFile[] {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => FILE_RE.test(f))
    .sort()
    .map((name) => {
      const raw = readFileSync(join(MIGRATIONS_DIR, name), "utf-8").replace(/^﻿/, "");
      return {
        number: Number(name.match(FILE_RE)![1]),
        name,
        sql: raw,
        checksum: createHash("sha256").update(raw.replace(/\r\n/g, "\n")).digest("hex"),
      };
    });

  const seen = new Map<number, string>();
  for (const f of files) {
    const dup = seen.get(f.number);
    if (dup) fail(`Two migrations share number ${f.number}: ${dup} and ${f.name}`);
    seen.set(f.number, f.name);
  }
  return files;
}

function batches(script: string): string[] {
  return script
    .split(GO_RE)
    .map((b) => b.trim())
    .filter((b) => b.replace(/--.*$/gm, "").trim().length > 0);
}

// ── DB ───────────────────────────────────────────────────────────────────────

async function ensureTrackingTable(pool: sql.ConnectionPool) {
  await pool.request().batch(`
    IF OBJECT_ID('dbo.schema_migrations', 'U') IS NULL
      CREATE TABLE dbo.schema_migrations (
        name       NVARCHAR(255) NOT NULL CONSTRAINT PK_schema_migrations PRIMARY KEY,
        checksum   CHAR(64)      NULL,
        baselined  BIT           NOT NULL CONSTRAINT DF_schema_migrations_baselined DEFAULT 0,
        applied_at DATETIME2     NOT NULL CONSTRAINT DF_schema_migrations_applied_at DEFAULT SYSUTCDATETIME()
      );
  `);
}

async function trackingTableExists(pool: sql.ConnectionPool): Promise<boolean> {
  const r = await pool.request().query(
    "SELECT OBJECT_ID('dbo.schema_migrations', 'U') AS id",
  );
  return r.recordset[0].id !== null;
}

async function loadApplied(pool: sql.ConnectionPool): Promise<Map<string, AppliedRow>> {
  if (!(await trackingTableExists(pool))) return new Map();
  const r = await pool
    .request()
    .query<AppliedRow>("SELECT name, checksum, applied_at, baselined FROM dbo.schema_migrations");
  return new Map(r.recordset.map((row) => [row.name, row]));
}

async function hasExistingSchema(pool: sql.ConnectionPool): Promise<boolean> {
  const r = await pool.request().query("SELECT OBJECT_ID('dbo.members', 'U') AS id");
  return r.recordset[0].id !== null;
}

async function record(
  req: sql.Request,
  file: MigrationFile,
  baselined: boolean,
) {
  await req
    .input("name", sql.NVarChar(255), file.name)
    .input("checksum", sql.Char(64), file.checksum)
    .input("baselined", sql.Bit, baselined)
    .query(
      "INSERT INTO dbo.schema_migrations (name, checksum, baselined) VALUES (@name, @checksum, @baselined)",
    );
}

async function apply(pool: sql.ConnectionPool, file: MigrationFile) {
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    for (const batch of batches(file.sql)) {
      const req = new sql.Request(tx);
      req.on("info", (info: { message: string }) => console.log(`      ${info.message}`));
      await req.batch(batch);
    }
    await record(new sql.Request(tx), file, false);
    await tx.commit();
  } catch (err) {
    await tx.rollback().catch(() => {});
    throw err;
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const files = loadFiles();
  const pool = await getPool();
  console.log(`  Database: ${process.env.DB_NAME ?? "Paraplyen"} on ${process.env.DB_SERVER ?? "localhost"}\n`);

  // --baseline: mark files as applied without running them
  if (baselineArg !== undefined) {
    const upTo = Number(baselineArg);
    const toMark = files.filter((f) => f.number <= upTo);
    // --baseline 0 = start tracking with nothing applied (fresh setup.sql DB)
    if (toMark.length === 0 && upTo !== 0) fail(`No migrations numbered ≤ ${baselineArg}`);
    if (dryRun) {
      toMark.forEach((f) => console.log(`  would baseline  ${f.name}`));
      return;
    }
    await ensureTrackingTable(pool);
    const applied = await loadApplied(pool);
    let marked = 0;
    for (const f of toMark) {
      if (applied.has(f.name)) continue;
      await record(pool.request(), f, true);
      console.log(`  ✓ baselined  ${f.name}`);
      marked++;
    }
    console.log(`\n  ${marked} migration(s) recorded as already applied (not run).`);
    const next = files.find((f) => f.number > upTo);
    if (next) console.log(`  Next \`pnpm migrate\` will start at ${next.name}.`);
    return;
  }

  const applied = await loadApplied(pool);
  const tracking = await trackingTableExists(pool);

  // Safety: never replay history against a hand-migrated database.
  if (!tracking && (await hasExistingSchema(pool))) {
    fail(
      "This database already has tables but no migration history.\n" +
        "  Migrations were applied by hand before, and some are not safe to re-run.\n" +
        "  Record the ones already applied first, e.g.:\n\n" +
        "    pnpm migrate --baseline 028\n\n" +
        "  (use the number of the last migration you actually ran), then `pnpm migrate`.",
    );
  }
  if (!tracking) {
    fail(
      "Empty database. Run database/setup.sql first, then `pnpm migrate --baseline 0`\n" +
        "  and `pnpm migrate` to apply every migration on top of it.",
    );
  }

  // Warn about edited or vanished files — informational only.
  for (const f of files) {
    const row = applied.get(f.name);
    if (row?.checksum && row.checksum !== f.checksum)
      console.warn(`  ! ${f.name} has changed since it was applied (not re-run)`);
  }
  const known = new Set(files.map((f) => f.name));
  for (const name of applied.keys())
    if (!known.has(name)) console.warn(`  ! ${name} is recorded as applied but the file is missing`);

  const pending = files.filter((f) => !applied.has(f.name));

  if (statusOnly) {
    for (const f of files) {
      const row = applied.get(f.name);
      const state = !row ? "pending  " : row.baselined ? "baselined" : "applied  ";
      const when = row ? row.applied_at.toISOString().slice(0, 16).replace("T", " ") : "";
      console.log(`  ${state}  ${f.name}  ${when}`);
    }
    console.log(`\n  ${pending.length} pending.`);
    return;
  }

  if (pending.length === 0) {
    console.log("  ✓ Up to date — nothing to apply.");
    return;
  }

  if (dryRun) {
    pending.forEach((f) => console.log(`  would apply  ${f.name}  (${batches(f.sql).length} batch(es))`));
    return;
  }

  for (const f of pending) {
    console.log(`  → ${f.name}`);
    try {
      await apply(pool, f);
    } catch (err) {
      fail(
        `${f.name} failed and was rolled back:\n  ${(err as Error).message}\n` +
          "  Later migrations were not run.",
      );
    }
    console.log(`  ✓ ${f.name}`);
  }
  console.log(`\n  ${pending.length} migration(s) applied.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => fail((err as Error).message));
