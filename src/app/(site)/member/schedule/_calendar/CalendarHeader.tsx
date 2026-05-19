"use client";

import { ChevronLeft, ChevronRight, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { monthNameDa, quarterLabelDa, quarterMonths } from "./calendarGrid";

export interface CalendarHeaderProps {
  quarter: 1 | 2 | 3 | 4;
  year: number;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onPrint: () => void;
}

export function CalendarHeader({
  quarter,
  year,
  onPrev,
  onNext,
  onToday,
  onPrint,
}: CalendarHeaderProps) {
  const [m1, , m3] = quarterMonths(quarter);
  const range = `${monthNameDa(m1)} – ${monthNameDa(m3)}`;
  return (
    <div className="flex items-center justify-between flex-wrap gap-2 print:hidden">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={onPrev} aria-label="Forrige kvartal">
          <ChevronLeft className="size-4" />
        </Button>
        <div className="flex flex-col leading-tight">
          <span className="font-semibold text-sm text-neutral-900">
            {quarterLabelDa(quarter)} {year}
          </span>
          <span className="text-xs text-neutral-500">{range}</span>
        </div>
        <Button variant="outline" size="sm" onClick={onNext} aria-label="Næste kvartal">
          <ChevronRight className="size-4" />
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={onToday}>
          I dag
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onPrint}
          className="gap-1.5"
          aria-label="Udskriv kvartal"
          title="Udskriv kvartal"
        >
          <Printer className="size-4" />
          <span className="hidden sm:inline">Udskriv</span>
        </Button>
      </div>
    </div>
  );
}
