"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  MapPin,
  Pencil,
  Plus,
  StickyNote,
  Trash2,
  X,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { MemberHero } from "@/components/MemberHero";
import {
  getClubNights,
  getChannels,
  getMessages,
  getChannelMembers,
  postMessage,
  patchMessage,
  deleteMessage,
  markChannelRead,
  getVagterPageData,
  updateVagterSettings,
  addChecklistItem,
  updateChecklistItem,
  deleteChecklistItem,
  type ApiClubNight,
  type ApiChannel,
  type ApiMessage,
  type ApiChannelMember,
  type ApiChecklistItem,
  type ApiVagterSettings,
} from "@/lib/api";
import { useChannelSSE } from "@/lib/useChannelSSE";
import { useUserSSE } from "@/lib/UserSSEContext";
import { ChatPanel } from "@/app/(site)/member/profile/ChatPanel";
import { DateBadge } from "@/components/DateBadge";
import { Skeleton } from "@/components/ui/skeleton";

// ── Message map helpers ───────────────────────────────────────────────────────
function upsertIntoMap(
  map: Record<number, ApiMessage[]>,
  msg: ApiMessage,
): Record<number, ApiMessage[]> {
  const bucket = map[msg.channel_id] ?? [];
  const idx = bucket.findIndex((m) => m.id === msg.id);
  const next =
    idx !== -1 ? bucket.map((m, i) => (i === idx ? msg : m)) : [...bucket, msg];
  return { ...map, [msg.channel_id]: next };
}

// ── Tonight's shift banner ────────────────────────────────────────────────────
function TonightBanner({
  nights,
  loading,
}: {
  nights: ApiClubNight[];
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-5 flex items-center gap-4">
        <Skeleton className="w-12 h-14 rounded-lg shrink-0" />
        <div className="flex flex-col gap-2 flex-1">
          <Skeleton className="h-4 w-24 rounded" />
          <Skeleton className="h-5 w-48 rounded" />
          <Skeleton className="h-3 w-36 rounded" />
        </div>
      </div>
    );
  }
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = nights
    .filter((n) => n.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));
  const next = upcoming[0];

  if (!next) {
    return (
      <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-5 flex items-center gap-3">
        <Clock className="size-5 text-neutral-400 shrink-0" />
        <p className="text-sm text-neutral-500">
          Ingen kommende vagter fundet.
        </p>
      </div>
    );
  }

  const isToday = next.date === today;

  return (
    <div
      className={`rounded-xl border p-5 flex flex-col sm:flex-row sm:items-center gap-4 ${
        isToday
          ? "bg-brand-teal/10 border-brand-teal/30"
          : "bg-neutral-50 border-neutral-200"
      }`}
    >
      <DateBadge
        date={next.date}
        colorClass={isToday ? "bg-brand-teal" : "bg-neutral-400"}
      />
      <div className="flex flex-col gap-1 flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {isToday && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-brand-teal text-white">
              I dag
            </span>
          )}
          <span className="font-semibold text-sm text-neutral-900 truncate">
            {next.name}
          </span>
        </div>
        <div className="flex items-center gap-3 text-neutral-500 text-xs flex-wrap">
          <span className="flex items-center gap-1">
            <Clock className="size-3" />
            {next.time_from} – {next.time_to}
          </span>
          <span className="flex items-center gap-1">
            <MapPin className="size-3" />
            {next.location}
          </span>
        </div>
      </div>
      {next.assigned_member_name ? (
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-7 h-7 rounded-full bg-brand-red text-white text-[0.6rem] font-bold flex items-center justify-center">
            {next.assigned_member_initials}
          </div>
          <span className="text-sm font-medium text-neutral-700">
            {next.assigned_member_name}
          </span>
        </div>
      ) : (
        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-brand-red/10 text-brand-red shrink-0">
          Ingen vagt tildelt
        </span>
      )}
    </div>
  );
}

