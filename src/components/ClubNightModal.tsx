"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  CalendarDays,
  Clock,
  MapPin,
  User,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getMembers, getLocations, type ApiClubNight, type ApiMember, type ApiLocation } from "@/lib/api";

// ── Default times (configure here at build time) ─────────────────────────────
const DEFAULT_TIMES: Record<"sunday" | "other", { from: string; to: string }> =
  {
    sunday: { from: "12:00", to: "18:00" },
    other: { from: "18:00", to: "23:00" },
  };

const DAY_NAMES = [
  "Søndag",
  "Mandag",
  "Tirsdag",
  "Onsdag",
  "Torsdag",
  "Fredag",
  "Lørdag",
];

function today() {
  return new Date().toISOString().split("T")[0];
}

function defaultTimesForDate(dateStr: string) {
  const day = new Date(dateStr).getDay(); // 0 = Sunday
  return day === 0 ? DEFAULT_TIMES.sunday : DEFAULT_TIMES.other;
}

function dayNameForDate(dateStr: string) {
  if (!dateStr) return "";
  return DAY_NAMES[new Date(dateStr).getDay()];
}

/** Two "HH:MM" windows overlap when each starts before the other ends.
 *  Zero-padded times compare lexicographically, so string compare works.
 *  Must stay in sync with the SQL check in the backend POST handler. */
function timesOverlap(aFrom: string, aTo: string, bFrom: string, bTo: string) {
  return aFrom < bTo && aTo > bFrom;
}

type ExistingNight = Pick<
  ApiClubNight,
  "id" | "date" | "time_from" | "time_to" | "cancelled" | "name"
>;

