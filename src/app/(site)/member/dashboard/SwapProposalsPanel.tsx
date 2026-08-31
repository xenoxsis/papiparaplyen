"use client";

import { ArrowDownUp, Clock, MapPin, RefreshCcw } from "lucide-react";
import { MemberAvatar } from "@/components/MemberAvatar";
import { DateBadge } from "@/components/DateBadge";
import type { ApiShiftSwap, ApiShiftSwapNight } from "@/lib/api";

interface SwapProposalsPanelProps {
  swaps: ApiShiftSwap[];
  userId: number;
  /** Swap id currently being acted on — disables its buttons. */
  busyId: number | null;
  onAccept: (id: number) => void;
  onDecline: (id: number) => void;
  onCancel: (id: number) => void;
}

function NightLine({
  label,
  night,
  accent,
}: {
  label: string;
  night: ApiShiftSwapNight;
  accent: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <DateBadge date={night.date} colorClass={accent} size="sm" />
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-[10px] uppercase tracking-wide font-semibold text-neutral-400">
          {label}
        </span>
        <span className="font-semibold text-sm text-neutral-900 dark:text-neutral-100 truncate">
          {night.name}
        </span>
        <div className="flex items-center gap-2 text-xs text-neutral-500">
          <span className="flex items-center gap-1">
            <Clock className="size-3" />
            {night.time_from}–{night.time_to}
          </span>
          <span className="flex items-center gap-1 truncate">
            <MapPin className="size-3 shrink-0" />
            {night.location}
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * Live mutual swap proposals ("Byt vagt") for the signed-in member:
 * incoming ones to answer, outgoing ones to withdraw.
 */
export function SwapProposalsPanel({
  swaps,
  userId,
  busyId,
  onAccept,
  onDecline,
  onCancel,
}: SwapProposalsPanelProps) {
  if (swaps.length === 0) return null;

  return (
    <div className="bg-white dark:bg-neutral-900 rounded-xl border-l-4 border-brand-teal p-6 flex flex-col gap-4 shadow-sm w-full min-w-0">
      <div className="flex items-center gap-2">
        <RefreshCcw className="size-5 text-brand-teal shrink-0" />
        <h2 className="font-semibold text-base text-neutral-900 dark:text-neutral-100">
          Vagtbytte
        </h2>
        <span className="ml-auto text-xs font-semibold bg-brand-teal/15 text-brand-teal rounded-full px-2 py-0.5">
          {swaps.length}
        </span>
      </div>

      <div className="flex flex-col gap-3">
        {swaps.map((swap) => {
          const incoming = swap.to_member.id === userId;
          const other = incoming ? swap.from_member : swap.to_member;
          // Always shown from the reader's own perspective.
          const youGive = incoming ? swap.to_night : swap.from_night;
          const youGet = incoming ? swap.from_night : swap.to_night;
          const busy = busyId === swap.id;

          return (
            <div
              key={swap.id}
              className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 p-3 flex flex-col gap-3"
            >
              <div className="flex items-center gap-2">
                <MemberAvatar
                  initials={other.initials}
                  size="sm"
                  colorClass="bg-brand-teal"
                  memberId={other.id}
                  hasAvatar={other.has_avatar}
                />
                <p className="text-xs text-neutral-600 dark:text-neutral-300 leading-snug">
                  {incoming ? (
                    <>
                      <span className="font-semibold">{other.name}</span> vil
                      bytte vagt med dig
                    </>
                  ) : (
                    <>
                      Du har foreslået et bytte til{" "}
                      <span className="font-semibold">{other.name}</span>
                    </>
                  )}
                </p>
              </div>

              {swap.message && (
                <p className="text-xs italic text-neutral-500 dark:text-neutral-400 border-l-2 border-neutral-300 dark:border-neutral-600 pl-2">
                  {swap.message}
                </p>
              )}

              <div className="flex flex-col gap-2">
                <NightLine
                  label="Du afgiver"
                  night={youGive}
                  accent="bg-brand-red"
                />
                <div className="flex justify-center">
                  <ArrowDownUp className="size-3.5 text-neutral-400" />
                </div>
                <NightLine
                  label="Du overtager"
                  night={youGet}
                  accent="bg-brand-teal"
                />
              </div>

              {incoming ? (
                <>
                  <div className="flex gap-2">
                    <button
                      onClick={() => onAccept(swap.id)}
                      disabled={busy}
                      className="flex-1 h-8 rounded-lg bg-brand-teal text-white text-xs font-semibold hover:bg-teal-700 transition-colors cursor-pointer border-none disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      Accepter bytte
                    </button>
                    <button
                      onClick={() => onDecline(swap.id)}
                      disabled={busy}
                      className="flex-1 h-8 rounded-lg bg-white dark:bg-transparent border border-brand-red/40 text-brand-red text-xs font-semibold hover:bg-brand-red/5 transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      Afvis
                    </button>
                  </div>
                  <p className="text-[0.65rem] text-neutral-400 text-center">
                    Accepterer du, er begge vagter bekræftet med det samme
                  </p>
                </>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-[0.65rem] text-neutral-400 italic flex-1">
                    Afventer svar…
                  </span>
                  <button
                    onClick={() => onCancel(swap.id)}
                    disabled={busy}
                    className="h-8 px-3 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-600 dark:text-neutral-300 text-xs font-medium hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    Træk tilbage
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
