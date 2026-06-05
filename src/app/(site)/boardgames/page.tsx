"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLink, Search } from "lucide-react";
import {
  getBoardgames,
  getClubBoardgames,
  type ApiBoardgame,
  type ApiClubBoardgame,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

// ── Weight bar ────────────────────────────────────────────────────────────────

function WeightBar({ value }: { value: number | null }) {
  if (value === null)
    return <span className="text-neutral-400 text-xs">—</span>;
  const pct = Math.min(100, Math.max(0, (value / 5) * 100));
  const label =
    value < 1.5
      ? "Let"
      : value < 2.5
        ? "Medium-let"
        : value < 3.5
          ? "Medium"
          : value < 4.5
            ? "Medium-tung"
            : "Tung";
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="relative h-2 w-20 rounded-full bg-neutral-200 shrink-0">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-brand-teal"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-neutral-500 dark:text-neutral-400 whitespace-nowrap">
        {value.toFixed(1)} <span className="hidden sm:inline">— {label}</span>
      </span>
    </div>
  );
}

// ── Player count ──────────────────────────────────────────────────────────────

function PlayerCount({ min, max }: { min: number | null; max: number | null }) {
  if (min === null && max === null)
    return <span className="text-neutral-400 text-xs">—</span>;
  if (min === max || max === null) return <span>{min}</span>;
  if (min === null) return <span>{max}</span>;
  return (
    <span>
      {min}–{max}
    </span>
  );
}

// ── Sort helpers ──────────────────────────────────────────────────────────────

type SortKey =
  | "name"
  | "avg_weight"
  | "year_published"
  | "min_players"
  | "playing_time";
type SortDir = "asc" | "desc";

// Club games omit `owners`; member games include it. Filtering/sorting only
// touch the shared fields, so we operate on the common (club) shape.
type BaseGame = ApiClubBoardgame;

function sortGames<T extends BaseGame>(
  games: T[],
  key: SortKey,
  dir: SortDir,
): T[] {
  return [...games].sort((a, b) => {
    const av = a[key] ?? (dir === "asc" ? Infinity : -Infinity);
    const bv = b[key] ?? (dir === "asc" ? Infinity : -Infinity);
    if (typeof av === "string" && typeof bv === "string") {
      return dir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    }
    return dir === "asc"
      ? (av as number) - (bv as number)
      : (bv as number) - (av as number);
  });
}

// ── Column header ─────────────────────────────────────────────────────────────

