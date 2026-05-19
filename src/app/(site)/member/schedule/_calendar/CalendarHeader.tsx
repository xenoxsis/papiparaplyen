"use client";

import { ChevronLeft, ChevronRight, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { monthNameDa } from "./calendarGrid";

export interface CalendarHeaderProps {
  desktopPrimary: string;
  desktopSecondary: string;
  mobileMonth: number;
  mobileYear: number;
  onPrev: () => void;
  onNext: () => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onToday: () => void;
  onPrint: () => void;
}

export function CalendarHeader({
  desktopPrimary,
  desktopSecondary,
  mobileMonth,
  mobileYear,
  onPrev,
  onNext,
  onPrevMonth,
  onNextMonth,
  onToday,
  onPrint,
}: CalendarHeaderProps) {
  return (
    <div className="flex items-center justify-between flex-wrap gap-2 print:hidden">
      {/* Mobile: month-by-month nav */}
      <div className="flex items-center gap-2 md:hidden">
        <Button variant="outline" size="sm" onClick={onPrevMonth} aria-label="Forrige måned">
          <ChevronLeft className="size-4" />
        </Button>
        <span className="font-semibold text-sm text-neutral-900 min-w-[8rem] text-center">
          {monthNameDa(mobileMonth)} {mobileYear}
        </span>
        <Button variant="outline" size="sm" onClick={onNextMonth} aria-label="Næste måned">
          <ChevronRight className="size-4" />
        </Button>
      </div>

      {/* Desktop: 2-or-3-month nav */}
      <div className="hidden md:flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={onPrev} aria-label="Forrige periode">
          <ChevronLeft className="size-4" />
        </Button>
        <div className="flex flex-col leading-tight min-w-[10rem] text-center">
          <span className="font-semibold text-sm text-neutral-900">
            {desktopPrimary}
          </span>
          {desktopSecondary && (
            <span className="text-xs text-neutral-500">{desktopSecondary}</span>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={onNext} aria-label="Næste periode">
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
          aria-label="Udskriv"
          title="Udskriv"
        >
          <Printer className="size-4" />
          <span className="hidden sm:inline">Udskriv</span>
        </Button>
      </div>
    </div>
  );
}
