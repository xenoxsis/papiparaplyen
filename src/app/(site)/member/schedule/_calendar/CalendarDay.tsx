"use client";

import { forwardRef } from "react";
import { AlertTriangle } from "lucide-react";
import type { ApiClubNight } from "@/lib/api";
import { isoWeek } from "./calendarGrid";

type VagtInfo = { id: number; name: string; initials: string } | null;

const REASSIGN_MIME = "application/x-vagt-reassign";
const DAY_INITIALS = ["M", "T", "O", "T", "F", "L", "S"];

export interface CalendarDayProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "onDragStart" | "onDrop"> {
  date: string;
  /** Mon-first day of week (0 = Mon … 6 = Sun). */
  dow: number;
  holidayName: string | null;
  night: ApiClubNight | null;
  vagt: VagtInfo;
  isPending: boolean;
  isAutoAssigned: boolean;
  hasViolation: boolean;
  violationMessage: string | null;
  isOver: boolean;
  isAdmin: boolean;
  isToday: boolean;
  optOuts: { id: number; initials: string; name: string }[];
  onCellDragEnd?: () => void;
  onCellDragOver?: (e: React.DragEvent, nightId: number) => void;
  onCellDragLeave?: () => void;
  onCellDrop?: (e: React.DragEvent, nightId: number) => void;
  onCellClick?: (nightId: number) => void;
}

