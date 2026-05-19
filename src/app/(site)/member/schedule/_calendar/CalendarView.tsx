"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ApiClubNight, ApiMember } from "@/lib/api";
import { validateAssignment } from "@/lib/schedule-validation";
import { CalendarHeader } from "./CalendarHeader";
import { CalendarMonth } from "./CalendarMonth";
import {
  getQuarter,
  monthNameDa,
  quarterLabelDa,
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

/** Returns the number of month columns currently visible on desktop (2 or 3). */
function desktopCols(): 2 | 3 {
  if (typeof window === "undefined") return 3;
  return window.matchMedia("(min-width: 1024px)").matches ? 3 : 2;
}

/** Step a {year, month} forward or back by `step` months. */
function stepMonth(year: number, month: number, step: number): { year: number; month: number } {
  let m = month + step;
  let y = year;
  while (m > 11) { m -= 12; y++; }
  while (m < 0)  { m += 12; y--; }
  return { year: y, month: m };
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

  // ── Mobile: single-month navigation ───────────────────────────────────────
  const [mobileMonth, setMobileMonth] = useState<number>(() => now.getMonth());
  const [mobileYear, setMobileYear]   = useState<number>(() => now.getFullYear());

  // ── Desktop: first visible month + how many cols are showing ──────────────
  // Start snapped to the current quarter's first month for the lg view,
  // or current 2-month block for md.
  const [desktopStart, setDesktopStart] = useState<{ year: number; month: number }>(() => {
    const q = getQuarter(now);
    return { year: now.getFullYear(), month: quarterMonths(q)[0] };
  });
  const [cols, setCols] = useState<2 | 3>(() => desktopCols());
  const [isDesktop, setIsDesktop] = useState<boolean>(() =>
    typeof window !== "undefined" ? window.matchMedia("(min-width: 768px)").matches : true,
  );

  useEffect(() => {
    function updateCols() { setCols(desktopCols()); }
    function updateDesktop(e: MediaQueryListEvent) { setIsDesktop(e.matches); }
    const mqLg = window.matchMedia("(min-width: 1024px)");
    const mqMd = window.matchMedia("(min-width: 768px)");
    mqLg.addEventListener("change", updateCols);
    mqMd.addEventListener("change", updateDesktop);
    // Sync initial state immediately in case SSR defaulted differently
    setCols(desktopCols());
    setIsDesktop(mqMd.matches);
    return () => {
      mqLg.removeEventListener("change", updateCols);
      mqMd.removeEventListener("change", updateDesktop);
    };
  }, []);

  // Months to render on desktop: `cols` consecutive months from desktopStart.
  const desktopMonths = useMemo<{ year: number; month: number }[]>(() => {
    return Array.from({ length: cols }, (_, i) =>
      stepMonth(desktopStart.year, desktopStart.month, i),
    );
  }, [desktopStart, cols]);

  // For holiday fetching we may need up to two different years.
  const desktopYear1 = desktopStart.year;
  const desktopYear2 = desktopMonths[desktopMonths.length - 1].year;

  const holidaysDesktop1 = useHolidays(desktopYear1);
  const holidaysDesktop2 = useHolidays(desktopYear2);
  const holidaysMobile   = useHolidays(mobileYear);

  function getHolidays(year: number) {
    if (year === desktopYear1) return holidaysDesktop1;
    if (year === desktopYear2) return holidaysDesktop2;
    return holidaysDesktop1;
  }

  // ── Rule-violation map ─────────────────────────────────────────────────────
  const violations = useMemo<Map<number, string>>(() => {
    const map = new Map<number, string>();
    if (!isAdmin) return map;
    for (const n of nights) {
      if (n.cancelled) continue;
      const v = effectiveVagt(n);
      if (!v) continue;
      const violationList = validateAssignment(v.id, n, nights, effectiveVagt, vagter);
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
    setDesktopStart((s) => stepMonth(s.year, s.month, -cols));
  }, [cols]);

  const goNext = useCallback(() => {
    setDesktopStart((s) => stepMonth(s.year, s.month, cols));
  }, [cols]);

  const goPrevMonth = useCallback(() => {
    const next = stepMonth(mobileYear, mobileMonth, -1);
    setMobileYear(next.year);
    setMobileMonth(next.month);
  }, [mobileYear, mobileMonth]);

  const goNextMonth = useCallback(() => {
    const next = stepMonth(mobileYear, mobileMonth, 1);
    setMobileYear(next.year);
    setMobileMonth(next.month);
  }, [mobileYear, mobileMonth]);

  const goToday = useCallback(() => {
    const t = new Date();
    const q = getQuarter(t);
    setDesktopStart({ year: t.getFullYear(), month: quarterMonths(q)[0] });
    setMobileYear(t.getFullYear());
    setMobileMonth(t.getMonth());
  }, []);

  const handlePrint = useCallback(() => {
    if (typeof window === "undefined") return;
    const el = document.querySelector("[data-calendar-print-root]") as HTMLElement | null;
    if (!el) { window.print(); return; }

    // Collect all <link rel="stylesheet"> and <style> from the current page.
    const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
      .map((n) => n.outerHTML)
      .join("\n");

    const win = window.open("", "_blank", "width=1200,height=800");
    if (!win) { window.print(); return; }

    win.document.write(`<!DOCTYPE html><html><head>
      <meta charset="utf-8">
      ${styles}
      <style>
        #print-toolbar {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 12px 16px;
          background: #f5f5f5;
          border-bottom: 1px solid #e5e5e5;
          font-family: ui-sans-serif, system-ui, sans-serif;
          font-size: 14px;
        }
        #print-toolbar button {
          padding: 6px 16px;
          background: #0a0a0a;
          color: #fff;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
        }
        #print-toolbar button:hover { background: #333; }
        #print-toolbar label {
          display: flex;
          align-items: center;
          gap: 6px;
          cursor: pointer;
          user-select: none;
        }
        @media print {
          #print-toolbar { display: none !important; }
          .vagt-badge { display: var(--vagt-display, flex); }
        }
      </style>
      <script>
        function toggleVagter(checked) {
          document.querySelectorAll('[data-vagt-badge], [data-optout-dots]').forEach(function(el) {
            el.style.display = checked ? '' : 'none';
          });
        }
        function toggleGenericName(checked) {
          document.querySelectorAll('[data-night-name]').forEach(function(el) {
            el.textContent = checked ? 'Pap i Paraplyen' : el.getAttribute('data-night-name');
          });
        }
        window.onload = function() {
          document.querySelectorAll('[data-calendar-print-root]').forEach(function(root) {
            root.querySelectorAll('.rounded-full.border.shrink-0').forEach(function(el) {
              el.setAttribute('data-vagt-badge', '');
            });
          });
        };
      <\/script>
    </head><body>
      <div id="print-toolbar">
        <button onclick="window.print()">Udskriv</button>
        <label>
          <input type="checkbox" checked onchange="toggleVagter(this.checked)" />
          Vis vagter
        </label>
        <label>
          <input type="checkbox" onchange="toggleGenericName(this.checked)" />
          Brug "Pap i Paraplyen"
        </label>
      </div>
      ${el.outerHTML}
    </body></html>`);
    win.document.close();
  }, []);

  // ── Cell handlers ──────────────────────────────────────────────────────────
  const handleCellDragEnd = useCallback(() => {
    setDragOverNightId(null);
  }, [setDragOverNightId]);

  const handleCellDragOver = useCallback(
    (_e: React.DragEvent, nightId: number) => { setDragOverNightId(nightId); },
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

  const [popoverNightId, setPopoverNightId] = useState<number | null>(null);

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

  const sharedMonthProps = {
    nights,
    pendingChanges,
    autoAssignedIds,
    problemNightIds,
    dragOverNightId,
    isDragging,
    draggingMemberId,
    isAdmin,
    effectiveVagt,
    violations,
    popoverNightId,
    onPopoverChange: setPopoverNightId,
    onCellDragEnd: handleCellDragEnd,
    onCellDragOver: handleCellDragOver,
    onCellDragLeave: handleCellDragLeave,
    onCellDrop: handleCellDrop,
    onCellClick: handleCellClick,
    onAssignClick,
    onRemoveVagt,
    onEdit,
    onDelete,
    onCancel,
  };

  // Header label for desktop
  const desktopLabel = (() => {
    const first = desktopMonths[0];
    const last  = desktopMonths[desktopMonths.length - 1];
    const crossYear = first.year !== last.year;
    const monthRange = crossYear
      ? `${monthNameDa(first.month)} ${first.year} – ${monthNameDa(last.month)} ${last.year}`
      : `${monthNameDa(first.month)} – ${monthNameDa(last.month)}`;
    if (cols === 3) {
      // Quarter label: Q1–Q4 + year as subtitle
      const q = (Math.floor(first.month / 3) + 1) as 1 | 2 | 3 | 4;
      return {
        primary: `${quarterLabelDa(q)} ${first.year}`,
        secondary: crossYear ? monthRange : `${monthNameDa(first.month)} – ${monthNameDa(last.month)} ${first.year}`,
      };
    }
    // 2-column: show month range as primary, year as secondary
    return {
      primary: monthRange,
      secondary: crossYear ? "" : String(first.year),
    };
  })();

  return (
    <div className="flex flex-col gap-4">
      <CalendarHeader
        desktopPrimary={desktopLabel.primary}
        desktopSecondary={desktopLabel.secondary}
        mobileMonth={mobileMonth}
        mobileYear={mobileYear}
        onPrev={goPrev}
        onNext={goNext}
        onPrevMonth={goPrevMonth}
        onNextMonth={goNextMonth}
        onToday={goToday}
        onPrint={handlePrint}
      />

      {/* Mobile: single month (only mounted when actually mobile) */}
      {!isDesktop && (
        <CalendarMonth
          key={`${mobileYear}-${mobileMonth}`}
          year={mobileYear}
          monthIdx={mobileMonth}
          holidays={holidaysMobile}
          {...sharedMonthProps}
        />
      )}

      {/* Desktop: 2 or 3 months depending on breakpoint (only mounted when desktop) */}
      {isDesktop && (
        <div
          className="grid md:grid-cols-2 lg:grid-cols-3 gap-3 print:grid-cols-3 print:gap-2"
          data-calendar-print-root
        >
          {desktopMonths.map(({ year, month }) => (
            <CalendarMonth
              key={`${year}-${month}`}
              year={year}
              monthIdx={month}
              holidays={getHolidays(year)}
              {...sharedMonthProps}
            />
          ))}
        </div>
      )}
    </div>
  );
}
