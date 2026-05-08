import { Calendar, Clock, MapPin } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { ApiClubNight } from "@/lib/api";

interface NightCardProps {
  night: ApiClubNight;
  /** Index in list — 0 = "next night" styling */
  index?: number;
  variant?: "card" | "row";
}

/** Shared night card used on the home page (card grid) and events page (grid + list row). */
export function NightCard({
  night,
  index = 0,
  variant = "card",
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

  if (variant === "row") {
    const dateLabel = d.toLocaleDateString("da-DK", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });

    return (
      <div
        className={`flex items-center gap-4 bg-white border rounded-xl px-4 py-3 ${isNext ? "border-l-4 border-l-brand-red" : ""}`}
      >
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
      className={`border-t-4 flex flex-col ${isNext ? "border-t-brand-red" : "border-t-neutral-300"}`}
    >
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
        <div className="mt-1">
          <VagtBadge />
        </div>
      </CardContent>
    </Card>
  );
}
