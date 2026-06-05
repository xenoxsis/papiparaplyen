"use client";

import {
  Clock,
  MapPin,
  Pencil,
  Send,
  Trash2,
  UserMinus,
  UserPlus,
  X,
  XCircle,
} from "lucide-react";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import type { ApiClubNight } from "@/lib/api";

type VagtInfo = {
  id: number;
  name: string;
  initials: string;
  has_avatar?: boolean;
} | null;

export interface DayDetailPopoverProps {
  night: ApiClubNight;
  vagt: VagtInfo;
  isPending: boolean;
  isAdmin: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAssign: () => void;
  onRemoveVagt: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onCancel?: () => void;
  onPublish?: () => void;
  /** Render-prop for the trigger element. */
  children: React.ReactNode;
}

export function DayDetailPopover({
  night,
  vagt,
  isPending,
  isAdmin,
  open,
  onOpenChange,
  onAssign,
  onRemoveVagt,
  onEdit,
  onDelete,
  onCancel,
  onPublish,
  children,
}: DayDetailPopoverProps) {
  const isPast =
    new Date(`${night.date}T${night.time_to || "23:59:59"}`) < new Date();
  const dateLabel = new Date(night.date).toLocaleDateString("da-DK", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor asChild>{children}</PopoverAnchor>
      <PopoverContent className="w-80 p-0" align="center">
        <div className="flex items-start justify-between px-4 pt-4 pb-2 border-b border-neutral-100 dark:border-neutral-800">
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="font-semibold text-sm text-neutral-900 dark:text-neutral-100 truncate">
              {night.name}
            </span>
            <span className="text-xs text-neutral-500 dark:text-neutral-400 first-letter:uppercase">
              {dateLabel}
            </span>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="w-7 h-7 flex items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors shrink-0"
            aria-label="Luk"
          >
            <X className="size-3.5" />
          </button>
        </div>

        <div className="px-4 py-3 flex flex-col gap-2 text-xs text-neutral-600 dark:text-neutral-300">
          <div className="flex items-center gap-2">
            <Clock className="size-3.5 text-neutral-400" />
            <span>
              {night.time_from} – {night.time_to}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <MapPin className="size-3.5 text-neutral-400" />
            <span>{night.location}</span>
          </div>
          {night.cancelled && (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-red-600 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/40 rounded-full px-2 py-0.5 self-start">
              Aflyst
            </span>
          )}
        </div>

        {/* Assignment */}
        <div className="px-4 pb-3 flex flex-col gap-2 border-t border-neutral-100 dark:border-neutral-800 pt-3">
          {vagt ? (
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-brand-red text-white flex items-center justify-center text-[0.55rem] font-bold shrink-0 overflow-hidden">
                {vagt.has_avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/members/${vagt.id}/avatar`}
                    alt={vagt.initials}
                    width={28}
                    height={28}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  vagt.initials
                )}
              </div>
              <div className="flex flex-col flex-1 min-w-0">
                <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate">
                  {vagt.name}
                </span>
                <span className="text-[10px] text-neutral-500 dark:text-neutral-400">
                  {isPending
                    ? "Ugemt ændring"
                    : night.vagt_confirmed
                      ? "Bekræftet"
                      : "Afventer bekræftelse"}
                </span>
              </div>
              {isAdmin && !night.cancelled && !isPast && (
                <button
                  onClick={() => {
                    onRemoveVagt();
                    onOpenChange(false);
                  }}
                  className="inline-flex items-center justify-center w-7 h-7 rounded-md border-none bg-transparent text-neutral-400 hover:text-brand-red hover:bg-brand-red/10 transition-colors cursor-pointer"
                  aria-label="Fjern vagt"
                  title="Fjern vagt"
                >
                  <UserMinus className="size-3.5" />
                </button>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs text-brand-red">
              <UserPlus className="size-3.5" />
              <span className="font-medium">Ingen vagt tildelt</span>
            </div>
          )}

          {/* Opted-out members */}
          {night.opted_out_members.length > 0 && (
            <div className="flex flex-col gap-1 pt-2 border-t border-neutral-100 dark:border-neutral-800">
              <span className="text-[10px] text-neutral-400 font-medium uppercase tracking-wide">
                Meldt fra
              </span>
              <div className="flex flex-wrap gap-1">
                {night.opted_out_members.map((o) => (
                  <div
                    key={o.id}
                    title={o.name}
                    className="rounded-full flex pl-0.5 pr-1.5 py-0.5 items-center gap-1 border bg-neutral-50 dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700"
                  >
                    <div className="w-4 h-4 rounded-full bg-neutral-400 text-white flex items-center justify-center text-[0.45rem] font-bold shrink-0">
                      {o.initials}
                    </div>
                    <span className="text-[10px] text-neutral-500 dark:text-neutral-400">
                      {o.name}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Admin actions */}
        {isAdmin && !isPast && (
          <div className="border-t border-neutral-100 dark:border-neutral-800 px-3 py-2 flex items-center gap-1 flex-wrap">
            <button
              onClick={() => {
                onAssign();
                onOpenChange(false);
              }}
              className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-md text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
            >
              <UserPlus className="size-3.5" />
              {vagt ? "Skift vagt" : "Tildel vagt"}
            </button>
            {!night.cancelled && night.status === "draft" && onPublish && (
              <button
                onClick={() => {
                  onPublish();
                  onOpenChange(false);
                }}
                className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-md text-amber-600 hover:bg-amber-500/10 transition-colors cursor-pointer"
              >
                <Send className="size-3.5" />
                Udgiv
              </button>
            )}
            {!night.cancelled && (
              <button
                onClick={() => {
                  onEdit();
                  onOpenChange(false);
                }}
                className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-md text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
              >
                <Pencil className="size-3.5" />
                Rediger
              </button>
            )}
            {!night.cancelled &&
              (night.vagt_confirmed && onCancel ? (
                <button
                  onClick={() => {
                    onCancel();
                    onOpenChange(false);
                  }}
                  className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-md text-brand-red hover:bg-brand-red/10 transition-colors ml-auto cursor-pointer"
                >
                  <XCircle className="size-3.5" />
                  Aflys
                </button>
              ) : (
                <button
                  onClick={() => {
                    onDelete();
                    onOpenChange(false);
                  }}
                  className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-md text-brand-red hover:bg-brand-red/10 transition-colors ml-auto cursor-pointer"
                >
                  <Trash2 className="size-3.5" />
                  Slet
                </button>
              ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