export function ClubNightModal({
  nextNumber,
  existingNights = [],
  onClose,
  onAdd,
  night,
  onEdit,
}: {
  nextNumber?: number;
  existingNights?: ExistingNight[];
  onClose: () => void;
  onAdd?: (data: {
    name: string;
    date: string;
    timeFrom: string;
    timeTo: string;
    location_id: number | null;
    vagt_member_id: number | null;
    replacedCancelledIds: number[];
  }) => void;
  /** When provided, the modal runs in edit mode */
  night?: ApiClubNight;
  onEdit?: (data: {
    name: string;
    timeFrom: string;
    timeTo: string;
    location_id: number | null;
  }) => void;
}) {
  const isEditMode = night !== undefined;

  const [name, setName] = useState(night?.name ?? "Klubaften");
  const [date, setDate] = useState(today());
  const [timeFrom, setTimeFrom] = useState(
    night?.time_from ?? defaultTimesForDate(today()).from,
  );
  const [timeTo, setTimeTo] = useState(
    night?.time_to ?? defaultTimesForDate(today()).to,
  );
  const [locationId, setLocationId] = useState<number | null>(night?.location_id ?? 1);
  const [locations, setLocations] = useState<ApiLocation[]>([]);
  const [vagtId, setVagtId] = useState<string>("none");
  const [vagter, setVagter] = useState<ApiMember[]>([]);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Same-day conflict logic (add mode only):
  //  - a live (non-cancelled) night that day blocks creation;
  //  - cancelled nights that overlap the chosen times will be replaced (deleted).
  const sameDayNights = isEditMode
    ? []
    : existingNights.filter((n) => n.date === date);
  const hasActiveConflict = sameDayNights.some((n) => !n.cancelled);
  const replacedCancelled = sameDayNights.filter(
    (n) => n.cancelled && timesOverlap(n.time_from, n.time_to, timeFrom, timeTo),
  );
  const isPast = !isEditMode && date < today();
  const isBlocked = hasActiveConflict || isPast || !locationId;

  // Detect destructive changes (time or location changed) in edit mode
  const hasDestructiveChange = useMemo(() => {
    if (!isEditMode || !night) return false;
    return (
      timeFrom !== night.time_from ||
      timeTo !== night.time_to ||
      locationId !== night.location_id
    );
  }, [isEditMode, night, timeFrom, timeTo, locationId]);

  const showWarning = hasDestructiveChange && !!night?.vagt_member_id;

  useEffect(() => {
    getMembers()
      .then((members) =>
        setVagter(members.filter((m) => m.roles.includes("Vagt") && !m.banned)),
      )
      .catch((err) => {
        console.error(err);
        toast.error("Kunne ikke hente vagtliste.");
      });
    getLocations()
      .then(setLocations)
      .catch((err) => {
        console.error(err);
        toast.error("Kunne ikke hente lokationer.");
      });
  }, []);

  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === overlayRef.current) onClose();
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isBlocked) return;
    if (isEditMode) {
      onEdit?.({ name, timeFrom, timeTo, location_id: locationId });
    } else {
      onAdd?.({
        name,
        date,
        timeFrom,
        timeTo,
        location_id: locationId,
        vagt_member_id: vagtId === "none" ? null : Number(vagtId),
        replacedCancelledIds: replacedCancelled.map((n) => n.id),
      });
    }
    onClose();
  }

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
    >
      <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-xl w-full max-w-md mx-4 p-6 flex flex-col gap-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarDays className="size-5 text-brand-red" />
            <h2 className="font-semibold text-neutral-900 dark:text-neutral-100">
              {isEditMode ? "Rediger klubaften" : "Tilføj klubaften"}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-700 transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Navn */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
              Navn
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          {/* Dato — hidden in edit mode */}
          {!isEditMode && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300 uppercase tracking-wider flex items-center gap-1.5">
                <CalendarDays className="size-3.5" /> Dato
              </label>
              <Input
                type="date"
                value={date}
                min={today()}
                onChange={(e) => {
                  const d = e.target.value;
                  setDate(d);
                  const defaults = defaultTimesForDate(d);
                  setTimeFrom(defaults.from);
                  setTimeTo(defaults.to);
                }}
                required
              />
              {date && (
                <p className="text-xs text-neutral-500">
                  {dayNameForDate(date)}
                </p>
              )}
              {hasActiveConflict && (
                <p className="text-xs text-brand-red flex items-center gap-1">
                  <CalendarDays className="size-3.5 shrink-0" />
                  Der er allerede en klubaften på denne dato.
                </p>
              )}
              {isPast && (
                <p className="text-xs text-brand-red flex items-center gap-1">
                  <CalendarDays className="size-3.5 shrink-0" />
                  Datoen kan ikke være i fortiden.
                </p>
              )}
            </div>
          )}

          {/* Tid */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300 uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="size-3.5" /> Tid
            </label>
            <div className="flex items-center gap-2">
              <Input
                type="time"
                value={timeFrom}
                onChange={(e) => setTimeFrom(e.target.value)}
                className="flex-1"
                required
              />
              <span className="text-neutral-400 text-sm shrink-0">-</span>
              <Input
                type="time"
                value={timeTo}
                onChange={(e) => setTimeTo(e.target.value)}
                className="flex-1"
                required
              />
            </div>
          </div>

          {/* Lokale */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300 uppercase tracking-wider flex items-center gap-1.5">
              <MapPin className="size-3.5" /> Lokale
            </label>
            <select
              value={locationId ?? ""}
              onChange={(e) =>
                setLocationId(e.target.value ? Number(e.target.value) : null)
              }
              required
              className="h-10 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 text-sm text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-300 focus:ring-offset-0"
            >
              <option value="">Vælg lokation…</option>
              {locations.map((l) => (
                <option key={l.id} value={String(l.id)}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>

          {/* Vagt — only shown in add mode */}
          {!isEditMode && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-neutral-700 dark:text-neutral-300 uppercase tracking-wider flex items-center gap-1.5">
                <User className="size-3.5" /> Vagt{" "}
                <span className="normal-case text-neutral-400 font-normal">
                  (valgfri)
                </span>
              </label>
              <select
                value={vagtId}
                onChange={(e) => setVagtId(e.target.value)}
                className="h-10 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 text-sm text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-300 focus:ring-offset-0"
              >
                <option value="none">Ingen vagt valgt</option>
                {vagter.map((v) => (
                  <option key={v.id} value={String(v.id)}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Replace-cancelled warning (add mode) — the new night overwrites an
              overlapping cancelled aften, which will be permanently deleted. */}
          {!isEditMode && !isBlocked && replacedCancelled.length > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-300 dark:border-amber-700/50 bg-amber-50 dark:bg-amber-950/30 px-3 py-2.5">
              <AlertTriangle className="size-4 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800 dark:text-amber-300 leading-5">
                {replacedCancelled.length === 1 ? (
                  <>
                    Dette erstatter en aflyst klubaften (
                    <span className="font-semibold">
                      {replacedCancelled[0].name}
                    </span>{" "}
                    · {replacedCancelled[0].time_from}–
                    {replacedCancelled[0].time_to}). Den{" "}
                    <span className="font-semibold">slettes</span>, når du
                    opretter den nye.
                  </>
                ) : (
                  <>
                    Dette erstatter{" "}
                    <span className="font-semibold">
                      {replacedCancelled.length} aflyste klubaftener
                    </span>{" "}
                    på denne dato, som <span className="font-semibold">slettes</span>,
                    når du opretter den nye.
                  </>
                )}
              </p>
            </div>
          )}

          {/* Destructive-change warning */}
          {showWarning && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-300 dark:border-amber-700/50 bg-amber-50 dark:bg-amber-950/30 px-3 py-2.5">
              <AlertTriangle className="size-4 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800 dark:text-amber-300 leading-5">
                <span className="font-semibold">
                  {night?.assigned_member_name ?? "Den tildelte vagt"}
                </span>{" "}
                er tildelt denne aften. Ændringer i tid eller sted vil{" "}
                <span className="font-semibold">
                  fjerne vagttildelingen og nulstille alle frameldinger
                </span>
                .
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 justify-end pt-1">
            <Button type="button" variant="outline" onClick={onClose}>
              Annullér
            </Button>
            <Button
              type="submit"
              disabled={isBlocked}
              className="bg-brand-red hover:bg-red-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isEditMode
                ? "Gem ændringer"
                : replacedCancelled.length > 0
                  ? "Opret og erstat"
                  : "Tilføj klubaften"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
