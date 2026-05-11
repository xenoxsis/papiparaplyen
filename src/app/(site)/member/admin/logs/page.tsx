"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronRight,
  Filter,
  Mail,
  RefreshCw,
  ScrollText,
  X,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getAuditLog,
  getAuditLogEventTypes,
  type AuditLogRow,
} from "@/lib/api";

// ── Event type colour coding ─────────────────────────────────────────────────

const EVENT_COLOURS: Record<string, string> = {
  "login.success": "bg-green-100 text-green-700",
  "login.failure": "bg-red-100 text-red-700",
  "auth.register": "bg-blue-100 text-blue-700",
  "oauth.login": "bg-teal-100 text-teal-700",
  "oauth.register": "bg-teal-100 text-teal-700",
  "auth.erasure": "bg-red-200 text-red-800",
  "email.password_reset": "bg-yellow-100 text-yellow-700",
  "email.sent": "bg-purple-100 text-purple-700",
  "shift.create": "bg-green-100 text-green-700",
  "shift.edit": "bg-yellow-100 text-yellow-700",
  "shift.delete": "bg-red-100 text-red-700",
  "shift.assign": "bg-blue-100 text-blue-700",
  "shift.unassign": "bg-orange-100 text-orange-700",
  "shift.confirm": "bg-green-200 text-green-800",
  "shift.optout": "bg-neutral-100 text-neutral-600",
  "shift.optout_remove": "bg-neutral-100 text-neutral-600",
  "vagter.settings": "bg-indigo-100 text-indigo-700",
  "vagter.checklist_create": "bg-indigo-100 text-indigo-700",
  "vagter.checklist_edit": "bg-indigo-100 text-indigo-700",
  "vagter.checklist_delete": "bg-indigo-200 text-indigo-800",
};

function eventColour(type: string) {
  return EVENT_COLOURS[type] ?? "bg-neutral-100 text-neutral-700";
}

// ── Email HTML preview modal ─────────────────────────────────────────────────