// ── Access codes card ────────────────────────────────────────────────────────
function AccessCodesCard({
  settings,
  isAdmin,
  onSave,
  loading,
}: {
  settings: ApiVagterSettings;
  isAdmin: boolean;
  onSave: (patch: Partial<ApiVagterSettings>) => Promise<void>;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-sm flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Skeleton className="w-5 h-5 rounded" />
          <Skeleton className="h-5 w-24 rounded" />
        </div>
        <div className="flex flex-col gap-3">
          <Skeleton className="h-14 w-full rounded-lg" />
          <Skeleton className="h-14 w-full rounded-lg" />
        </div>
      </div>
    );
  }
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    door_code: settings.door_code,
    locker_code: settings.locker_code,
  });
  const [saving, setSaving] = useState(false);

  // Sync draft if settings prop changes
  useEffect(() => {
    setDraft({
      door_code: settings.door_code,
      locker_code: settings.locker_code,
    });
  }, [settings.door_code, settings.locker_code]);

  async function handleSave() {
    setSaving(true);
    try {
      await onSave({
        door_code: draft.door_code,
        locker_code: draft.locker_code,
      });
      setEditing(false);
      toast.success("Koder gemt.");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Kunne ikke gemme koder.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-sm flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <KeyRound className="size-5 text-neutral-700 shrink-0" />
          <h2 className="font-semibold text-base text-neutral-900">Koder</h2>
        </div>
        {isAdmin && !editing && (
          <button
            onClick={() => setEditing(true)}
            className="flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-900 transition-colors"
          >
            <Pencil className="size-3.5" />
            Rediger
          </button>
        )}
        {isAdmin && editing && (
          <button
            onClick={() => {
              setEditing(false);
              setDraft({
                door_code: settings.door_code,
                locker_code: settings.locker_code,
              });
            }}
            className="flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-900 transition-colors"
          >
            <X className="size-3.5" />
            Annuller
          </button>
        )}
      </div>

      {editing ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-neutral-600">
              Dør-kode
            </label>
            <input
              type="text"
              value={draft.door_code}
              onChange={(e) =>
                setDraft((d) => ({ ...d, door_code: e.target.value }))
              }
              className="border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal/40"
              placeholder="Indtast dør-kode"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-neutral-600">
              Brætspilsskabs-kode
            </label>
            <input
              type="text"
              value={draft.locker_code}
              onChange={(e) =>
                setDraft((d) => ({ ...d, locker_code: e.target.value }))
              }
              className="border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal/40"
              placeholder="Indtast skabs-kode"
            />
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="self-start flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-teal text-white text-sm font-medium hover:bg-teal-600 transition-colors disabled:opacity-50"
          >
            {saving ? "Gemmer…" : "Gem"}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <CodeRow
            label="Dør-kode"
            code={settings.door_code}
            icon={<Lock className="size-4 text-neutral-400" />}
          />
          <CodeRow
            label="Brætspilsskabs-kode"
            code={settings.locker_code}
            icon={<Lock className="size-4 text-neutral-400" />}
          />
        </div>
      )}
    </div>
  );
}

