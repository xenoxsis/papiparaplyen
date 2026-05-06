"use client";

import { useEffect, useState } from "react";
import { Calendar, Clock, LayoutGrid, LayoutList, MapPin } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { getClubNights, type ApiClubNight } from "@/lib/api";

export default function EventsPage() {
  const [nights, setNights] = useState<ApiClubNight[]>([]);
  const [view, setView] = useState<"grid" | "list">("grid");

  useEffect(() => {
    getClubNights()
      .then((all) => {
        const today = new Date().toISOString().slice(0, 10);
        setNights(
          all
            .filter((n) => n.date >= today && n.vagt_confirmed)
            .sort((a, b) => a.date.localeCompare(b.date)),
        );
      })
      .catch(console.error);
  }, []);

  return (
    <section className="bg-neutral-100 w-full min-h-[60vh]">
      <div className="max-w-285 mx-auto px-4 sm:px-8 py-10 sm:py-12 flex flex-col gap-8">
        <div className="flex items-end justify-between gap-4">
          <div className="flex flex-col gap-2">
            <span className="font-semibold uppercase text-blue-500 text-sm tracking-wider">
              Klubaftener
            </span>
            <h1 className="font-bold text-neutral-900 text-3xl">
              Alle kommende aftener
            </h1>
          </div>
          <div className="flex items-center gap-1 border border-neutral-200 rounded-lg p-1 bg-white">
            <button
              onClick={() => setView("grid")}
              className={`p-1.5 rounded-md transition-colors ${view === "grid" ? "bg-neutral-900 text-white" : "text-neutral-500 hover:text-neutral-700"}`}
              aria-label="Kortvisning"
            >
              <LayoutGrid className="size-4" />
            </button>
            <button
              onClick={() => setView("list")}
              className={`p-1.5 rounded-md transition-colors ${view === "list" ? "bg-neutral-900 text-white" : "text-neutral-500 hover:text-neutral-700"}`}
              aria-label="Listevisning"
            >
              <LayoutList className="size-4" />
            </button>
          </div>
        </div>

        {nights.length === 0 && (
          <p className="text-neutral-500 text-sm">
            Ingen kommende klubaftener planlagt endnu.
          </p>
        )}

        {view === "grid" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {nights.map((night, i) => {
              const d = new Date(night.date);
              const dateLabel = d.toLocaleDateString("da-DK", {
                weekday: "long",
                day: "numeric",
                month: "long",
              });
              const hasVagt = night.vagt_member_id !== null;
              const isNext = i === 0;

              return (
                <Card
                  key={night.id}
                  className={`border-t-4 flex flex-col ${isNext ? "border-t-[#E63946]" : "border-t-neutral-300"}`}
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
                    {hasVagt ? (
                      <div className="flex items-center gap-2 mt-1">
                        <span className="w-6 h-6 rounded-full bg-[#2a9d8f] text-white text-[0.6rem] font-bold flex items-center justify-center shrink-0">
                          {night.assigned_member_initials}
                        </span>
                        <span className="text-sm text-neutral-700">
                          {night.assigned_member_name}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-[#E63946] font-medium mt-1">
                        Ingen vagt tildelt endnu
                      </span>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {nights.map((night, i) => {
              const d = new Date(night.date);
              const dateLabel = d.toLocaleDateString("da-DK", {
                weekday: "short",
                day: "numeric",
                month: "short",
                year: "numeric",
              });
              const hasVagt = night.vagt_member_id !== null;
              const isNext = i === 0;

              return (
                <div
                  key={night.id}
                  className={`flex items-center gap-4 bg-white border rounded-xl px-4 py-3 ${isNext ? "border-l-4 border-l-[#E63946]" : ""}`}
                >
                  {/* Date badge */}
                  <div
                    className={`shrink-0 rounded-lg flex flex-col items-center justify-center w-12 h-12 text-white ${isNext ? "bg-[#E63946]" : "bg-neutral-400"}`}
                  >
                    <span className="font-bold text-base leading-5">
                      {d.getDate()}
                    </span>
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
                    {hasVagt ? (
                      <div className="flex items-center gap-1.5">
                        <span className="w-6 h-6 rounded-full bg-[#2a9d8f] text-white text-[0.6rem] font-bold flex items-center justify-center">
                          {night.assigned_member_initials}
                        </span>
                        <span className="text-xs text-neutral-700 hidden sm:block">
                          {night.assigned_member_name}
                        </span>
                      </div>
                    ) : (
                      <span className="text-[10px] text-[#E63946] font-medium">
                        Mangler vagt
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
