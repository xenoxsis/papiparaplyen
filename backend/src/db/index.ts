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