function CodeRow({
  label,
  code,
  icon,
}: {
  label: string;
  code: string;
  icon: React.ReactNode;
}) {
  const [show, setShow] = useState(false);

  function startReveal() {
    if (code.length > 0) setShow(true);
  }
  function stopReveal() {
    setShow(false);
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-neutral-50 border border-neutral-100 px-4 py-3">
      <div className="flex items-center gap-2.5 min-w-0">
        {icon}
        <div className="flex flex-col min-w-0">
          <span className="text-xs text-neutral-500">{label}</span>
          <span className="font-mono font-semibold text-neutral-900 text-sm tracking-widest select-none">
            {code.length === 0 ? (
              <span className="text-neutral-400 font-sans font-normal tracking-normal">
                Ikke angivet
              </span>
            ) : show ? (
              code
            ) : (
              "•".repeat(Math.max(code.length, 4))
            )}
          </span>
        </div>
      </div>
      {code.length > 0 && (
        <button
          onMouseDown={startReveal}
          onMouseUp={stopReveal}
          onMouseLeave={stopReveal}
          onTouchStart={(e) => {
            e.preventDefault();
            startReveal();
          }}
          onTouchEnd={stopReveal}
          onTouchCancel={stopReveal}
          className="text-neutral-400 hover:text-neutral-700 transition-colors shrink-0 select-none touch-none"
          aria-label={show ? "Skjul kode" : "Hold nede for at se kode"}
        >
          {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      )}
    </div>
  );
}

// ── Checklist card ────────────────────────────────────────────────────────────
const CHECKLIST_MODE_KEY = "vagt_checklist_mode";
const CHECKLIST_CHECKED_KEY = "vagt_checklist_checked";

function ChecklistCard({
  items,
  isAdmin,
  onAdd,
  onUpdate,
  onDelete,
  onReorder,
  loading,
}: {
  items: ApiChecklistItem[];
  isAdmin: boolean;
  onAdd: (text: string, is_header: boolean) => Promise<void>;
  onUpdate: (
    id: number,
    patch: { text?: string; sort_order?: number; is_header?: boolean },
  ) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onReorder: (id: number, direction: "up" | "down") => Promise<void>;
  loading?: boolean;
}) {
  // Checklist mode: false = plain list (default), true = checkboxes
  const [checklistMode, setChecklistMode] = useState(false);
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const [addingText, setAddingText] = useState("");
  const [addingIsHeader, setAddingIsHeader] = useState(false);
  const [adding, setAdding] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [editIsHeader, setEditIsHeader] = useState(false);

  // Hydrate from localStorage on mount
  useEffect(() => {
    try {
      const mode = localStorage.getItem(CHECKLIST_MODE_KEY);
      if (mode === "true") setChecklistMode(true);
      const saved = localStorage.getItem(CHECKLIST_CHECKED_KEY);
      if (saved) setChecked(JSON.parse(saved) as Record<number, boolean>);
    } catch {
      /* ignore */
    }
  }, []);

  // Persist checked state to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem(CHECKLIST_CHECKED_KEY, JSON.stringify(checked));
    } catch {
      /* ignore */
    }
  }, [checked]);

  function toggleMode() {
    const next = !checklistMode;
    setChecklistMode(next);
    localStorage.setItem(CHECKLIST_MODE_KEY, String(next));
    if (!next) {
      // Turning off — clear all checks
      setChecked({});
      localStorage.removeItem(CHECKLIST_CHECKED_KEY);
    }
  }

  function clearAll() {
    setChecked({});
    localStorage.removeItem(CHECKLIST_CHECKED_KEY);
  }

  function startEdit(item: ApiChecklistItem) {
    setEditingId(item.id);
    setEditText(item.text);
    setEditIsHeader(!!item.is_header);
  }

  async function handleAdd() {
    if (!addingText.trim()) return;
    setAdding(true);
    try {
      await onAdd(addingText.trim(), addingIsHeader);
      setAddingText("");
      setAddingIsHeader(false);
      setShowAddForm(false);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Kunne ikke tilføje punkt.",
      );
    } finally {
      setAdding(false);
    }
  }

  async function handleUpdate(id: number) {
    try {
      await onUpdate(id, { text: editText.trim(), is_header: editIsHeader });
      setEditingId(null);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Kunne ikke opdatere punkt.",
      );
    }
  }

  async function handleDelete(id: number) {
    try {
      await onDelete(id);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Kunne ikke slette punkt.",
      );
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-sm flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Skeleton className="w-5 h-5 rounded" />
          <Skeleton className="h-5 w-24 rounded" />
          <Skeleton className="h-5 w-12 rounded-full" />
        </div>
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  const checkedCount = Object.values(checked).filter(Boolean).length;
  const totalItems = items.filter((i) => !i.is_header).length;

  return (
    <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-sm flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Check className="size-5 text-neutral-700 shrink-0" />
            <h2 className="font-semibold text-base text-neutral-900">
              Tjekliste
            </h2>
            {checklistMode ? (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-brand-teal/10 text-brand-teal">
                {checkedCount} / {totalItems}
              </span>
            ) : (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-500">
                {totalItems} punkter
              </span>
            )}
          </div>
          {isAdmin && (
            <button
              onClick={() => setShowAddForm((v) => !v)}
              className="flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-900 transition-colors"
            >
              {showAddForm ? (
                <>
                  <X className="size-3.5" /> Annuller
                </>
              ) : (
                <>
                  <Plus className="size-3.5" /> Tilføj
                </>
              )}
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {checklistMode && checkedCount > 0 && (
            <button
              onClick={clearAll}
              className="flex items-center gap-1 text-xs text-neutral-400 hover:text-brand-red transition-colors"
              title="Nulstil alle afkrydsninger"
            >
              <X className="size-3.5" /> Nulstil
            </button>
          )}
          <button
            onClick={toggleMode}
            className={`flex items-center gap-1 text-xs transition-colors ${
              checklistMode
                ? "text-brand-teal hover:text-teal-700"
                : "text-neutral-500 hover:text-neutral-900"
            }`}
            title={
              checklistMode
                ? "Skjul afkrydsningsfelter"
                : "Vis afkrydsningsfelter"
            }
          >
            <Check className="size-3.5" />
            {checklistMode ? "Afkrydsning til" : "Afkrydsning fra"}
          </button>
        </div>
      </div>

      {isAdmin && showAddForm && (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <input
              type="text"
              value={addingText}
              onChange={(e) => setAddingText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              placeholder={
                addingIsHeader ? "Sektion titel…" : "Nyt tjeklistepunkt…"
              }
              className="flex-1 border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal/40"
              autoFocus
            />
            <button
              onClick={handleAdd}
              disabled={adding || !addingText.trim()}
              className="px-3 py-2 rounded-lg bg-brand-teal text-white text-sm font-medium hover:bg-teal-600 transition-colors disabled:opacity-50"
            >
              Tilføj
            </button>
          </div>
          <label className="flex items-center gap-2 text-xs text-neutral-500 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={addingIsHeader}
              onChange={(e) => setAddingIsHeader(e.target.checked)}
              className="rounded"
            />
            Dette er en sektionsoverskrift
          </label>
        </div>
      )}

      {items.length === 0 ? (
        <p className="text-sm text-neutral-400 text-center py-4">
          Ingen punkter endnu.{isAdmin && " Tilføj et punkt ovenfor."}
        </p>
      ) : (
        <div className="flex flex-col gap-0">
          {(() => {
            // Group flat items into sections: { header | null, children[] }
            type Section = {
              header: ApiChecklistItem | null;
              children: ApiChecklistItem[];
            };
            const sections: Section[] = [];
            let curr: Section = { header: null, children: [] };
            for (const item of items) {
              if (!!item.is_header) {
                sections.push(curr);
                curr = { header: item, children: [] };
              } else {
                curr.children.push(item);
              }
            }
            sections.push(curr);

            return sections
              .filter((s) => s.header !== null || s.children.length > 0)
              .map((section, sIdx) => (
                <div
                  key={section.header?.id ?? `ungrouped-${sIdx}`}
                  className="flex flex-col"
                >
                  {/* Section header row */}
                  {section.header &&
                    (() => {
                      const item = section.header;
                      const idx = items.findIndex((i) => i.id === item.id);
                      const isEditing = editingId === item.id;
                      return (
                        <div
                          className={`flex items-center gap-2 pb-1.5 ${sIdx === 0 ? "pt-0" : "pt-4"}`}
                        >
                          {isEditing ? (
                            <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                              <input
                                type="text"
                                value={editText}
                                onChange={(e) => setEditText(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") handleUpdate(item.id);
                                  if (e.key === "Escape") setEditingId(null);
                                }}
                                className="w-full border border-neutral-200 rounded-lg px-2 py-1 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-brand-teal/40"
                                autoFocus
                              />
                              <label className="flex items-center gap-2 text-xs text-neutral-500 cursor-pointer select-none">
                                <input
                                  type="checkbox"
                                  checked={editIsHeader}
                                  onChange={(e) =>
                                    setEditIsHeader(e.target.checked)
                                  }
                                  className="rounded"
                                />
                                Sektionsoverskrift
                              </label>
                            </div>
                          ) : (
                            <div className="flex-1 flex items-center gap-2 min-w-0">
                              <span className="text-xs font-bold uppercase tracking-widest text-neutral-500 shrink-0">
                                {item.text}
                              </span>
                              <div className="flex-1 h-px bg-neutral-200" />
                            </div>
                          )}
                          {isAdmin && (
                            <div className="flex items-center gap-1 shrink-0">
                              {isEditing ? (
                                <>
                                  <button
                                    onClick={() => handleUpdate(item.id)}
                                    className="p-1 rounded text-brand-teal hover:bg-brand-teal/10 transition-colors"
                                    title="Gem"
                                  >
                                    <Check className="size-3.5" />
                                  </button>
                                  <button
                                    onClick={() => setEditingId(null)}
                                    className="p-1 rounded text-neutral-400 hover:bg-neutral-100 transition-colors"
                                    title="Annuller"
                                  >
                                    <X className="size-3.5" />
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    onClick={() => onReorder(item.id, "up")}
                                    disabled={idx === 0}
                                    className="p-1 rounded text-neutral-400 hover:text-neutral-700 disabled:opacity-30 transition-colors"
                                    title="Flyt op"
                                  >
                                    <ChevronUp className="size-3.5" />
                                  </button>
                                  <button
                                    onClick={() => onReorder(item.id, "down")}
                                    disabled={idx === items.length - 1}
                                    className="p-1 rounded text-neutral-400 hover:text-neutral-700 disabled:opacity-30 transition-colors"
                                    title="Flyt ned"
                                  >
                                    <ChevronDown className="size-3.5" />
                                  </button>
                                  <button
                                    onClick={() => startEdit(item)}
                                    className="p-1 rounded text-neutral-400 hover:text-neutral-700 transition-colors"
                                    title="Rediger"
                                  >
                                    <Pencil className="size-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleDelete(item.id)}
                                    className="p-1 rounded text-neutral-400 hover:text-brand-red transition-colors"
                                    title="Slet"
                                  >
                                    <Trash2 className="size-3.5" />
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })()}

                  {/* Section children */}
                  <ul
                    className={`flex flex-col gap-1.5 ${section.header ? "pl-3 border-l-2 border-neutral-200 ml-1 mb-1" : "mb-0"}`}
                  >
                    {section.children.map((item) => {
                      const idx = items.findIndex((i) => i.id === item.id);
                      const isChecked = checked[item.id] ?? false;
                      const isEditing = editingId === item.id;
                      return (
                        <li
                          key={item.id}
                          className="flex items-center gap-3 rounded-lg border border-neutral-100 bg-neutral-50 px-4 py-3"
                        >
                          {!isEditing && checklistMode && (
                            <button
                              onClick={() =>
                                setChecked((prev) => ({
                                  ...prev,
                                  [item.id]: !prev[item.id],
                                }))
                              }
                              className={`w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                                isChecked
                                  ? "bg-brand-teal border-brand-teal"
                                  : "border-neutral-300 hover:border-brand-teal"
                              }`}
                              aria-label={
                                isChecked ? "Fjern afkrydsning" : "Afkrydset"
                              }
                            >
                              {isChecked && (
                                <Check className="size-3 text-white" />
                              )}
                            </button>
                          )}

                          {isEditing ? (
                            <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                              <input
                                type="text"
                                value={editText}
                                onChange={(e) => setEditText(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") handleUpdate(item.id);
                                  if (e.key === "Escape") setEditingId(null);
                                }}
                                className="w-full border border-neutral-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal/40"
                                autoFocus
                              />
                              <label className="flex items-center gap-2 text-xs text-neutral-500 cursor-pointer select-none">
                                <input
                                  type="checkbox"
                                  checked={editIsHeader}
                                  onChange={(e) =>
                                    setEditIsHeader(e.target.checked)
                                  }
                                  className="rounded"
                                />
                                Sektionsoverskrift
                              </label>
                            </div>
                          ) : (
                            <span
                              className={`flex-1 text-sm ${checklistMode && isChecked ? "line-through text-neutral-400" : "text-neutral-800"}`}
                            >
                              {item.text}
                            </span>
                          )}

                          {isAdmin && (
                            <div className="flex items-center gap-1 shrink-0">
                              {isEditing ? (
                                <>
                                  <button
                                    onClick={() => handleUpdate(item.id)}
                                    className="p-1 rounded text-brand-teal hover:bg-brand-teal/10 transition-colors"
                                    title="Gem"
                                  >
                                    <Check className="size-3.5" />
                                  </button>
                                  <button
                                    onClick={() => setEditingId(null)}
                                    className="p-1 rounded text-neutral-400 hover:bg-neutral-100 transition-colors"
                                    title="Annuller"
                                  >
                                    <X className="size-3.5" />
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    onClick={() => onReorder(item.id, "up")}
                                    disabled={idx === 0}
                                    className="p-1 rounded text-neutral-400 hover:text-neutral-700 disabled:opacity-30 transition-colors"
                                    title="Flyt op"
                                  >
                                    <ChevronUp className="size-3.5" />
                                  </button>
                                  <button
                                    onClick={() => onReorder(item.id, "down")}
                                    disabled={idx === items.length - 1}
                                    className="p-1 rounded text-neutral-400 hover:text-neutral-700 disabled:opacity-30 transition-colors"
                                    title="Flyt ned"
                                  >
                                    <ChevronDown className="size-3.5" />
                                  </button>
                                  <button
                                    onClick={() => startEdit(item)}
                                    className="p-1 rounded text-neutral-400 hover:text-neutral-700 transition-colors"
                                    title="Rediger"
                                  >
                                    <Pencil className="size-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleDelete(item.id)}
                                    className="p-1 rounded text-neutral-400 hover:text-brand-red transition-colors"
                                    title="Slet"
                                  >
                                    <Trash2 className="size-3.5" />
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ));
          })()}
        </div>
      )}
    </div>
  );
}

// ── Shift note card ───────────────────────────────────────────────────────────
function ShiftNoteCard({
  note,
  isAdmin,
  onSave,
  loading,
}: {
  note: string;
  isAdmin: boolean;
  onSave: (value: string) => Promise<void>;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-sm flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Skeleton className="w-5 h-5 rounded" />
          <Skeleton className="h-5 w-36 rounded" />
        </div>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-full rounded" />
          <Skeleton className="h-4 w-5/6 rounded" />
          <Skeleton className="h-4 w-4/6 rounded" />
        </div>
      </div>
    );
  }
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(note);
  }, [note]);

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(draft);
      setEditing(false);
      toast.success("Note gemt.");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Kunne ikke gemme note.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-neutral-200 p-5 shadow-sm flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <StickyNote className="size-5 text-neutral-700 shrink-0" />
          <h2 className="font-semibold text-base text-neutral-900">
            Besked fra admin
          </h2>
        </div>
        {isAdmin && !editing && (
          <button
            onClick={() => setEditing(true)}
            className="flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-900 transition-colors"
          >
            <Pencil className="size-3.5" />
            Rediger
          </button>
        )}
        {isAdmin && editing && (
          <button
            onClick={() => {
              setEditing(false);
              setDraft(note);
            }}
            className="flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-900 transition-colors"
          >
            <X className="size-3.5" />
            Annuller
          </button>
        )}
      </div>

      {editing ? (
        <div className="flex flex-col gap-3">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={4}
            className="border border-neutral-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal/40 resize-y"
            placeholder="Skriv en besked til vagterne…"
          />
          <button
            onClick={handleSave}
            disabled={saving}
            className="self-start flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-teal text-white text-sm font-medium hover:bg-teal-600 transition-colors disabled:opacity-50"
          >
            {saving ? "Gemmer…" : "Gem"}
          </button>
        </div>
      ) : note.trim() ? (
        <p className="text-sm text-neutral-700 whitespace-pre-wrap leading-relaxed">
          {note}
        </p>
      ) : (
        <p className="text-sm text-neutral-400 italic">
          Ingen besked fra admin.
          {isAdmin && " Klik 'Rediger' for at tilføje en."}
        </p>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function VagterPage() {
  const { authorized } = useRequireAuth(["Administrator", "Vagt"]);
  const { user } = useAuth();
  const isAdmin = user?.roles.includes("Administrator") ?? false;

  // ── Vagt page data ────────────────────────────────────────────────────────
  const [settings, setSettings] = useState<ApiVagterSettings>({
    door_code: "",
    locker_code: "",
    shift_note: "",
  });
  const [checklist, setChecklist] = useState<ApiChecklistItem[]>([]);

  // ── Nights ────────────────────────────────────────────────────────────────
  const [nights, setNights] = useState<ApiClubNight[]>([]);

  // ── Chat state ────────────────────────────────────────────────────────────
  const [channels, setChannels] = useState<ApiChannel[]>([]);
  const [messageMap, setMessageMap] = useState<Record<number, ApiMessage[]>>(
    {},
  );
  const [lastSeenIds, setLastSeenIds] = useState<Record<number, number>>({});
  const [channelMembers, setChannelMembers] = useState<ApiChannelMember[]>([]);
  const [highlightMessageId, setHighlightMessageId] = useState<number | null>(
    null,
  );
  const [loading, setLoading] = useState(true);

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const scrollOnNextRender = useRef(false);
  const pendingScrollMsgId = useRef<number | null>(null);
  const markReadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Derived: vagter channel only
  const vagterChannel = useMemo(
    () => channels.find((c) => c.type === "vagter"),
    [channels],
  );
  const activeChannelId = vagterChannel?.id ?? 0;
  const vagterChannels = useMemo(
    () => (vagterChannel ? [vagterChannel] : []),
    [vagterChannel],
  );
  const messages = messageMap[activeChannelId] ?? [];

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true);
    Promise.all([
      getVagterPageData()
        .then((data) => {
          setSettings(data.settings);
          setChecklist(data.checklist);
        })
        .catch(console.error),
      getClubNights().then(setNights).catch(console.error),
      getChannels()
        .then(async (chs) => {
          const vagter = chs.find((c) => c.type === "vagter");
          if (!vagter) return;
          setChannels(chs);
          const msgs = await getMessages(vagter.id);
          const seed: Record<number, number> = {};
          for (const msg of msgs) {
            if ((seed[msg.channel_id] ?? 0) < msg.id)
              seed[msg.channel_id] = msg.id;
          }
          setMessageMap({ [vagter.id]: msgs });
          setLastSeenIds(seed);
          getChannelMembers(vagter.id)
            .then(setChannelMembers)
            .catch(console.error);
        })
        .catch(console.error),
    ]).finally(() => setLoading(false));
  }, []);

  // Mark channel read on new messages
  useEffect(() => {
    if (!activeChannelId) return;
    const bucket = messageMap[activeChannelId] ?? [];
    const latestId = Math.max(0, ...bucket.map((m) => m.id));
    if (latestId > 0) {
      setLastSeenIds((prev) => ({ ...prev, [activeChannelId]: latestId }));
      if (markReadTimerRef.current) clearTimeout(markReadTimerRef.current);
      markReadTimerRef.current = setTimeout(() => {
        markChannelRead(activeChannelId, latestId).catch(() => {});
      }, 1500);
    }
  }, [activeChannelId, messageMap]);

  // SSE real-time updates
  const { connected: sseConnected } = useChannelSSE(activeChannelId, (msg) => {
    if (msg.channel_id === activeChannelId) scrollOnNextRender.current = true;
    setMessageMap((prev) => upsertIntoMap(prev, msg));
  });

  useUserSSE((evt) => {
    if (evt.event === "message_edited" || evt.event === "message_deleted") {
      const msg = evt.data.message as ApiMessage;
      setMessageMap((prev) => upsertIntoMap(prev, msg));
    }
  });

  // Fallback poll when SSE disconnected
  useEffect(() => {
    if (sseConnected || !activeChannelId) return;
    const id = setInterval(
      () =>
        getMessages(activeChannelId)
          .then((msgs) =>
            setMessageMap((prev) => ({ ...prev, [activeChannelId]: msgs })),
          )
          .catch(console.error),
      10_000,
    );
    return () => clearInterval(id);
  }, [activeChannelId, sseConnected]);

  // Scroll on new messages
  useEffect(() => {
    if (pendingScrollMsgId.current !== null) {
      const el = messagesContainerRef.current?.querySelector(
        `[data-msg-id="${pendingScrollMsgId.current}"]`,
      ) as HTMLElement | null;
      if (el) {
        el.scrollIntoView({ block: "center" });
        const id = pendingScrollMsgId.current;
        pendingScrollMsgId.current = null;
        setHighlightMessageId(id);
        setTimeout(() => setHighlightMessageId(null), 2000);
      }
      return;
    }
    if (scrollOnNextRender.current) {
      const container = messagesContainerRef.current;
      if (container) container.scrollTop = container.scrollHeight;
      scrollOnNextRender.current = false;
    }
  }, [messages]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleSendMessage = useCallback(
    async (body: string) => {
      if (!user || !activeChannelId) return;
      const msg = await postMessage(activeChannelId, user.id, body);
      scrollOnNextRender.current = true;
      setMessageMap((prev) => upsertIntoMap(prev, msg));
    },
    [activeChannelId, user],
  );

  const handleEditMessage = useCallback(
    async (msg: ApiMessage, newBody: string) => {
      const optimistic: ApiMessage = {
        ...msg,
        body: newBody,
        edited_at: new Date().toISOString(),
      };
      setMessageMap((prev) => upsertIntoMap(prev, optimistic));
      try {
        await patchMessage(msg.channel_id, msg.id, { body: newBody });
      } catch (err) {
        setMessageMap((prev) => upsertIntoMap(prev, msg));
        toast.error(
          err instanceof Error ? err.message : "Kunne ikke redigere besked.",
        );
      }
    },
    [],
  );

  const handleDeleteMessage = useCallback(async (msg: ApiMessage) => {
    const optimistic: ApiMessage = { ...msg, is_deleted: true };
    setMessageMap((prev) => upsertIntoMap(prev, optimistic));
    try {
      await deleteMessage(msg.channel_id, msg.id);
    } catch (err) {
      setMessageMap((prev) => upsertIntoMap(prev, msg));
      toast.error(
        err instanceof Error ? err.message : "Kunne ikke slette besked.",
      );
    }
  }, []);

  const handleSaveSettings = useCallback(
    async (patch: Partial<ApiVagterSettings>) => {
      await updateVagterSettings(patch);
      setSettings((prev) => ({ ...prev, ...patch }));
    },
    [],
  );

  const handleSaveNote = useCallback(async (value: string) => {
    await updateVagterSettings({ shift_note: value });
    setSettings((prev) => ({ ...prev, shift_note: value }));
  }, []);

  const handleAddChecklist = useCallback(
    async (text: string, is_header: boolean) => {
      const nextOrder = checklist.length;
      const item = await addChecklistItem(text, nextOrder, is_header);
      setChecklist((prev) => [...prev, item]);
    },
    [checklist],
  );

  const handleUpdateChecklist = useCallback(
    async (
      id: number,
      patch: { text?: string; sort_order?: number; is_header?: boolean },
    ) => {
      const updated = await updateChecklistItem(id, patch);
      setChecklist((prev) => prev.map((i) => (i.id === id ? updated : i)));
    },
    [],
  );

  const handleDeleteChecklist = useCallback(async (id: number) => {
    await deleteChecklistItem(id);
    setChecklist((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const handleReorderChecklist = useCallback(
    async (id: number, direction: "up" | "down") => {
      const idx = checklist.findIndex((i) => i.id === id);
      if (idx === -1) return;
      const swapIdx = direction === "up" ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= checklist.length) return;

      // Optimistic swap
      const next = [...checklist];
      const aOrder = next[idx].sort_order;
      const bOrder = next[swapIdx].sort_order;
      next[idx] = { ...next[idx], sort_order: bOrder };
      next[swapIdx] = { ...next[swapIdx], sort_order: aOrder };
      // If sort_orders are equal, use array position
      if (aOrder === bOrder) {
        next[idx] = { ...next[idx], sort_order: idx };
        next[swapIdx] = { ...next[swapIdx], sort_order: swapIdx };
      }
      next.sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
      setChecklist(next);

      try {
        await Promise.all([
          updateChecklistItem(next.find((i) => i.id === id)!.id, {
            sort_order: next.find((i) => i.id === id)!.sort_order,
          }),
          updateChecklistItem(
            next.find((i) => i.id === checklist[swapIdx].id)!.id,
            {
              sort_order: next.find((i) => i.id === checklist[swapIdx].id)!
                .sort_order,
            },
          ),
        ]);
      } catch (err) {
        // Roll back
        setChecklist(checklist);
        toast.error(
          err instanceof Error ? err.message : "Kunne ikke ændre rækkefølge.",
        );
      }
    },
    [checklist],
  );

  if (!authorized) return null;

  const today = new Date().toISOString().slice(0, 10);
  const upcomingNights = nights
    .filter((n) => n.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));
  const myUpcomingShifts = user
    ? upcomingNights.filter((n) => n.vagt_member_id === user.id)
    : [];
  const checkedCount = checklist.length; // display total items; checked state is local
  const checklistItemCount = checklist.filter((i) => !i.is_header).length;

  return (
    <main className="max-w-285 mx-auto px-4 sm:px-8 py-8 flex flex-col gap-6">
      {/* Hero */}
      <MemberHero>
        <div className="flex flex-col items-center">
          {loading ? (
            <Skeleton className="h-8 w-8 rounded mb-1 bg-white/20" />
          ) : (
            <span className="font-bold text-2xl text-brand-teal">
              {myUpcomingShifts.length}
            </span>
          )}
          <span className="text-white/60 text-xs">Kommende vagter</span>
        </div>
        <div className="hidden sm:block w-px h-10 bg-white/20" />
        <div className="flex flex-col items-center">
          {loading ? (
            <Skeleton className="h-8 w-8 rounded mb-1 bg-white/20" />
          ) : (
            <span className="font-bold text-2xl text-brand-red">
              {checklistItemCount}
            </span>
          )}
          <span className="text-white/60 text-xs">Tjeklistepunkter</span>
        </div>
      </MemberHero>

      {/* Tonight's shift */}
      <TonightBanner nights={nights} loading={loading} />

      {/* Two-column grid: codes (left) + shift note (right) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <AccessCodesCard
          settings={settings}
          isAdmin={isAdmin}
          onSave={handleSaveSettings}
          loading={loading}
        />
        <ShiftNoteCard
          note={settings.shift_note}
          isAdmin={isAdmin}
          onSave={handleSaveNote}
          loading={loading}
        />
      </div>

      {/* Checklist — full width */}
      <ChecklistCard
        items={checklist}
        isAdmin={isAdmin}
        onAdd={handleAddChecklist}
        onUpdate={handleUpdateChecklist}
        onDelete={handleDeleteChecklist}
        onReorder={handleReorderChecklist}
        loading={loading}
      />

      {/* Vagt chat */}
      {vagterChannel && (
        <div className="flex flex-col gap-2">
          <ChatPanel
            loading={loading}
            channels={vagterChannels}
            activeChannelId={activeChannelId}
            setActiveChannelId={() => {}}
            messages={messages}
            messageMap={messageMap}
            lastSeenIds={lastSeenIds}
            setLastSeenIds={setLastSeenIds}
            user={user}
            nights={nights}
            highlightMessageId={highlightMessageId}
            setHighlightMessageId={setHighlightMessageId}
            swapConfirmMsg={null}
            setSwapConfirmMsg={() => {}}
            channelMembers={channelMembers}
            onSend={handleSendMessage}
            onEdit={handleEditMessage}
            onDelete={handleDeleteMessage}
            messagesContainerRef={messagesContainerRef}
            chatEndRef={chatEndRef}
            pendingScrollMsgId={pendingScrollMsgId}
            hideChannelSelector
          />
        </div>
      )}
    </main>
  );
}