export const CalendarDay = forwardRef<HTMLDivElement, CalendarDayProps>(
  function CalendarDay(props, ref) {
    const {
      date,
      dow,
      holidayName,
      night,
      vagt,
      isPending,
      isAutoAssigned,
      hasViolation,
      violationMessage,
      isOver,
      isAdmin,
      isToday,
      optOuts,
      onCellDragEnd,
      onCellDragOver,
      onCellDragLeave,
      onCellDrop,
      onCellClick,
      ...rest
    } = props;

    const dayNum = Number(date.slice(8, 10));
    const isMonday = dow === 0;
    const weekend = dow >= 5;
    const hasNight = night !== null;
    const cancelled = !!night?.cancelled;
    const isPast = hasNight && night ? new Date(`${night.date}T${night.time_to || "23:59:59"}`) < new Date() : false;
    const isDroppable = isAdmin && hasNight && !cancelled && !isPast;

    function handleDragOver(e: React.DragEvent) {
      if (!isDroppable || !night) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      onCellDragOver?.(e, night.id);
    }

    function handleDrop(e: React.DragEvent) {
      if (!isDroppable || !night) return;
      e.preventDefault();
      onCellDrop?.(e, night.id);
    }

    function handleVagtDragStart(e: React.DragEvent) {
      if (!isAdmin || !night || !vagt) return;
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData(REASSIGN_MIME, String(night.id));
      e.dataTransfer.setData("text/plain", String(night.id));
    }

    function handleClick() {
      if (!hasNight || !night) return;
      onCellClick?.(night.id);
    }

    const rowBg = isOver
      ? "bg-brand-teal/10"
      : weekend || holidayName
        ? "bg-[#e5e7eb]"
        : "bg-white";

    const rowBorder = isOver
      ? "border-brand-teal"
      : hasViolation && hasNight && !cancelled
        ? "border-red-400"
        : isToday
          ? "border-brand-orange"
          : "border-transparent";

    const interactive = hasNight && !cancelled;

    return (
      <div
        ref={ref}
        data-night-id={night?.id ?? undefined}
        data-date={date}
        onDragOver={isDroppable ? handleDragOver : undefined}
        onDragLeave={onCellDragLeave}
        onDrop={isDroppable ? handleDrop : undefined}
        onClick={interactive ? handleClick : undefined}
        onKeyDown={
          interactive
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleClick();
                }
              }
            : undefined
        }
        role={interactive ? "button" : undefined}
        tabIndex={interactive ? 0 : -1}
        aria-label={
          hasNight && night
            ? `${night.name} ${date}${vagt ? ` — ${vagt.name}` : ""}`
            : undefined
        }
        title={violationMessage ?? undefined}
        {...rest}
        className={`relative flex items-center gap-1.5 px-2 h-7 border-l-2 border-b border-b-neutral-200 ${rowBorder} ${rowBg} ${
          interactive ? "cursor-pointer hover:bg-neutral-50" : ""
        } transition-colors`}
      >
        {/* Day letter (M / T / O / T / F / L / S) */}
        <span className="text-[11px] font-semibold w-3 text-neutral-700 select-none">
          {DAY_INITIALS[dow]}
        </span>

        {/* Day number */}
        <span className="text-xs font-medium w-4 text-neutral-900 select-none tabular-nums">
          {dayNum}
        </span>

        {/* Holiday name OR club-night name */}
        <span
          className={`text-[11px] leading-4 flex-1 min-w-0 truncate ${
            cancelled
              ? "text-neutral-400 line-through"
              : holidayName
                ? "text-neutral-700"
                : hasNight
                  ? "text-neutral-800 font-medium"
                  : "text-neutral-400"
          }`}
        >
          {hasNight && night ? night.name : (holidayName ?? "")}
        </span>

        {/* Vagt badge */}
        {hasNight && night && (
          <>
            {vagt ? (
              <div
                draggable={isAdmin && !cancelled}
                onDragStart={
                  isAdmin && !cancelled ? handleVagtDragStart : undefined
                }
                onDragEnd={onCellDragEnd}
                onClick={(e) => {
                  e.stopPropagation();
                  handleClick();
                }}
                className={`flex items-center rounded-full pl-0.5 pr-1.5 py-0.5 border shrink-0 ${
                  cancelled
                    ? "border-neutral-300 bg-neutral-50"
                    : isPending
                      ? "border-dashed border-brand-orange bg-brand-orange/10"
                      : isAutoAssigned
                        ? "border-purple-300 bg-purple-50"
                        : "border-brand-teal/30 bg-brand-teal/10"
                } ${isAdmin && !cancelled ? "cursor-grab active:cursor-grabbing" : ""}`}
                title={vagt.name}
              >
                <div
                  className={`w-4 h-4 rounded-full text-white flex items-center justify-center text-[0.5rem] font-bold select-none shrink-0 ${
                    cancelled ? "bg-neutral-400" : "bg-brand-red"
                  }`}
                >
                  {vagt.initials}
                </div>
              </div>
            ) : (
              <span className="text-[10px] font-medium rounded-full px-1.5 py-0.5 border border-dashed border-brand-red/40 text-brand-red bg-brand-red/5 shrink-0">
                ?
              </span>
            )}
          </>
        )}

        {/* Opt-out dots */}
        {hasNight && optOuts.length > 0 && (
          <div className="flex items-center gap-0.5 shrink-0">
            {optOuts.slice(0, 3).map((o) => (
              <div
                key={o.id}
                title={o.name}
                className="w-3.5 h-3.5 rounded-full bg-neutral-300 text-neutral-600 flex items-center justify-center text-[0.42rem] font-bold select-none"
              >
                {o.initials}
              </div>
            ))}
            {optOuts.length > 3 && (
              <span className="text-[9px] text-neutral-400 font-medium leading-none">
                +{optOuts.length - 3}
              </span>
            )}
          </div>
        )}

        {/* ISO week number — bold, right-aligned, on Mondays only */}
        {isMonday && (
          <span className="ml-auto text-xs font-bold w-5 text-right text-neutral-500 select-none tabular-nums">
            {isoWeek(date)}
          </span>
        )}

        {/* Violation indicator */}
        {hasViolation && hasNight && !cancelled && (
          <AlertTriangle className="absolute left-0 top-1/2 -translate-y-1/2 size-3 text-red-500" />
        )}
      </div>
    );
  },
);

export { REASSIGN_MIME };