function ColHeader({
  label,
  sortKey,
  currentKey,
  dir,
  onSort,
  className,
}: {
  label: string;
  sortKey: SortKey;
  currentKey: SortKey;
  dir: SortDir;
  onSort: (k: SortKey) => void;
  className?: string;
}) {
  const active = currentKey === sortKey;
  return (
    <th
      className={`px-4 py-3 text-left text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide cursor-pointer select-none hover:text-neutral-800 dark:hover:text-neutral-100 whitespace-nowrap ${className ?? ""}`}
      onClick={() => onSort(sortKey)}
    >
      {label}{" "}
      <span className="text-neutral-300">
        {active ? (dir === "asc" ? "↑" : "↓") : "↕"}
      </span>
    </th>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

type Tab = "club" | "members";

export default function BoardgamesPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("club");
  const [clubGames, setClubGames] = useState<ApiClubBoardgame[]>([]);
  const [memberGames, setMemberGames] = useState<ApiBoardgame[]>([]);
  const [loading, setLoading] = useState(true);
  const [nameFilter, setNameFilter] = useState("");
  const [playerFilter, setPlayerFilter] = useState("");
  const [weightMin, setWeightMin] = useState("");
  const [weightMax, setWeightMax] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  useEffect(() => {
    Promise.all([getClubBoardgames(), getBoardgames()])
      .then(([club, members]) => {
        setClubGames(club);
        setMemberGames(members);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const showOwners = tab === "members";
  const sourceGames: BaseGame[] = tab === "club" ? clubGames : memberGames;

  const filtered = useMemo(() => {
    let list = sourceGames;

    if (nameFilter.trim()) {
      const q = nameFilter.trim().toLowerCase();
      list = list.filter((g) => g.name.toLowerCase().includes(q));
    }

    const playerCount = parseInt(playerFilter, 10);
    if (!isNaN(playerCount) && playerCount > 0) {
      list = list.filter(
        (g) =>
          (g.min_players ?? 0) <= playerCount &&
          (g.max_players ?? Infinity) >= playerCount,
      );
    }

    const wMin = parseFloat(weightMin);
    if (!isNaN(wMin)) {
      list = list.filter((g) => g.avg_weight !== null && g.avg_weight >= wMin);
    }

    const wMax = parseFloat(weightMax);
    if (!isNaN(wMax)) {
      list = list.filter((g) => g.avg_weight !== null && g.avg_weight <= wMax);
    }

    return sortGames(list, sortKey, sortDir);
  }, [
    sourceGames,
    nameFilter,
    playerFilter,
    weightMin,
    weightMax,
    sortKey,
    sortDir,
  ]);

  const colProps = { currentKey: sortKey, dir: sortDir, onSort: handleSort };

  return (
    <main className="bg-neutral-100 dark:bg-neutral-950 min-h-[calc(100vh-3.5rem)] p-4 sm:p-8 flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">
          Brætspil
        </h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          {tab === "club" ? (
            "Spil der altid er tilgængelige i klubben"
          ) : (
            <>
              Spil ejet af klubbens medlemmer.{" "}
              {!user && (
                <span>
                  <Link
                    href="/login"
                    className="underline hover:text-neutral-700"
                  >
                    Log ind
                  </Link>{" "}
                  for at se ejerinformation.
                </span>
              )}
            </>
          )}
        </p>
      </div>

      {/* Tabs */}
      <div className="inline-flex self-start rounded-lg bg-neutral-200 dark:bg-neutral-800 p-1 gap-1">
        {(
          [
            { key: "club", label: "Spil i klubben" },
            { key: "members", label: "Medlemmernes spil" },
          ] as { key: Tab; label: string }[]
        ).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 h-9 rounded-md text-sm font-medium transition-colors cursor-pointer ${
              tab === t.key
                ? "bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 shadow-sm"
                : "text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-neutral-100"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-700 p-4 shadow-sm flex flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-1 flex-1 min-w-40">
          <label className="text-xs font-medium text-neutral-600 dark:text-neutral-300">
            Søg efter spil
          </label>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-neutral-400" />
            <input
              type="text"
              value={nameFilter}
              onChange={(e) => setNameFilter(e.target.value)}
              placeholder="Navn…"
              className="h-9 w-full pl-8 pr-3 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-300"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1 w-32">
          <label className="text-xs font-medium text-neutral-600 dark:text-neutral-300">
            Antal spillere
          </label>
          <input
            type="number"
            min={1}
            value={playerFilter}
            onChange={(e) => setPlayerFilter(e.target.value)}
            placeholder="F.eks. 4"
            className="h-9 w-full px-3 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-300"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-neutral-600 dark:text-neutral-300">
            Sværhedsgrad (1–5)
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={5}
              step={0.5}
              value={weightMin}
              onChange={(e) => setWeightMin(e.target.value)}
              placeholder="Min"
              className="h-9 w-20 px-3 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-300"
            />
            <span className="text-neutral-400 text-sm">–</span>
            <input
              type="number"
              min={1}
              max={5}
              step={0.5}
              value={weightMax}
              onChange={(e) => setWeightMax(e.target.value)}
              placeholder="Max"
              className="h-9 w-20 px-3 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-neutral-300"
            />
          </div>
        </div>

        {(nameFilter || playerFilter || weightMin || weightMax) && (
          <button
            onClick={() => {
              setNameFilter("");
              setPlayerFilter("");
              setWeightMin("");
              setWeightMax("");
            }}
            className="h-9 px-4 rounded-lg border border-neutral-200 dark:border-neutral-700 text-sm text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 cursor-pointer bg-white dark:bg-neutral-900"
          >
            Ryd filtre
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-700 shadow-sm overflow-x-auto">
        {loading ? (
          <div className="p-8 text-center text-sm text-neutral-500">
            Henter spil…
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-neutral-500">
            {sourceGames.length === 0
              ? tab === "club"
                ? "Ingen spil er registreret som tilgængelige i klubben endnu."
                : "Ingen spil registreret endnu."
              : "Ingen spil matcher dine filtre."}
          </div>
        ) : (
          <table className="w-full text-sm text-left">
            <thead className="border-b border-neutral-200 dark:border-neutral-700">
              <tr>
                <ColHeader label="Navn" sortKey="name" {...colProps} />
                <ColHeader
                  label="Spillere"
                  sortKey="min_players"
                  {...colProps}
                  className="hidden sm:table-cell"
                />
                <ColHeader label="Sværhed" sortKey="avg_weight" {...colProps} />
                <ColHeader
                  label="År"
                  sortKey="year_published"
                  {...colProps}
                  className="hidden md:table-cell"
                />
                <ColHeader
                  label="Spilletid"
                  sortKey="playing_time"
                  {...colProps}
                  className="hidden lg:table-cell"
                />
                <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">
                  BGG
                </th>
                {showOwners && (
                  <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wide">
                    Ejere
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {filtered.map((game) => {
                const owners = showOwners ? (game as ApiBoardgame).owners : [];
                const ownerNames = owners
                  .map((o) => o.name)
                  .filter(Boolean) as string[];
                const hasAnonymous = owners.some((o) => o.name === null);

                return (
                  <tr
                    key={game.bgg_id}
                    className="hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
                  >
                    <td className="px-4 py-3 font-medium text-neutral-900 dark:text-neutral-100">
                      {game.name}
                    </td>
                    <td className="px-4 py-3 text-neutral-600 dark:text-neutral-300 hidden sm:table-cell">
                      <PlayerCount
                        min={game.min_players}
                        max={game.max_players}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <WeightBar value={game.avg_weight} />
                    </td>
                    <td className="px-4 py-3 text-neutral-600 dark:text-neutral-300 hidden md:table-cell">
                      {game.year_published ?? (
                        <span className="text-neutral-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-neutral-600 dark:text-neutral-300 hidden lg:table-cell">
                      {game.playing_time ? (
                        `${game.playing_time} min`
                      ) : (
                        <span className="text-neutral-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <a
                        href={`https://boardgamegeek.com/boardgame/${game.bgg_id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-brand-teal hover:underline text-xs"
                        aria-label={`BGG side for ${game.name}`}
                      >
                        BGG <ExternalLink className="size-3" />
                      </a>
                    </td>
                    {showOwners && (
                      <td className="px-4 py-3 text-neutral-600 dark:text-neutral-300 text-xs">
                        {!user ? (
                          <span className="text-neutral-400 italic">
                            Log ind for at se
                          </span>
                        ) : ownerNames.length === 0 && !hasAnonymous ? (
                          <span className="text-neutral-400">—</span>
                        ) : (
                          <span>
                            {ownerNames.join(", ")}
                            {hasAnonymous && ownerNames.length > 0 && ", "}
                            {hasAnonymous && (
                              <span className="text-neutral-400 italic">
                                Anonym
                              </span>
                            )}
                          </span>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer count */}
      {!loading && filtered.length > 0 && (
        <p className="text-xs text-neutral-400 text-center">
          Viser {filtered.length} af {sourceGames.length} spil
        </p>
      )}
    </main>
  );
}
