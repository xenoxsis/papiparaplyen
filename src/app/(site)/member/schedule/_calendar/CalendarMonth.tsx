"use client";

import type { ApiClubNight } from "@/lib/api";
import { CalendarDay } from "./CalendarDay";
import { DayDetailPopover } from "./DayDetailPopover";
import { buildMonthDays, monthNameDa, todayIso } from "./calendarGrid";

type VagtInfo = { id: number; name: string; initials: string } | null;

export interface CalendarMonthProps {
  year: number;
  monthIdx: number;
  nights: ApiClubNight[];
  pendingChanges: Record<number, number | null>;
  autoAssignedIds: Set<number>;
  problemNightIds: number[];
  dragOverNightId: number | null;
  isAdmin: boolean;
  effectiveVagt: (night: ApiClubNight) => VagtInfo;
  holidays: Map<string, string>;
  violations: Map<number, string>;
  popoverNightId: number | null;
  onPopoverChange: (nightId: number | null) => void;
  onCellDragEnd?: () => void;
  onCellDragOver?: (e: React.DragEvent, nightId: number) => void;
  onCellDragLeave?: () => void;
  onCellDrop?: (e: React.DragEvent, nightId: number) => void;
  onCellClick?: (nightId: number) => void;
  onAssignClick: (nightId: number) => void;
  onRemoveVagt: (nightId: number) => void;
  onEdit: (night: ApiClubNight) => void;
  onDelete: (nightId: number) => void;
  onCancel: (night: ApiClubNight) => void;
}

export function CalendarMonth({
  year,
  monthIdx,
  nights,
  pendingChanges,
  autoAssignedIds,
  problemNightIds,
  dragOverNightId,
  isAdmin,
  effectiveVagt,
  holidays,
  violations,
  popoverNightId,
  onPopoverChange,
  onCellDragEnd,
  onCellDragOver,
  onCellDragLeave,
  onCellDrop,
  onCellClick,
  onAssignClick,
  onRemoveVagt,
  onEdit,
  onDelete,
  onCancel,
}: CalendarMonthProps) {
  const days = buildMonthDays(year, monthIdx);
  const today = todayIso();

  const byDate = new Map<string, ApiClubNight>();
  for (const n of nights) byDate.set(n.date, n);

  return (
    <div className="flex flex-col border border-neutral-300 rounded-md overflow-hidden bg-white break-inside-avoid">
      <div className="bg-neutral-200 px-3 py-2 text-center font-bold text-sm text-neutral-800 border-b border-neutral-300">
        {monthNameDa(monthIdx)} {year}
      </div>
      <div className="flex flex-col">
        {days.map((cell) => {
          const cellNight = byDate.get(cell.date) ?? null;
          const vagt = cellNight ? effectiveVagt(cellNight) : null;
          const isPending = cellNight ? cellNight.id in pendingChanges : false;
          const isAutoAssigned = cellNight
            ? autoAssignedIds.has(cellNight.id)
            : false;
          const isProblem = cellNight
            ? problemNightIds.includes(cellNight.id)
            : false;
          const violationMsg = cellNight
            ? (violations.get(cellNight.id) ?? null)
            : null;
          const hasViolation = !!violationMsg || isProblem;

          const dayEl = (
            <CalendarDay
              date={cell.date}
              dow={cell.dow}
              holidayName={holidays.get(cell.date) ?? null}
              night={cellNight}
              vagt={vagt}
              isPending={isPending}
              isAutoAssigned={isAutoAssigned}
              hasViolation={hasViolation}
              violationMessage={
                violationMsg ?? (isProblem ? "Ingen mulig kandidat" : null)
              }
              isOver={dragOverNightId === (cellNight?.id ?? -1)}
              isAdmin={isAdmin}
              isToday={cell.date === today}
              onCellDragEnd={onCellDragEnd}
              onCellDragOver={onCellDragOver}
              onCellDragLeave={onCellDragLeave}
              onCellDrop={onCellDrop}
              onCellClick={onCellClick}
            />
          );

          if (!cellNight) {
            return <div key={cell.date}>{dayEl}</div>;
          }

          return (
            <DayDetailPopover
              key={cell.date}
              night={cellNight}
              vagt={vagt}
              isPending={isPending}
              isAdmin={isAdmin}
              open={popoverNightId === cellNight.id}
              onOpenChange={(o) =>
                onPopoverChange(o ? cellNight.id : null)
              }
              onAssign={() => onAssignClick(cellNight.id)}
              onRemoveVagt={() => onRemoveVagt(cellNight.id)}
              onEdit={() => onEdit(cellNight)}
              onDelete={() => onDelete(cellNight.id)}
              onCancel={() => onCancel(cellNight)}
            >
              {dayEl}
            </DayDetailPopover>
          );
        })}
      </div>
    </div>
  );
}
