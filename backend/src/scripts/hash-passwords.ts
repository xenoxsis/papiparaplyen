/**
 * One-time migration: hash all plaintext passwords in users.json with bcrypt.
 * Run once with: npx tsx src/scripts/hash-passwords.ts
 * Safe to run multiple times — already-hashed passwords (starting with $2b$) are skipped.
 */

import bcrypt from "bcrypt";
import { readTable, writeTable } from "../db";

const SALT_ROUNDS = 12;

interface DbUser {
  id: number;
  email: string;
  password: string;
  provider: string;
  provider_id: string | null;
  member_id: number;
  banned: boolean;
}

async function main() {
  const users = readTable<DbUser>("users");
  let migrated = 0;

  const updated = await Promise.all(
    users.map(async (user) => {
      if (
        user.password.startsWith("$2b$") ||
        user.password.startsWith("$2a$")
      ) {
        return user; // already hashed
      }
      const hashed = await bcrypt.hash(user.password, SALT_ROUNDS);
      migrated++;
      return { ...user, password: hashed };
    }),
  );

  writeTable("users", updated);
  console.log(`Migration complete. ${migrated} password(s) hashed.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
