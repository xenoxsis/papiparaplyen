"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BarChart3,
  CalendarDays,
  Eye,
  MessageSquare,
  Puzzle,
  RefreshCw,
  Users,
} from "lucide-react";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { Skeleton } from "@/components/ui/skeleton";
import { getStats, type ApiStats, type StatsDays } from "@/lib/api";

// ── Helpers ──────────────────────────────────────────────────────────────────

const RANGES: { days: StatsDays; label: string }[] = [
  { days: 7, label: "7 dage" },
  { days: 30, label: "30 dage" },
  { days: 90, label: "90 dage" },
  { days: 365, label: "12 mdr." },
];

const PAGE_LABELS: Record<string, string> = {
  "/": "Forside",
  "/about": "Om os",
  "/events": "Events",
  "/calendar": "Kalender",
  "/boardgames": "Brætspil",
  "/praktisk": "Praktisk",
  "/privacy": "Privatlivspolitik",
  "/login": "Login",
  "/member/dashboard": "Medlemsområde",
  "/member/profile": "Profil",
  "/member/schedule": "Vagtplan",
  "/member/vagter": "Vagt Info",
  "/member/admin": "Brugeradmin",
  "/member/admin/logs": "Logbog",
  "/member/admin/stats": "Statistik",
};

const DEVICE_LABELS: Record<string, string> = {
  desktop: "Computer",
  mobile: "Mobil",
  tablet: "Tablet",
};

const fmt = (n: number) => n.toLocaleString("da-DK");
const pct = (part: number, whole: number) =>
  whole > 0 ? Math.round((part / whole) * 100) : 0;

function shortDate(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("da-DK", { day: "numeric", month: "short" });
}

// ── Building blocks ──────────────────────────────────────────────────────────

