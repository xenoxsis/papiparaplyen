"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ApiClubNight, ApiMember } from "@/lib/api";
import { validateAssignment } from "@/lib/schedule-validation";
import { CalendarHeader } from "./CalendarHeader";
import { CalendarMonth } from "./CalendarMonth";
import {
  getQuarter,
  quarterMonths,
} from "./calendarGrid";
import { useHolidays } from "./useHolidays";
import { REASSIGN_MIME } from "./CalendarDay";

type VagtInfo = { id: number; name: string; initials: string } | null;

export interface CalendarViewProps {
  nights: ApiClubNight[];
  vagter: ApiMember[];
  isAdmin: boolean;
  pendingChanges: Record<number, number | null>;
  autoAssignedIds: Set<number>;
  problemNightIds: number[];
  draggingMemberId: number | null;
  dragOverNightId: number | null;
  effectiveVagt: (night: ApiClubNight) => VagtInfo;
  setDragOverNightId: (id: number | null) => void;
  onCellDrop: (nightId: number) => void;
  onCellReassignDrop: (fromNightId: number, toNightId: number) => void;
  onAssignClick: (nightId: number) => void;
  onRemoveVagt: (nightId: number) => void;
  onEdit: (night: ApiClubNight) => void;
  onDelete: (nightId: number) => void;
  onCancel: (night: ApiClubNight) => void;
}

function isMobile(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width: 767px)").matches;
}

export function CalendarView({
  nights,
  vagter,
  isAdmin,
  pendingChanges,
  autoAssignedIds,
  problemNightIds,
  draggingMemberId,
  dragOverNightId,
  effectiveVagt,
  setDragOverNightId,
  onCellDrop,
  onCellReassignDrop,
  onAssignClick,
  onRemoveVagt,
  onEdit,
  onDelete,
  onCancel,
}: CalendarViewProps) {
  const now = new Date();
  const [quarter, setQuarter] = useState<1 | 2 | 3 | 4>(() => getQuarter(now));
  const [year, setYear] = useState<number>(() => now.getFullYear());
  const [popoverNightId, setPopoverNightId] = useState<number | null>(null);

  const holidays = useHolidays(year);
  const months = useMemo(() => quarterMonths(quarter), [quarter]);

  // ── Rule-violation map ─────────────────────────────────────────────────────
  const violations = useMemo<Map<number, string>>(() => {
    const map = new Map<number, string>();
    if (!isAdmin) return map;
    for (const n of nights) {
      if (n.cancelled) continue;
      const v = effectiveVagt(n);
      if (!v) continue;
      const violationList = validateAssignment(
        v.id,
        n,
        nights,
        effectiveVagt,
        vagter,
      );
      if (violationList.length > 0) {
        map.set(n.id, violationList.map((x) => x.message).join(" · "));
      }
    }
    return map;
  }, [nights, vagter, effectiveVagt, isAdmin]);

  // ── Auto-scroll while dragging ────────────────────────────────────────────
  const isDragging = draggingMemberId !== null;
  useEffect(() => {
    if (!isDragging) return;
    let rafId: number | null = null;
    function onDragOver(e: DragEvent) {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        const ZONE = 80;
        const { clientY } = e;
        const vh = window.innerHeight;
        if (clientY > vh - ZONE) {
          window.scrollBy({ top: Math.round(((clientY - (vh - ZONE)) / ZONE) * 12), behavior: "instant" });
        } else if (clientY < ZONE) {
          window.scrollBy({ top: -Math.round(((ZONE - clientY) / ZONE) * 12), behavior: "instant" });
        }
      });
    }
    window.addEventListener("dragover", onDragOver);
    return () => {
      window.removeEventListener("dragover", onDragOver);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [isDragging]);

  // ── Navigation handlers ────────────────────────────────────────────────────
  const goPrev = useCallback(() => {
    setQuarter((q) => {
      if (q === 1) {
        setYear((y) => y - 1);
        return 4;
      }
      return (q - 1) as 1 | 2 | 3 | 4;
    });
  }, []);

  const goNext = useCallback(() => {
    setQuarter((q) => {
      if (q === 4) {
        setYear((y) => y + 1);
        return 1;
      }
      return (q + 1) as 1 | 2 | 3 | 4;
    });
  }, []);

  const goToday = useCallback(() => {
    const t = new Date();
    setYear(t.getFullYear());
    setQuarter(getQuarter(t));
  }, []);

  const handlePrint = useCallback(() => {
    if (typeof window !== "undefined") window.print();
  }, []);

  // ── Cell handlers ──────────────────────────────────────────────────────────
  const handleCellDragEnd = useCallback(() => {
    setDragOverNightId(null);
  }, [setDragOverNightId]);

  const handleCellDragOver = useCallback(
    (_e: React.DragEvent, nightId: number) => {
      setDragOverNightId(nightId);
    },
    [setDragOverNightId],
  );

  const handleCellDragLeave = useCallback(() => {
    setDragOverNightId(null);
  }, [setDragOverNightId]);

  const handleCellDrop = useCallback(
    (e: React.DragEvent, nightId: number) => {
      const reassignFrom = e.dataTransfer.getData(REASSIGN_MIME);
      if (reassignFrom && Number(reassignFrom) !== nightId) {
        onCellReassignDrop(Number(reassignFrom), nightId);
      } else if (draggingMemberId !== null) {
        onCellDrop(nightId);
      }
      setDragOverNightId(null);
    },
    [draggingMemberId, onCellReassignDrop, onCellDrop, setDragOverNightId],
  );

  const handleCellClick = useCallback(
    (nightId: number) => {
      if (isMobile()) {
        onAssignClick(nightId);
        setPopoverNightId(null);
      } else {
        setPopoverNightId((current) => (current === nightId ? null : nightId));
      }
    },
    [onAssignClick],
  );

  return (
    <div className="flex flex-col gap-4">
      <CalendarHeader
        quarter={quarter}
        year={year}
        onPrev={goPrev}
        onNext={goNext}
        onToday={goToday}
        onPrint={handlePrint}
      />

      <div
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 print:grid-cols-3 print:gap-2"
        data-calendar-print-root
      >
        {months.map((m) => (
          <CalendarMonth
            key={m}
            year={year}
            monthIdx={m}
            nights={nights}
            pendingChanges={pendingChanges}
            autoAssignedIds={autoAssignedIds}
            problemNightIds={problemNightIds}
            dragOverNightId={dragOverNightId}
            isAdmin={isAdmin}
            effectiveVagt={effectiveVagt}
            holidays={holidays}
            violations={violations}
            popoverNightId={popoverNightId}
            onPopoverChange={setPopoverNightId}
            onCellDragEnd={handleCellDragEnd}
            onCellDragOver={handleCellDragOver}
            onCellDragLeave={handleCellDragLeave}
            onCellDrop={handleCellDrop}
            onCellClick={handleCellClick}
            onAssignClick={onAssignClick}
            onRemoveVagt={onRemoveVagt}
            onEdit={onEdit}
            onDelete={onDelete}
            onCancel={onCancel}
          />
        ))}
      </div>
    </div>
  );
}