function EmailPreviewModal({
  html,
  onClose,
}: {
  html: string;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="relative bg-white rounded-xl shadow-2xl w-full max-w-3xl mx-4 flex flex-col"
        style={{ height: "80vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 shrink-0">
          <span className="text-sm font-medium text-neutral-700 flex items-center gap-2">
            <Mail className="size-4 text-purple-600" />
            Email preview
          </span>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-700 transition-colors"
          >
            <X className="size-5" />
          </button>
        </div>
        <iframe
          srcDoc={html}
          sandbox="allow-same-origin"
          className="flex-1 w-full rounded-b-xl"
          title="Email preview"
        />
      </div>
    </div>
  );
}

// ── Detail cell with expand / collapse ──────────────────────────────────────

function DetailCell({ detail }: { detail: Record<string, unknown> | null }) {
  const [expanded, setExpanded] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  if (!detail) return <span className="text-neutral-400 text-xs">—</span>;
  const htmlString = typeof detail.html === "string" ? detail.html : null;
  // Strip html from displayed JSON to keep it readable
  const displayDetail = htmlString
    ? Object.fromEntries(Object.entries(detail).filter(([k]) => k !== "html"))
    : detail;
  const json = JSON.stringify(displayDetail, null, 2);
  const preview = JSON.stringify(displayDetail);
  const isLong = preview.length > 60;
  return (
    <div className="max-w-xs">
      <div className="flex items-center gap-2">
        {isLong ? (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1 text-xs text-brand-teal hover:underline"
          >
            {expanded ? (
              <ChevronDown className="size-3" />
            ) : (
              <ChevronRight className="size-3" />
            )}
            {expanded ? "Skjul" : "Vis detaljer"}
          </button>
        ) : (
          <code className="text-xs text-neutral-600 break-all">{preview}</code>
        )}
        {htmlString && (
          <button
            onClick={() => setPreviewHtml(htmlString)}
            className="flex items-center gap-1 text-xs text-purple-600 hover:underline shrink-0"
          >
            <Mail className="size-3" />
            Vis email
          </button>
        )}
      </div>
      {expanded && (
        <pre className="mt-1 text-xs bg-neutral-50 border border-neutral-200 rounded p-2 overflow-x-auto max-h-40 whitespace-pre-wrap break-all">
          {json}
        </pre>
      )}
      {previewHtml && (
        <EmailPreviewModal
          html={previewHtml}
          onClose={() => setPreviewHtml(null)}
        />
      )}
    </div>
  );
}

// ── Email link ───────────────────────────────────────────────────────────────

function EmailLink({
  email,
  name,
}: {
  email: string | null;
  name: string | null;
}) {
  if (!email) return <span className="text-neutral-400 text-xs">—</span>;
  return (
    <div className="min-w-0">
      {name && (
        <p className="text-xs font-medium text-neutral-800 truncate">{name}</p>
      )}
      <a
        href={`mailto:${email}`}
        className="text-xs text-brand-teal hover:underline truncate block"
      >
        {email}
      </a>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 100;

export default function AuditLogPage() {
  const { authorized } = useRequireAuth(["Administrator"]);
  const { user } = useAuth();
  const router = useRouter();

  // Extra superuser gate — redirect non-superusers even if they are Administrators
  useEffect(() => {
    if (authorized && user && !user.is_superuser) {
      router.replace("/member/admin");
    }
  }, [authorized, user, router]);

  const [rows, setRows] = useState<AuditLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [eventTypes, setEventTypes] = useState<string[]>([]);

  // Filters
  const [eventType, setEventType] = useState("");
  const [actorEmail, setActorEmail] = useState("");
  const [targetEmail, setTargetEmail] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    getAuditLogEventTypes()
      .then(setEventTypes)
      .catch(() => {});
  }, []);

  const loadPage = useCallback(
    (p: number) => {
      if (!user?.is_superuser) return;
      setLoading(true);
      getAuditLog({
        eventType: eventType || undefined,
        actorEmail: actorEmail || undefined,
        targetEmail: targetEmail || undefined,
        from: from || undefined,
        to: to || undefined,
        search: search || undefined,
        page: p,
        limit: PAGE_SIZE,
      })
        .then((data) => {
          setRows(data.rows);
          setTotal(data.total);
          setPage(data.page);
        })
        .catch(console.error)
        .finally(() => setLoading(false));
    },
    [user, eventType, actorEmail, targetEmail, from, to, search],
  );

  // Reset to page 0 when filters change
  useEffect(() => {
    if (user?.is_superuser) loadPage(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventType, actorEmail, targetEmail, from, to, search, user]);

  if (!authorized || !user?.is_superuser) return null;

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="max-w-full px-4 sm:px-8 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <ScrollText className="size-6 text-neutral-500" />
        <div>
          <h1 className="text-xl font-bold text-neutral-900">Logbog</h1>
          <p className="text-sm text-neutral-500">
            {total.toLocaleString("da-DK")} poster totalt
          </p>
        </div>
        <button
          onClick={() => loadPage(page)}
          className="ml-auto p-2 rounded-lg text-neutral-500 hover:bg-neutral-100 transition-colors"
          title="Genindlæs"
        >
          <RefreshCw className="size-4" />
        </button>
      </div>

      {/* Filter bar */}
      <div className="bg-white border border-neutral-200 rounded-xl p-4 mb-4 flex flex-wrap gap-3 items-end">
        <Filter className="size-4 text-neutral-400 self-center" />

        <div className="flex flex-col gap-1 min-w-[160px]">
          <label className="text-xs text-neutral-500 font-medium">
            Hændelsestype
          </label>
          <select
            value={eventType}
            onChange={(e) => setEventType(e.target.value)}
            className="text-sm border border-neutral-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-brand-teal/40"
          >
            <option value="">Alle</option>
            {eventTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1 min-w-[180px]">
          <label className="text-xs text-neutral-500 font-medium">
            Aktøremail
          </label>
          <Input
            value={actorEmail}
            onChange={(e) => setActorEmail(e.target.value)}
            placeholder="eksempel@email.dk"
            className="text-sm"
          />
        </div>

        <div className="flex flex-col gap-1 min-w-[180px]">
          <label className="text-xs text-neutral-500 font-medium">
            Målemail
          </label>
          <Input
            value={targetEmail}
            onChange={(e) => setTargetEmail(e.target.value)}
            placeholder="eksempel@email.dk"
            className="text-sm"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-neutral-500 font-medium">Fra</label>
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="text-sm"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-neutral-500 font-medium">Til</label>
          <Input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="text-sm"
          />
        </div>

        <div className="flex flex-col gap-1 min-w-[200px] flex-1">
          <label className="text-xs text-neutral-500 font-medium">
            Fritekst
          </label>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Søg i detaljer, emails..."
            className="text-sm"
          />
        </div>

        {(eventType || actorEmail || targetEmail || from || to || search) && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setEventType("");
              setActorEmail("");
              setTargetEmail("");
              setFrom("");
              setTo("");
              setSearch("");
            }}
          >
            Nulstil
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white border border-neutral-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead>
            <tr className="border-b border-neutral-100 bg-neutral-50 text-xs text-neutral-500 uppercase tracking-wide">
              <th className="text-left px-4 py-3 font-medium">Tidspunkt</th>
              <th className="text-left px-4 py-3 font-medium">Hændelse</th>
              <th className="text-left px-4 py-3 font-medium">Aktør</th>
              <th className="text-left px-4 py-3 font-medium">Mål</th>
              <th className="text-left px-4 py-3 font-medium">Detaljer</th>
              <th className="text-left px-4 py-3 font-medium">IP</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 10 }).map((_, i) => (
                <tr key={i} className="border-b border-neutral-50">
                  {Array.from({ length: 6 }).map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <Skeleton className="h-4 w-full" />
                    </td>
                  ))}
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-12 text-center text-neutral-400 text-sm"
                >
                  Ingen poster fundet
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-neutral-50 hover:bg-neutral-50 transition-colors"
                >
                  <td className="px-4 py-3 text-xs text-neutral-500 whitespace-nowrap">
                    {new Intl.DateTimeFormat("da-DK", {
                      dateStyle: "short",
                      timeStyle: "medium",
                    }).format(new Date(row.created_at))}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${eventColour(row.event_type)}`}
                    >
                      {row.event_type}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <EmailLink email={row.actor_email} name={row.actor_name} />
                  </td>
                  <td className="px-4 py-3">
                    <EmailLink
                      email={row.target_email}
                      name={row.target_name}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <DetailCell detail={row.detail} />
                  </td>
                  <td className="px-4 py-3 text-xs text-neutral-400 whitespace-nowrap font-mono">
                    {row.ip ?? "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-neutral-500">
            Side {page + 1} af {totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => loadPage(page - 1)}
            >
              Forrige
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages - 1}
              onClick={() => loadPage(page + 1)}
            >
              Næste
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
