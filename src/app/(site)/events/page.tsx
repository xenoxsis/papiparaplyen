"use client";

import { useEffect, useState } from "react";
import { LayoutGrid, LayoutList } from "lucide-react";
import { getClubNights, type ApiClubNight } from "@/lib/api";
import { NightCard } from "@/components/NightCard";
import { NightCardSkeleton } from "@/components/NightCardSkeleton";

export default function EventsPage() {
  const [nights, setNights] = useState<ApiClubNight[]>([]);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getClubNights()
      .then((all) => {
        const now = new Date();
        setNights(
          all
            .filter((n) => {
              const start = new Date(`${n.date}T${n.time_from}`);
              return start > now && n.vagt_confirmed;
            })
            .sort((a, b) => a.date.localeCompare(b.date)),
        );
      })
      .catch(console.error)
      .finally(() => setLoading(false));
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

        {!loading && nights.length === 0 && (
          <p className="text-neutral-500 text-sm">
            Ingen kommende klubaftener planlagt endnu.
          </p>
        )}

        {view === "grid" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {loading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <NightCardSkeleton key={i} variant="card" />
                ))
              : nights.map((night, i) => (
                  <NightCard key={night.id} night={night} index={i} />
                ))}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {loading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <NightCardSkeleton key={i} variant="row" />
                ))
              : nights.map((night, i) => (
                  <NightCard
                    key={night.id}
                    night={night}
                    index={i}
                    variant="row"
                  />
                ))}
          </div>
        )}
      </div>
    </section>
  );
}
