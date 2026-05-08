"use client";

import Link from "next/link";
import {
  Check,
  ChevronDown,
  Clock,
  MapPin,
  MessagesSquare,
  Trash2,
  UserMinus,
  UserPlus,
  Wand2,
  X,
} from "lucide-react";
import type { ApiClubNight, ApiMessage } from "@/lib/api";

type VagtInfo = { id: number; name: string; initials: string } | null;

interface ScheduleNightCardProps {
  night: ApiClubNight;
  vagt: VagtInfo;
  isPending: boolean;
  isAutoAssigned: boolean;
  isProblem: boolean;
  isOver: boolean;
  swapMsg: ApiMessage | null;
  myOptOut: boolean;
  canOptOut: boolean;
  isAdmin: boolean;
  userId: number | null;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: () => void;
  onDrop?: () => void;
  onAssign: () => void;
  onRemoveVagt: () => void;
  onDelete: () => void;
  onToggleOptOut: () => void;
}

export function ScheduleNightCard({
  night,
  vagt,
  isPending,
  isAutoAssigned,
  isProblem,
  isOver,
  swapMsg,
  myOptOut,
  canOptOut,
  isAdmin,
  userId,
  onDragOver,
  onDragLeave,
  onDrop,
  onAssign,
  onRemoveVagt,
  onDelete,
  onToggleOptOut,
}: ScheduleNightCardProps) {
  const d = new Date(night.date);
  const hasVagt = vagt !== null;

  return (
    <div
      {...(isAdmin
        ? {
            onDragOver,
            onDragLeave,
            onDrop,
          }
        : {})}
      className={`rounded-lg flex flex-col p-4 gap-3 border transition-colors ${
        isOver
          ? "border-brand-teal bg-brand-teal/5"
          : isProblem
            ? "border-red-400 bg-red-50"
            : isPending
              ? "border-brand-orange/60 bg-brand-orange/5"
              : hasVagt
                ? "border-neutral-200 bg-white"
                : "border-brand-red/40 bg-brand-red/5"
      }`}
    >
      {/* Top row: date badge + info + assignment badge */}
      <div className="flex items-center gap-4">
        <div
          className={`shrink-0 rounded-lg text-white flex flex-col justify-center items-center w-14 h-14 ${
            hasVagt ? "bg-brand-teal" : "bg-brand-red"
          }`}
        >
          <span className="font-medium uppercase text-[10px]">
            {d.toLocaleDateString("da-DK", { weekday: "short" })}
          </span>
          <span className="font-bold text-lg leading-5">{d.getDate()}</span>
          <span className="font-medium uppercase text-[10px] opacity-80">
            {d.toLocaleDateString("da-DK", { month: "short" })}
          </span>
        </div>
        <div className="flex flex-col flex-1 gap-1 min-w-0">
          <span className="font-semibold text-sm leading-5 truncate">
            {night.name}
          </span>
          <div className="text-neutral-500 text-xs leading-4 flex items-center gap-3">
            <span className="flex items-center gap-1">
              <Clock className="size-3" />
              {night.time_from} – {night.time_to}
            </span>
            <span className="flex items-center gap-1">
              <MapPin className="size-3" />
              {night.location}
            </span>
          </div>
          <div className="flex mt-1 items-center gap-2 flex-wrap">
            {hasVagt ? (
              <>
                <div
                  role={isAdmin ? "button" : undefined}
                  tabIndex={isAdmin ? 0 : undefined}
                  onClick={() => isAdmin && onAssign()}
                  onKeyDown={
                    isAdmin
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onAssign();
                          }
                        }
                      : undefined
                  }
                  aria-label={
                    isAdmin ? `Skift vagt for ${night.name}` : undefined
                  }
                  className={`rounded-full flex pl-1 pr-2 py-1 items-center gap-1 border ${
                    isPending
                      ? "bg-brand-orange/10 border-brand-orange/40"
                      : "bg-white border-neutral-200"
                  } ${isAdmin ? "cursor-pointer hover:border-neutral-400" : ""}`}
                >
                  <div className="w-6 h-6 rounded-full bg-brand-red text-white flex items-center justify-center text-[0.55rem] font-bold select-none shrink-0">
                    {vagt.initials}
                  </div>
                  <span className="text-xs leading-4">{vagt.name}</span>
                  {isAdmin && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveVagt();
                      }}
                      className="cursor-pointer text-neutral-400 border-none bg-transparent p-0 hover:text-neutral-700 transition-colors"
                    >
                      <X className="size-3" />
                    </button>
                  )}
                </div>
                {/* Confirmation status badge (saved assignments only) */}
                {!isPending &&
                  (night.vagt_confirmed ? (
                    <span className="flex items-center gap-1 text-[10px] font-medium text-brand-teal bg-brand-teal/10 rounded-full px-2 py-0.5">
                      <Check className="size-3" />
                      Bekræftet
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[10px] font-medium text-brand-orange bg-brand-orange/10 rounded-full px-2 py-0.5">
                      Afventer
                    </span>
                  ))}
              </>
            ) : isAdmin ? (
              <button
                onClick={onAssign}
                className={`rounded-lg sm:rounded-full border flex px-2.5 py-1.5 sm:py-1 items-center gap-1.5 transition-colors ${
                  isOver
                    ? "border-brand-teal bg-brand-teal/10 text-brand-teal"
                    : "border-brand-red/40 bg-brand-red sm:bg-brand-red/10 text-white sm:text-brand-red hover:bg-brand-red/20 sm:hover:bg-brand-red/20 sm:hover:border-brand-red/60"
                }`}
              >
                <UserPlus className="size-3.5 sm:size-3 shrink-0" />
                <span className="text-xs leading-4 font-medium">
                  {isOver ? "Slip for at tildele" : "Tildel vagt"}
                </span>
                <ChevronDown className="size-3 shrink-0 sm:hidden" />
              </button>
            ) : (
              <div className="rounded-full border border-dashed flex px-2 py-1 items-center gap-1 border-brand-red/30 bg-brand-red/10">
                <UserPlus className="size-3 text-brand-red" />
                <span className="text-xs leading-4 text-brand-red">
                  Ingen vagt tildelt
                </span>
              </div>
            )}
            {isProblem && (
              <span className="flex items-center gap-1 text-[10px] font-medium text-red-600 bg-red-100 rounded-full px-2 py-0.5">
                Ingen kandidat
              </span>
            )}
            {isAutoAssigned && isPending && (
              <span className="flex items-center gap-1 text-[10px] font-medium text-purple-700 bg-purple-100 rounded-full px-2 py-0.5">
                <Wand2 className="size-2.5" />
                Auto-tildelt
              </span>
            )}
            {isPending && !isAutoAssigned && (
              <span className="text-[10px] text-brand-orange font-medium">
                Ikke gemt
              </span>
            )}
            {swapMsg && (
              <Link
                href={`/member/profile?vagter=${swapMsg.id}`}
                className="flex items-center gap-1 rounded-full px-2 py-0.5 bg-blue-50 border border-blue-200 text-[10px] font-medium text-blue-600 hover:bg-blue-100 transition-colors"
              >
                <MessagesSquare className="size-3" />
                Afbud anmodet
              </Link>
            )}
          </div>
        </div>
        {isAdmin && (
          <button
            onClick={onDelete}
            className="shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-md border-none bg-transparent text-neutral-400 hover:text-brand-red hover:bg-brand-red/10 transition-colors cursor-pointer"
            title="Slet klubaften"
          >
            <Trash2 className="size-3.5" />
          </button>
        )}
      </div>

      {/* Bottom row: opt-outs + opt-out button */}
      {(night.opted_out_members.length > 0 || !!userId) && (
        <div className="flex items-center gap-2 flex-wrap border-t border-neutral-100 pt-2">
          {night.opted_out_members.length > 0 && (
            <>
              <span className="text-[10px] text-neutral-400 font-medium uppercase tracking-wide">
                Meldt fra:
              </span>
              {night.opted_out_members.map((o) => (
                <div
                  key={o.id}
                  title={o.name}
                  className="rounded-full flex pl-1 pr-2 py-0.5 items-center gap-1 border bg-neutral-50 border-neutral-200"
                >
                  <div className="w-5 h-5 rounded-full bg-neutral-400 text-white flex items-center justify-center text-[0.5rem] font-bold select-none shrink-0">
                    {o.initials}
                  </div>
                  <span className="text-[10px] text-neutral-500">{o.name}</span>
                </div>
              ))}
            </>
          )}
          {canOptOut && userId && night.vagt_member_id !== userId && (
            <button
              onClick={onToggleOptOut}
              className={`ml-auto flex items-center gap-1 text-[10px] font-medium rounded-full px-2 py-0.5 border cursor-pointer transition-colors ${
                myOptOut
                  ? "bg-neutral-100 border-neutral-300 text-neutral-600 hover:bg-neutral-200"
                  : "bg-brand-red/10 border-brand-red/30 text-brand-red hover:bg-brand-red/20"
              }`}
            >
              <UserMinus className="size-3" />
              {myOptOut ? "Annuller framelding" : "Meld fra"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