function Card({
  title,
  icon: Icon,
  children,
  className = "",
}: {
  title: string;
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-xl p-4 sm:p-5 ${className}`}
    >
      <h2 className="flex items-center gap-2 text-sm font-semibold text-neutral-900 dark:text-neutral-100 mb-4">
        {Icon && <Icon className="size-4 text-neutral-500 dark:text-neutral-400" />}
        {title}
      </h2>
      {children}
    </section>
  );
}

function Kpi({
  label,
  value,
  sub,
  trend,
  live,
}: {
  label: string;
  value: number;
  sub?: string;
  trend?: { current: number; previous: number };
  live?: boolean;
}) {
  let trendEl: React.ReactNode = null;
  if (trend && trend.previous > 0) {
    const change = Math.round(
      ((trend.current - trend.previous) / trend.previous) * 100,
    );
    trendEl = (
      <span
        className={`text-xs font-medium ${
          change >= 0
            ? "text-green-600 dark:text-green-400"
            : "text-brand-red"
        }`}
      >
        {change >= 0 ? "▲" : "▼"} {Math.abs(change)}%
      </span>
    );
  }
  return (
    <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-xl p-4">
      <p className="flex items-center gap-1.5 text-xs font-medium text-neutral-500 dark:text-neutral-400">
        {live && (
          <span className="relative flex size-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-60 animate-ping" />
            <span className="relative inline-flex size-2 rounded-full bg-green-500" />
          </span>
        )}
        {label}
      </p>
      <div className="flex items-baseline gap-2 mt-1">
        <span className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">
          {fmt(value)}
        </span>
        {trendEl}
      </div>
      {sub && (
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">{sub}</p>
      )}
    </div>
  );
}

/** Horizontal bar list — widths are runtime values, so inline styles. */
function BarList({
  rows,
  colour = "#2a9d8f",
  empty = "Ingen data endnu",
}: {
  rows: { label: string; value: number; hint?: string }[];
  colour?: string;
  empty?: string;
}) {
  if (rows.length === 0)
    return <p className="text-sm text-neutral-400">{empty}</p>;
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="flex flex-col gap-1.5">
      {rows.map((r) => (
        <li key={r.label} className="relative">
          <div
            className="absolute inset-y-0 left-0 rounded-md opacity-15"
            style={{ width: `${(r.value / max) * 100}%`, backgroundColor: colour }}
          />
          <div className="relative flex items-center justify-between gap-3 px-2 py-1 text-sm">
            <span className="truncate text-neutral-800 dark:text-neutral-200" title={r.label}>
              {r.label}
            </span>
            <span className="shrink-0 tabular-nums text-neutral-600 dark:text-neutral-300">
              {fmt(r.value)}
              {r.hint && (
                <span className="text-xs text-neutral-400 ml-1.5">{r.hint}</span>
              )}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

function DailyChart({ data }: { data: ApiStats["visitors"]["daily"] }) {
  const max = Math.max(...data.map((d) => d.views), 1);
  const labelEvery = Math.ceil(data.length / 8);
  return (
    <div>
      <div className="flex items-end gap-px h-40">
        {data.map((d) => (
          <div
            key={d.date}
            className="group relative flex-1 h-full flex items-end"
            title={`${shortDate(d.date)}: ${fmt(d.views)} visninger, ${fmt(d.visitors)} besøgende`}
          >
            <div
              className="w-full rounded-t-sm bg-brand-teal/25 relative"
              style={{ height: `${(d.views / max) * 100}%` }}
            >
              <div
                className="absolute bottom-0 inset-x-0 rounded-t-sm bg-brand-teal"
                style={{ height: d.views > 0 ? `${(d.visitors / d.views) * 100}%` : 0 }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-px mt-1">
        {data.map((d, i) => (
          <div key={d.date} className="flex-1 text-center text-[10px] text-neutral-400 overflow-visible whitespace-nowrap">
            {i % labelEvery === 0 ? shortDate(d.date) : ""}
          </div>
        ))}
      </div>
      <div className="flex gap-4 mt-3 text-xs text-neutral-500 dark:text-neutral-400">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-brand-teal" /> Besøgende
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-brand-teal/25" /> Sidevisninger
        </span>
      </div>
    </div>
  );
}

function HourChart({ hours }: { hours: number[] }) {
  const max = Math.max(...hours, 1);
  return (
    <div>
      <div className="flex items-end gap-0.5 h-24">
        {hours.map((v, h) => (
          <div
            key={h}
            className="flex-1 rounded-t-sm bg-brand-blue/70"
            style={{ height: `${Math.max((v / max) * 100, v > 0 ? 3 : 0)}%` }}
            title={`kl. ${String(h).padStart(2, "0")}: ${fmt(v)} visninger`}
          />
        ))}
      </div>
      <div className="flex justify-between mt-1 text-[10px] text-neutral-400">
        <span>00</span>
        <span>06</span>
        <span>12</span>
        <span>18</span>
        <span>23</span>
      </div>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 border-b border-neutral-100 dark:border-neutral-800 last:border-0 text-sm">
      <span className="text-neutral-600 dark:text-neutral-300">{label}</span>
      <span className="font-semibold tabular-nums text-neutral-900 dark:text-neutral-100">
        {typeof value === "number" ? fmt(value) : value}
        {hint && <span className="ml-1.5 text-xs font-normal text-neutral-400">{hint}</span>}
      </span>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function StatsPage() {
  const { authorized } = useRequireAuth(["Administrator"]);
  const [days, setDays] = useState<StatsDays>(30);
  const [stats, setStats] = useState<ApiStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    getStats(days)
      .then(setStats)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [days]);

  useEffect(() => {
    if (authorized) load();
  }, [authorized, load]);

  if (!authorized) return null;

  const rangeLabel = RANGES.find((r) => r.days === days)?.label ?? "";
  const v = stats?.visitors;

  return (
    <main className="bg-neutral-100 dark:bg-neutral-950 min-h-[calc(100vh-3.5rem)] p-4 sm:p-8">
      <div className="max-w-285 mx-auto flex flex-col gap-6">
        {/* Header */}
        <div className="flex flex-wrap items-center gap-3">
          <BarChart3 className="size-6 text-neutral-500 dark:text-neutral-400" />
          <div>
            <h1 className="text-xl font-bold text-neutral-900 dark:text-neutral-100">Statistik</h1>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              Besøg og aktivitet — kun synlig for administratorer
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="flex rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-0.5">
              {RANGES.map((r) => (
                <button
                  key={r.days}
                  onClick={() => setDays(r.days)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    days === r.days
                      ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                      : "text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <button
              onClick={load}
              className="p-2 rounded-lg text-neutral-500 dark:text-neutral-400 hover:bg-white dark:hover:bg-neutral-800 transition-colors"
              title="Genindlæs"
            >
              <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {error && (
          <p className="text-sm text-brand-red bg-brand-red/5 border border-brand-red/40 rounded-lg px-4 py-3">
            Kunne ikke hente statistik: {error}
          </p>
        )}

        {!stats || !v ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
        ) : (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Kpi
                live
                label="Besøgende lige nu"
                value={v.live}
                sub={`${fmt(v.online_members)} medlemmer online`}
              />
              <Kpi
                label="I dag"
                value={v.today.visitors}
                sub={`${fmt(v.today.views)} sidevisninger`}
              />
              <Kpi
                label={`Besøgende (${rangeLabel})`}
                value={v.range.visitors}
                trend={{ current: v.range.visitors, previous: v.previous.visitors }}
                sub="ift. forrige periode"
              />
              <Kpi
                label={`Sidevisninger (${rangeLabel})`}
                value={v.range.views}
                trend={{ current: v.range.views, previous: v.previous.views }}
                sub={`${pct(v.member_views, v.range.views)}% fra indloggede`}
              />
            </div>

            {/* Traffic over time */}
            <Card title="Trafik pr. dag" icon={Eye}>
              <DailyChart data={v.daily} />
            </Card>

            <div className="grid md:grid-cols-2 gap-4">
              <Card title="Mest besøgte sider">
                <BarList
                  rows={v.top_pages.map((p) => ({
                    label: PAGE_LABELS[p.path] ? `${PAGE_LABELS[p.path]}  ·  ${p.path}` : p.path,
                    value: p.views,
                    hint: `${fmt(p.visitors)} bes.`,
                  }))}
                />
              </Card>
              <div className="flex flex-col gap-4">
                <Card title="Henvisninger">
                  <BarList
                    colour="#f4a261"
                    rows={v.referrers.map((r) => ({ label: r.host, value: r.views }))}
                    empty="Ingen eksterne henvisninger — alle kom direkte"
                  />
                </Card>
                <Card title="Enheder">
                  <BarList
                    colour="#3d5a80"
                    rows={v.devices.map((d) => ({
                      label: DEVICE_LABELS[d.device] ?? d.device,
                      value: d.views,
                      hint: `${pct(d.views, v.range.views)}%`,
                    }))}
                  />
                </Card>
              </div>
            </div>

            <Card title="Tidspunkt på dagen">
              <HourChart hours={v.hourly} />
            </Card>

            {/* Club data */}
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              <Card title="Medlemmer" icon={Users}>
                <Stat label="Medlemmer med konto" value={stats.members.total} />
                <Stat label={`Nye (${rangeLabel})`} value={stats.members.new_in_range} />
                <Stat
                  label={`Har logget ind (${rangeLabel})`}
                  value={stats.members.logged_in_in_range}
                  hint={days > 90 ? "maks. 90 dage" : undefined}
                />
                <Stat label="Virtuelle vagter" value={stats.members.virtual} />
                <Stat label="Med profilbillede" value={stats.members.with_avatar} />
                <Stat label="Udelukkede" value={stats.members.banned} />
                <div className="mt-4">
                  <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-2">Roller</p>
                  <BarList
                    colour="#e63946"
                    rows={stats.members.roles.map((r) => ({ label: r.role, value: r.count }))}
                  />
                </div>
              </Card>

              <Card title="Klubaftener" icon={CalendarDays}>
                <Stat label="Kommende (udgivet)" value={stats.nights.upcoming} />
                <Stat label="Kommende uden vagt" value={stats.nights.upcoming_unassigned} />
                <Stat label="Kommende ikke bekræftet" value={stats.nights.upcoming_unconfirmed} />
                <Stat label="Kladder" value={stats.nights.drafts} />
                <Stat label={`Afholdt (${rangeLabel})`} value={stats.nights.held_in_range} />
                <Stat label={`Aflyst (${rangeLabel})`} value={stats.nights.cancelled_in_range} />
              </Card>

              <Card title="Aktivitet" icon={MessageSquare}>
                <Stat label={`Chatbeskeder (${rangeLabel})`} value={stats.activity.messages} />
                <Stat label="Aktive skribenter" value={stats.activity.chatters} />
                <Stat
                  label="Afgivne vagter"
                  value={stats.activity.handovers}
                  hint={`${fmt(stats.activity.handovers_taken)} taget`}
                />
                <Stat
                  label="Vagtbytter foreslået"
                  value={stats.activity.swaps}
                  hint={`${fmt(stats.activity.swaps_accepted)} accepteret`}
                />
                <Stat
                  label="E-mails sendt"
                  value={stats.activity.emails_sent}
                  hint={days > 90 ? "maks. 90 dage" : undefined}
                />
                <div className="mt-4">
                  <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-2">Beskeder pr. kanal</p>
                  <BarList
                    rows={stats.activity.channels.map((c) => ({ label: c.name, value: c.messages }))}
                  />
                </div>
              </Card>
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              <Card title="Vagter pr. person (seneste 12 mdr.)" icon={CalendarDays} className="md:col-span-2">
                <BarList
                  colour="#3d5a80"
                  rows={stats.shifts_per_vagt.map((s) => ({
                    label: s.is_virtual ? `${s.name} (virtuel)` : s.name,
                    value: s.past,
                    hint: s.upcoming > 0 ? `+${s.upcoming} kommende` : undefined,
                  }))}
                  empty="Ingen vagter i perioden"
                />
              </Card>

              <Card title="Brætspil og e-mail" icon={Puzzle}>
                <Stat label="Spil i medlemmers samlinger" value={stats.boardgames.member_games} />
                <Stat label="Medlemmer med samling" value={stats.boardgames.owners} />
                <Stat label="Klubbens spil" value={stats.boardgames.club_games} />
                <div className="mt-4">
                  <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1">E-mail-tilmeldinger</p>
                  <Stat label="Samtykke givet" value={stats.members.email_consent} />
                  <Stat label="Ved omtale" value={stats.members.email_on_mention} />
                  <Stat label="Nye klubaftener" value={stats.members.email_on_nights} />
                  <Stat label="Vagttildeling" value={stats.members.email_on_shift} />
                </div>
              </Card>
            </div>

            <p className="text-xs text-neutral-400">
              Besøgsstatistik er anonym og bruger ingen cookies: besøgende tælles via en
              daglig skiftende hash, så samme person tælles én gang pr. dag. Bots og browsere
              med &quot;Do Not Track&quot; tælles ikke.
              {v.tracking_since &&
                ` Målt siden ${new Date(v.tracking_since).toLocaleDateString("da-DK")}.`}
            </p>
          </>
        )}
      </div>
    </main>
  );
}
