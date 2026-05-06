"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, Clock, MapPin, User, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getMembers, type ApiMember } from "@/lib/api";

function today() {
  return new Date().toISOString().split("T")[0];
}

export function ClubNightModal({
  nextNumber,
  existingDates = [],
  onClose,
  onAdd,
}: {
  nextNumber: number;
  existingDates?: string[];
  onClose: () => void;
  onAdd: (data: {
    name: string;
    date: string;
    timeFrom: string;
    timeTo: string;
    location: string;
    vagt_member_id: number | null;
  }) => void;
}) {
  const [name, setName] = useState("Klubaften");
  const [date, setDate] = useState(today());
  const [timeFrom, setTimeFrom] = useState("18:00");
  const [timeTo, setTimeTo] = useState("23:00");
  const [location, setLocation] = useState("Cafe Paraplyen");
  const [vagtId, setVagtId] = useState<string>("none");
  const [vagter, setVagter] = useState<ApiMember[]>([]);
  const overlayRef = useRef<HTMLDivElement>(null);

  const isDuplicate = existingDates.includes(date);
  const isPast = date < today();
  const isBlocked = isDuplicate || isPast;

  useEffect(() => {
    getMembers()
      .then((members) =>
        setVagter(members.filter((m) => m.roles.includes("Vagt") && !m.banned)),
      )
      .catch(() => {});
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
    onAdd({
      name,
      date,
      timeFrom,
      timeTo,
      location,
      vagt_member_id: vagtId === "none" ? null : Number(vagtId),
    });
    onClose();
  }

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6 flex flex-col gap-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarDays className="size-5 text-[#e63946]" />
            <h2 className="font-semibold text-neutral-900">Tilføj klubaften</h2>
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
            <label className="text-xs font-medium text-neutral-700 uppercase tracking-wider">
              Navn
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          {/* Dato */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-neutral-700 uppercase tracking-wider flex items-center gap-1.5">
              <CalendarDays className="size-3.5" /> Dato
            </label>
            <Input
              type="date"
              value={date}
              min={today()}
              onChange={(e) => setDate(e.target.value)}
              required
            />
            {isDuplicate && (
              <p className="text-xs text-[#e63946] flex items-center gap-1">
                <CalendarDays className="size-3.5 shrink-0" />
                Der er allerede en klubaften på denne dato.
              </p>
            )}
            {isPast && (
              <p className="text-xs text-[#e63946] flex items-center gap-1">
                <CalendarDays className="size-3.5 shrink-0" />
                Datoen kan ikke være i fortiden.
              </p>
            )}
          </div>

          {/* Tid */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-neutral-700 uppercase tracking-wider flex items-center gap-1.5">
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
            <label className="text-xs font-medium text-neutral-700 uppercase tracking-wider flex items-center gap-1.5">
              <MapPin className="size-3.5" /> Lokale
            </label>
            <Input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              required
            />
          </div>

          {/* Vagt */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-neutral-700 uppercase tracking-wider flex items-center gap-1.5">
              <User className="size-3.5" /> Vagt{" "}
              <span className="normal-case text-neutral-400 font-normal">
                (valgfri)
              </span>
            </label>
            <select
              value={vagtId}
              onChange={(e) => setVagtId(e.target.value)}
              className="h-10 rounded-md border border-neutral-200 bg-white px-3 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900 focus:ring-offset-0"
            >
              <option value="none">Ingen vagt valgt</option>
              {vagter.map((v) => (
                <option key={v.id} value={String(v.id)}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>

          {/* Actions */}
          <div className="flex gap-2 justify-end pt-1">
            <Button type="button" variant="outline" onClick={onClose}>
              Annullér
            </Button>
            <Button
              type="submit"
              disabled={isBlocked}
              className="bg-[#e63946] hover:bg-red-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Tilføj klubaften
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
