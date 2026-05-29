"use client";

import { useState } from "react";
import { AlarmClock, Clock, MapPin, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DateBadge } from "@/components/DateBadge";
import { Skeleton } from "@/components/ui/skeleton";
import type { ApiClubNight } from "@/lib/api";

interface PendingSwap {
  shiftId: number;
  messageId: number;
}

interface ShiftsPanelProps {
  loading?: boolean;
  shifts: ApiClubNight[];
  pendingShiftsForMe: ApiClubNight[];
  pendingSwap: PendingSwap | null;
  onConfirmShift: (shiftId: number) => void;
  onOptOut: (shiftId: number) => void;
  onConfirmAllShifts: () => void;
  onRequestSwap: (shift: ApiClubNight) => void;
  onCancelSwap: () => void;
}

export function ShiftsPanel({
  loading = false,
  shifts,
  pendingShiftsForMe,
  pendingSwap,
  onConfirmShift,
  onOptOut,
  onConfirmAllShifts,
  onRequestSwap,
  onCancelSwap,
}: ShiftsPanelProps) {
  const [showAllShifts, setShowAllShifts] = useState(false);
  const nextShift = shifts[0] ?? null;

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        {/* Skeleton next shift card */}
        <div className="bg-white rounded-xl border border-neutral-200 p-6 flex flex-col gap-4 shadow-sm">
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-5 rounded" />
            <Skeleton className="h-4 w-32 rounded" />
          </div>
          <div className="flex items-center gap-3">
            <Skeleton className="w-10 h-12 rounded-lg shrink-0" />
            <div className="flex flex-col gap-2 flex-1">
              <Skeleton className="h-4 w-40 rounded" />
              <Skeleton className="h-3 w-28 rounded" />
            </div>
          </div>
          <Skeleton className="h-9 w-full rounded-lg" />
        </div>
        {/* Skeleton shift list */}
        {[1, 2].map((i) => (
          <div
            key={i}
            className="bg-white rounded-xl border border-neutral-200 p-4 flex items-center gap-3 shadow-sm"
          >
            <Skeleton className="w-10 h-12 rounded-lg shrink-0" />
            <div className="flex flex-col gap-2 flex-1">
              <Skeleton className="h-4 w-36 rounded" />
              <Skeleton className="h-3 w-24 rounded" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Pending confirmation panel */}
      {pendingShiftsForMe.length > 0 && (
        <div className="bg-white rounded-xl border-l-4 border-brand-orange p-6 flex flex-col gap-4 shadow-sm w-full min-w-0">
          <div className="flex items-center gap-2">
            <AlarmClock className="size-5 text-brand-orange shrink-0" />
            <h2 className="font-semibold text-base text-neutral-900">
              Afventende vagter
            </h2>
            <span className="ml-auto text-xs font-semibold bg-brand-orange/15 text-brand-orange rounded-full px-2 py-0.5">
              {pendingShiftsForMe.length}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2 -mt-2">
            <p className="text-xs text-neutral-500">
              Du er tildelt disse vagter - bekræft at du kan, eller meld fra
            </p>
            {pendingShiftsForMe.length > 1 && (
              <button
                onClick={onConfirmAllShifts}
                className="shrink-0 text-xs font-semibold px-3 py-1 rounded-lg bg-brand-teal text-white hover:bg-teal-700 transition-colors cursor-pointer border-none"
              >
                Bekræft alle
              </button>
            )}
          </div>
          <div className="flex flex-col gap-3">
            {pendingShiftsForMe.map((shift) => (
              <div
                key={shift.id}
                className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 flex flex-col gap-2"
              >
                <div className="flex items-center gap-3">
                  <DateBadge date={shift.date} colorClass="bg-brand-orange" />
                  <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                    <span className="font-semibold text-sm text-neutral-900 truncate">
                      {shift.name}
                    </span>
                    <div className="flex items-center gap-2 text-xs text-neutral-500">
                      <span className="flex items-center gap-1">
                        <Clock className="size-3" />
                        {shift.time_from} - {shift.time_to}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 text-xs text-neutral-500">
                  <MapPin className="size-3" />
                  {shift.location}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => onConfirmShift(shift.id)}
                    className="flex-1 h-8 rounded-lg bg-brand-teal text-white text-xs font-semibold hover:bg-teal-700 transition-colors cursor-pointer border-none"
                  >
                    Bekræft vagt
                  </button>
                  <button
                    onClick={() => onOptOut(shift.id)}
                    className="flex-1 h-8 rounded-lg bg-white border border-brand-red/40 text-brand-red text-xs font-semibold hover:bg-brand-red/5 transition-colors cursor-pointer"
                  >
                    Meld fra
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Next / All shifts panel */}
      <div className="bg-white rounded-xl border-l-4 border-brand-red p-6 flex flex-col gap-4 shadow-sm w-full min-w-0">
        <div className="flex flex-col gap-2">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <AlarmClock className="size-5 text-brand-red shrink-0" />
              <h2 className="font-semibold text-base text-neutral-900">
                {showAllShifts ? "Mine vagter" : "Min næste vagt"}
              </h2>
            </div>
          </div>
          {showAllShifts && (
            <p className="text-xs text-neutral-500">
              {shifts.length} vagter i alt
            </p>
          )}
        </div>

        {!showAllShifts ? (
          <>
            {nextShift ? (
              <div className="flex flex-col gap-3">
                <div className="bg-neutral-100 rounded-lg flex p-3 items-center gap-3">
                  <DateBadge date={nextShift.date} colorClass="bg-brand-teal" />
                  <div className="flex flex-col gap-1">
                    <span className="font-semibold text-sm text-neutral-900">
                      {nextShift.name}
                    </span>
                    <span className="text-neutral-500 text-xs">
                      {new Date(nextShift.date).toLocaleDateString("da-DK", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col gap-2 text-sm text-neutral-900">
                  <div className="flex items-center gap-2">
                    <Clock className="size-4 text-neutral-500 shrink-0" />
                    <span>
                      {nextShift.time_from} - {nextShift.time_to}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="size-4 text-neutral-500 shrink-0" />
                    <span>{nextShift.location}</span>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-neutral-400 py-4 text-center">
                Ingen kommende vagter
              </p>
            )}
            {nextShift && (
              <div className="flex gap-2">
                {pendingSwap?.shiftId === nextShift.id ? (
                  <Button
                    variant="outline"
                    className="flex-1 gap-2 border-red-300 text-brand-red hover:bg-red-50"
                    onClick={onCancelSwap}
                  >
                    <RefreshCcw className="size-4" />
                    Annuller bytte
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    className="flex-1 gap-2"
                    onClick={() => onRequestSwap(nextShift)}
                    disabled={
                      pendingSwap !== null &&
                      pendingSwap.shiftId !== nextShift.id
                    }
                  >
                    <RefreshCcw className="size-4" />
                    Byt vagt
                  </Button>
                )}
              </div>
            )}
            <button
              onClick={() => setShowAllShifts(true)}
              className="mt-auto text-xs text-brand-red hover:underline text-left font-medium cursor-pointer bg-transparent border-none p-0"
            >
              Se alle mine vagter →
            </button>
          </>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              {shifts.length === 0 && (
                <p className="text-sm text-neutral-400 py-4 text-center">
                  Ingen kommende vagter
                </p>
              )}
              {shifts.map((s) => (
                <div
                  key={s.id}
                  className="rounded-lg flex flex-col gap-2 p-3 border bg-white border-neutral-200"
                >
                  <div className="flex items-center gap-3">
                    <DateBadge date={s.date} colorClass="bg-brand-teal" />
                    <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                      <span className="font-semibold text-sm text-neutral-900 truncate">
                        {s.name}
                      </span>
                      <div className="flex items-center gap-2 text-xs text-neutral-500">
                        <span className="flex items-center gap-1">
                          <Clock className="size-3" />
                          {s.time_from} - {s.time_to}
                        </span>
                        <span className="flex items-center gap-1">
                          <MapPin className="size-3" />
                          {s.location}
                        </span>
                      </div>
                    </div>
                  </div>
                  {pendingSwap?.shiftId === s.id ? (
                    <button
                      onClick={onCancelSwap}
                      className="w-full h-8 rounded-lg border border-red-200 bg-red-50 text-brand-red text-xs font-medium hover:bg-red-100 transition-colors cursor-pointer"
                    >
                      Annuller vagtbytte
                    </button>
                  ) : (
                    <button
                      onClick={() => onRequestSwap(s)}
                      disabled={
                        pendingSwap !== null && pendingSwap.shiftId !== s.id
                      }
                      className="w-full h-8 rounded-lg border border-neutral-200 bg-neutral-50 text-neutral-600 text-xs font-medium hover:bg-neutral-100 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                    >
                      <RefreshCcw className="size-3" />
                      Byt vagt
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              onClick={() => setShowAllShifts(false)}
              className="mt-auto text-xs text-neutral-500 hover:underline text-left font-medium cursor-pointer bg-transparent border-none p-0"
            >
              ← Vis kun næste vagt
            </button>
          </>
        )}
      </div>
    </div>
  );
}
