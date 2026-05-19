import { Bell, BellOff, Calendar, Clock, MapPin } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { ApiClubNight } from "@/lib/api";

interface NightCardProps {
  night: ApiClubNight;
  /** Index in list — 0 = "next night" styling */
  index?: number;
  variant?: "card" | "row";
  /** If provided, a follow/unfollow button is shown */
  isFollowing?: boolean;
  onFollowToggle?: (following: boolean) => void;
}

/** Shared night card used on the home page (card grid) and events page (grid + list row). */
export function NightCard({
  night,
  index = 0,
  variant = "card",
  isFollowing,
  onFollowToggle,
}: NightCardProps) {
  const d = new Date(night.date);
  const isNext = index === 0;
  const hasVagt = night.vagt_member_id !== null;

  const VagtBadge = () =>
    hasVagt ? (
      <div className="flex items-center gap-1.5">
        <span className="w-6 h-6 rounded-full bg-brand-teal text-white text-[0.6rem] font-bold flex items-center justify-center shrink-0">
          {night.assigned_member_initials}
        </span>
        <span className="text-sm text-neutral-700 hidden sm:block">
          {night.assigned_member_name}
        </span>
      </div>
    ) : (
      <span className="text-xs text-brand-red font-medium">
        Ingen vagt tildelt endnu
      </span>
    );

  const AflystOverlay = () =>
    night.cancelled ? (
      <>
        <div className="absolute inset-0 bg-neutral-100/60 z-10 pointer-events-none" />
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
          <span className="font-black text-4xl text-red-600 rotate-[-25deg] tracking-widest uppercase select-none border-4 border-red-600 px-4 py-1 opacity-75">
            Aflyst
          </span>
        </div>
      </>
    ) : null;

  if (variant === "row") {
    const dateLabel = d.toLocaleDateString("da-DK", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });

    return (
      <div
        className={`relative overflow-hidden flex items-center gap-4 bg-white border rounded-xl px-4 py-3 ${isNext ? "border-l-4 border-l-brand-red" : ""}`}
      >
        <AflystOverlay />

        {/* Date badge */}
        <div
          className={`shrink-0 rounded-lg flex flex-col items-center justify-center w-12 h-12 text-white ${isNext ? "bg-brand-red" : "bg-neutral-400"}`}
        >
          <span className="font-bold text-base leading-5">{d.getDate()}</span>
          <span className="text-[10px] uppercase font-medium opacity-90">
            {d.toLocaleDateString("da-DK", { month: "short" })}
          </span>
        </div>

        {/* Name + date */}
        <div className="flex flex-col gap-0.5 min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {isNext && (
              <span className="text-[10px] font-semibold uppercase text-red-600 bg-red-50 px-1.5 py-0.5 rounded-full shrink-0">
                Næste
              </span>
            )}
            <span className="font-semibold text-sm text-neutral-900 truncate">
              {night.name}
            </span>
          </div>
          <span className="text-xs text-neutral-500 capitalize">
            {dateLabel}
          </span>
        </div>

        {/* Time */}
        <div className="hidden sm:flex items-center gap-1.5 text-xs text-neutral-500 shrink-0">
          <Clock className="size-3.5" />
          {night.time_from} - {night.time_to}
        </div>

        {/* Location */}
        <div className="hidden md:flex items-center gap-1.5 text-xs text-neutral-500 shrink-0">
          <MapPin className="size-3.5" />
          {night.location}
        </div>

        {/* Vagt */}
        <div className="shrink-0">
          <VagtBadge />
        </div>

        {/* Follow — hidden for cancelled nights */}
        {onFollowToggle !== undefined && !night.cancelled && (
          <button
            onClick={() => onFollowToggle(!isFollowing)}
            title={isFollowing ? "Stop med at følge" : "Følg denne aften"}
            className={`shrink-0 p-1.5 rounded-lg border transition-colors ${isFollowing ? "border-blue-300 bg-blue-50 text-blue-600 hover:bg-blue-100" : "border-neutral-200 bg-white text-neutral-400 hover:text-neutral-700 hover:border-neutral-400"}`}
          >
            {isFollowing ? (
              <BellOff className="size-3.5" />
            ) : (
              <Bell className="size-3.5" />
            )}
          </button>
        )}
      </div>
    );
  }

  // --- card (grid) variant ---
  const dateLabel = d.toLocaleDateString("da-DK", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <Card
      className={`relative overflow-hidden border-t-4 flex flex-col ${isNext ? "border-t-brand-red" : "border-t-neutral-300"}`}
    >
      <AflystOverlay />
      <CardHeader className="flex flex-col gap-2">
        <span
          className={`font-semibold uppercase text-xs tracking-wider flex items-center gap-1 rounded-full px-2 py-0.5 w-fit ${isNext ? "bg-red-50 text-red-600" : "bg-neutral-100 text-neutral-500"}`}
        >
          <Calendar className="size-3" />
          {isNext ? "Næste aften" : `Klubaften #${night.number}`}
        </span>
        <h3 className="font-bold text-xl text-neutral-900 capitalize">
          {dateLabel}
        </h3>
        <p className="text-neutral-500 text-sm">{night.name}</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 pt-0 pb-6">
        <div className="flex items-center gap-2 text-sm text-neutral-900">
          <Clock className="size-4 text-neutral-500 shrink-0" />
          {night.time_from} - {night.time_to}
        </div>
        <div className="flex items-center gap-2 text-sm text-neutral-900">
          <MapPin className="size-4 text-neutral-500 shrink-0" />
          {night.location}
        </div>
        <div className="mt-1 flex items-center justify-between gap-2">
          <VagtBadge />
          {/* Follow — hidden for cancelled nights */}
          {onFollowToggle !== undefined && !night.cancelled && (
            <button
              onClick={() => onFollowToggle(!isFollowing)}
              title={isFollowing ? "Stop med at følge" : "Følg denne aften"}
              className={`shrink-0 flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border transition-colors ${isFollowing ? "border-blue-300 bg-blue-50 text-blue-600 hover:bg-blue-100" : "border-neutral-200 bg-white text-neutral-500 hover:border-neutral-400 hover:text-neutral-800"}`}
            >
              {isFollowing ? (
                <BellOff className="size-3" />
              ) : (
                <Bell className="size-3" />
              )}
              {isFollowing ? "Følger" : "Følg"}
            </button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
