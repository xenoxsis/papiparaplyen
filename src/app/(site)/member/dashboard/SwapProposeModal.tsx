"use client";

import { useMemo, useState } from "react";
import { ArrowDownUp, Clock, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/Modal";
import { MemberAvatar } from "@/components/MemberAvatar";
import { DateBadge } from "@/components/DateBadge";
import type { ApiClubNight } from "@/lib/api";

interface SwapProposeModalProps {
  open: boolean;
  onClose: () => void;
  /** The shift the member is offering. */
  myShift: ApiClubNight | null;
  /** Other members' upcoming shifts that are legal swap targets. */
  candidates: ApiClubNight[];
  submitting?: boolean;
  onSubmit: (toNightId: number, message: string) => void;
}

const longDate = (iso: string) =>
  new Date(iso).toLocaleDateString("da-DK", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

export function SwapProposeModal({
  open,
  onClose,
  myShift,
  candidates,
  submitting = false,
  onSubmit,
}: SwapProposeModalProps) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter(
      (n) =>
        n.name.toLowerCase().includes(q) ||
        (n.assigned_member_name ?? "").toLowerCase().includes(q),
    );
  }, [candidates, query]);

  function handleClose() {
    setSelectedId(null);
    setMessage("");
    setQuery("");
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      panelClassName="p-6 flex flex-col gap-4"
    >
      <div className="flex flex-col gap-1">
        <h2 className="font-semibold text-base text-neutral-900 dark:text-neutral-100">
          Byt vagt
        </h2>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          Vælg den vagt du vil bytte dig til. Accepterer den anden vagt, bliver
          begge vagter byttet og bekræftet med det samme.
        </p>
      </div>

      {myShift && (
        <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 p-3 flex items-center gap-3">
          <DateBadge date={myShift.date} colorClass="bg-brand-red" />
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="text-[10px] uppercase tracking-wide font-semibold text-neutral-400">
              Du afgiver
            </span>
            <span className="font-semibold text-sm text-neutral-900 dark:text-neutral-100 truncate">
              {myShift.name}
            </span>
            <span className="text-xs text-neutral-500">
              {longDate(myShift.date)} · {myShift.time_from}–{myShift.time_to}
            </span>
          </div>
        </div>
      )}

      <div className="flex items-center justify-center">
        <ArrowDownUp className="size-4 text-neutral-400" />
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-[10px] uppercase tracking-wide font-semibold text-neutral-400">
          Du overtager
        </span>
        {candidates.length > 5 && (
          <div className="relative">
            <Search className="size-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Søg på vagt eller aften…"
              className="w-full h-9 pl-9 pr-3 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-transparent text-sm text-neutral-900 dark:text-neutral-100 outline-none placeholder:text-neutral-400 focus:border-neutral-400"
            />
          </div>
        )}

        <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
          {filtered.length === 0 && (
            <p className="text-sm text-neutral-400 py-6 text-center">
              {candidates.length === 0
                ? "Der er ingen vagter du kan bytte dig til lige nu"
                : "Ingen vagter matcher søgningen"}
            </p>
          )}
          {filtered.map((night) => {
            const selected = selectedId === night.id;
            return (
              <button
                key={night.id}
                type="button"
                onClick={() => setSelectedId(night.id)}
                className={`w-full text-left rounded-lg border p-3 flex items-center gap-3 transition-colors cursor-pointer ${
                  selected
                    ? "border-brand-teal bg-brand-teal/5"
                    : "border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 hover:bg-neutral-50 dark:hover:bg-neutral-800"
                }`}
              >
                <DateBadge
                  date={night.date}
                  colorClass={selected ? "bg-brand-teal" : "bg-brand-orange"}
                />
                <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                  <span className="font-semibold text-sm text-neutral-900 dark:text-neutral-100 truncate">
                    {night.name}
                  </span>
                  <span className="flex items-center gap-1 text-xs text-neutral-500">
                    <Clock className="size-3" />
                    {night.time_from}–{night.time_to}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <MemberAvatar
                    initials={night.assigned_member_initials ?? "?"}
                    size="sm"
                    colorClass="bg-brand-orange"
                    memberId={night.vagt_member_id ?? undefined}
                    hasAvatar={night.vagt_member_has_avatar}
                  />
                  <span className="text-xs font-medium text-neutral-600 dark:text-neutral-300 truncate max-w-24">
                    {night.assigned_member_name}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <textarea
        className="w-full h-20 border border-neutral-200 dark:border-neutral-700 bg-transparent text-neutral-900 dark:text-neutral-100 rounded-lg px-3 py-2 text-sm outline-none font-[inherit] resize-none placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:border-neutral-400"
        placeholder="Skriv en besked til den anden vagt (valgfrit)…"
        maxLength={500}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
      />

      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={handleClose}>
          Annuller
        </Button>
        <Button
          className="bg-brand-teal hover:bg-teal-700 text-white"
          disabled={selectedId === null || submitting}
          onClick={() => selectedId !== null && onSubmit(selectedId, message)}
        >
          {submitting ? "Sender…" : "Send forslag"}
        </Button>
      </div>
    </Modal>
  );
}
