"use client";

import { useMemo } from "react";
import Holidays from "date-holidays";

type HdHoliday = {
  date: string;
  name: string;
  type: "public" | "bank" | "school" | "optional" | "observance";
};

/**
 * Returns a Map of `YYYY-MM-DD` → Danish holiday name for public holidays in
 * the given year. Memoised so repeated render of a quarter doesn't re-compute.
 */
export function useHolidays(year: number): Map<string, string> {
  return useMemo(() => {
    const hd = new Holidays("DK");
    const raw = (hd.getHolidays(year) as unknown as HdHoliday[]) ?? [];
    const map = new Map<string, string>();
    for (const h of raw) {
      if (h.type !== "public") continue;
      // `h.date` looks like "2026-04-02 00:00:00" — take the first 10 chars.
      const iso = h.date.slice(0, 10);
      // If the same date has multiple public entries, keep the first.
      if (!map.has(iso)) map.set(iso, h.name);
    }
    return map;
  }, [year]);
}
