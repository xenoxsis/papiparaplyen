"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarPlus, LayoutGrid, LayoutList } from "lucide-react";
import {
  deleteClubNightFollow,
  getClubNights,
  getFollowingNightIds,
  postClubNightFollow,
  type ApiClubNight,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { NightCard } from "@/components/NightCard";
import { NightCardSkeleton } from "@/components/NightCardSkeleton";

export default function EventsPage() {
  const { user } = useAuth();
  const [nights, setNights] = useState<ApiClubNight[]>([]);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [loading, setLoading] = useState(true);
  const [followingIds, setFollowingIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    setLoading(true);
    getClubNights(true)
      .then((upcoming) => {
        setNights(
          upcoming
            .filter((n) => n.vagt_confirmed || n.cancelled)
            .sort((a, b) => a.date.localeCompare(b.date)),
        );
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!user) {
      setFollowingIds(new Set());
      return;
    }
    getFollowingNightIds()
      .then((ids) => setFollowingIds(new Set(ids)))
      .catch(() => setFollowingIds(new Set()));
  }, [user]);

  const handleFollowToggle = useCallback(
    async (nightId: number, follow: boolean) => {
      if (!user) return;
      setFollowingIds((prev) => {
        const next = new Set(prev);
        follow ? next.add(nightId) : next.delete(nightId);
        return next;
      });
      try {
        if (follow) await postClubNightFollow(nightId);
        else await deleteClubNightFollow(nightId);
      } catch {
        // Revert on error
        setFollowingIds((prev) => {
          const next = new Set(prev);
          follow ? next.delete(nightId) : next.add(nightId);
          return next;
        });
      }
    },
    [user],
  );

  const webcalUrl =
    typeof window !== "undefined"
      ? window.location.origin.replace(/^https?/, "webcal") +
        "/api/club-nights/ical"
      : "/api/club-nights/ical";

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
          <div className="flex items-center gap-2">
            <a
              href={webcalUrl}
              title="Abonnér på klubaftener i din kalender (opdateres automatisk)"
              className="hidden sm:inline-flex items-center gap-1.5 text-xs font-medium rounded-lg px-3 py-1.5 border border-neutral-200 bg-white text-neutral-600 hover:border-neutral-400 hover:text-neutral-900 transition-colors"
            >
              <CalendarPlus className="size-3.5" />
              Abonnér på kalender
            </a>
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
                  <NightCard
                    key={night.id}
                    night={night}
                    index={i}
                    isFollowing={
                      user && !night.cancelled
                        ? followingIds.has(night.id)
                        : undefined
                    }
                    onFollowToggle={
                      user && !night.cancelled
                        ? (f) => handleFollowToggle(night.id, f)
                        : undefined
                    }
                  />
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
                    isFollowing={
                      user && !night.cancelled
                        ? followingIds.has(night.id)
                        : undefined
                    }
                    onFollowToggle={
                      user && !night.cancelled
                        ? (f) => handleFollowToggle(night.id, f)
                        : undefined
                    }
                  />
                ))}
          </div>
        )}
      </div>
    </section>
  );
}
