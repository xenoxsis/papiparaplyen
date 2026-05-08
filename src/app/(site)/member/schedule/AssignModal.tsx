"use client";

import { useState } from "react";
import { Check, Search, UserMinus, X } from "lucide-react";
import type { ApiClubNight, ApiMember } from "@/lib/api";

type VagtInfo = { id: number; name: string; initials: string } | null;

interface AssignModalProps {
  night: ApiClubNight;
  currentVagt: VagtInfo;
  vagter: ApiMember[];
  onAssign: (nightId: number, memberId: number) => void;
  onRemoveVagt: (nightId: number) => void;
  onClose: () => void;
}

export function AssignModal({
  night,
  currentVagt,
  vagter,
  onAssign,
  onRemoveVagt,
  onClose,
}: AssignModalProps) {
  const [search, setSearch] = useState("");
  const query = search.toLowerCase();
  const filtered = vagter.filter((m) => m.name.toLowerCase().includes(query));

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      {/* Sheet */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl shadow-2xl flex flex-col max-h-[75vh]">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-neutral-200" />
        </div>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100 shrink-0">
          <div className="flex flex-col">
            <span className="font-semibold text-sm text-neutral-900">
              Tildel vagt
            </span>
            <span className="text-xs text-neutral-500 truncate">
              {night.name}
            </span>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-neutral-100 text-neutral-500 hover:bg-neutral-200 transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>
        {/* Search */}
        <div className="px-4 py-2 shrink-0">
          <div className="relative">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
            <input
              autoFocus
              placeholder="Søg vagt…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-9 pl-9 pr-3 text-sm rounded-lg border border-neutral-200 outline-none bg-white placeholder:text-neutral-400 focus:border-neutral-400 font-[inherit]"
            />
          </div>
        </div>
        {/* List */}
        <div className="flex flex-col overflow-y-auto px-2 pb-4 gap-1">
          {/* Remove option */}
          {currentVagt && (
            <button
              onClick={() => {
                onRemoveVagt(night.id);
                onClose();
              }}
              className="flex items-center gap-3 px-3 py-3 rounded-xl text-left hover:bg-red-50 transition-colors"
            >
              <div className="w-10 h-10 rounded-full bg-brand-red/10 text-brand-red flex items-center justify-center shrink-0">
                <UserMinus className="size-4" />
              </div>
              <span className="text-sm font-medium text-brand-red">
                Fjern vagt
              </span>
            </button>
          )}
          {filtered.length === 0 && (
            <p className="text-sm text-neutral-400 text-center py-4">
              Ingen vagter fundet
            </p>
          )}
          {filtered.map((m) => {
            const isCurrent = currentVagt?.id === m.id;
            return (
              <button
                key={m.id}
                onClick={() => {
                  onAssign(night.id, m.id);
                  onClose();
                }}
                className={`flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-colors ${
                  isCurrent ? "bg-brand-teal/10" : "hover:bg-neutral-50"
                }`}
              >
                <div className="w-10 h-10 rounded-full bg-brand-red text-white flex items-center justify-center text-xs font-bold shrink-0">
                  {m.initials}
                </div>
                <div className="flex flex-col flex-1 min-w-0">
                  <span className="text-sm font-medium text-neutral-900 truncate">
                    {m.name}
                  </span>
                  <span className="text-xs text-neutral-400">Vagt</span>
                </div>
                {isCurrent && (
                  <Check className="size-4 text-brand-teal shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
