"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  CalendarDays,
  Check,
  LayoutGrid,
  List as ListIcon,
  Plus,
  Search,
  Send,
  Settings,
  UserCheck,
  Wand2,
} from "lucide-react";
import { MemberHero } from "@/components/MemberHero";
import { ClubNightModal } from "@/components/ClubNightModal";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { Modal } from "@/components/Modal";
import {
  deleteClubNight,
  deleteClubNightOptOut,
  getClubNights,
  postClubNight,
  postClubNightOptOut,
  putClubNight,
  cancelClubNight,
  publishDraftNights,
  markNotificationsReadByLink,
  type ApiClubNight,
} from "@/lib/api";

import { useScheduleData } from "./useScheduleData";
import { useVagtDraft } from "./useVagtDraft";
import {
  ScheduleNightCard,
  ScheduleNightCardSkeleton,
} from "./ScheduleNightCard";
import { VagterPanel } from "./VagterPanel";
import { AssignModal } from "./AssignModal";
import { AutoAssignSettingsModal } from "./AutoAssignSettingsModal";
import { CalendarView } from "./_calendar/CalendarView";

type ScheduleView = "list" | "calendar";
const VIEW_STORAGE_KEY = "schedule.view";

export default function SchedulePage() {
  const { user, authorized } = useRequireAuth([
    "Administrator",
    "Vagt",
    "Tilskuer",
  ]);

  const isAdmin = user?.roles.includes("Administrator") ?? false;
  const isTilskuer = !isAdmin && (user?.roles.includes("Tilskuer") ?? false);

  // Mark all schedule-related notifications as read when this page is visited
  useEffect(() => {
    markNotificationsReadByLink("/member/schedule").catch(() => {});
  }, []);

  // ── Data ─────────────────────────────────────────────────────────────────
  const {
    nights,
    setNights,
    vagter,
    setVagter,
    reviews,
    pendingSwapMsgs,
    submittingReview,
    loading: scheduleLoading,
    myReview,
    hasUnreviewedNights,
    submitReview,
  } = useScheduleData(isAdmin);

  // ── Draft / assignment logic ─────────────────────────────────────────────
  const draft = useVagtDraft(nights, setNights, vagter, isAdmin);

  // ── Local UI state ───────────────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [filterMissingVagt, setFilterMissingVagt] = useState(false);
  const [filterUnreviewed, setFilterUnreviewed] = useState(false);
  const [filterMyShifts, setFilterMyShifts] = useState(false);
  const [filterDrafts, setFilterDrafts] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingNight, setEditingNight] = useState<ApiClubNight | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [cancelConfirmNight, setCancelConfirmNight] =
    useState<ApiClubNight | null>(null);
  const [assignModalNightId, setAssignModalNightId] = useState<number | null>(
    null,
  );
  const [showAutoAssignSettings, setShowAutoAssignSettings] = useState(false);
  const [view, setView] = useState<ScheduleView>("list");
  const [publishingDrafts, setPublishingDrafts] = useState(false);

  // Persist + restore selected view.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(VIEW_STORAGE_KEY);
    if (stored === "calendar" || stored === "list") setView(stored);
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(VIEW_STORAGE_KEY, view);
  }, [view]);

  // ── Derived ──────────────────────────────────────────────────────────────
  const missingCount = nights.filter(
    (n) => draft.effectiveVagt(n) === null,
  ).length;
  const awaitingConfirmCount = nights.filter(
    (n) => n.vagt_member_id !== null && !n.vagt_confirmed,
  ).length;
  const draftCount = isAdmin
    ? nights.filter((n) => n.status === "draft").length
    : 0;

  const filteredNights = useMemo(() => {
    const now = new Date();
    const q = search.trim().toLowerCase();
    return nights
      .filter((n) => new Date(`${n.date}T${n.time_to}`) > now)
      .filter((n) => {
        if (!q) return true;
        const dateFormatted = new Date(n.date).toLocaleDateString("da-DK", {
          day: "numeric",
          month: "long",
          year: "numeric",
        });
        return (
          n.name.toLowerCase().includes(q) ||
          n.date.includes(q) ||
          dateFormatted.toLowerCase().includes(q) ||
          (n.assigned_member_name ?? "").toLowerCase().includes(q) ||
          (n.assigned_member_initials ?? "").toLowerCase().includes(q)
        );
      })
      .filter((n) => !filterMissingVagt || draft.effectiveVagt(n) === null)
      .filter(
        (n) =>
          !filterUnreviewed ||
          (n.status !== "draft" &&
            (!myReview || n.created_at > (myReview.reviewed_at ?? ""))),
      )
      .filter((n) => !filterMyShifts || n.vagt_member_id === user?.id)
      .filter((n) => !filterDrafts || n.status === "draft")
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [
    nights,
    search,
    filterMissingVagt,
    filterUnreviewed,
    filterMyShifts,
    filterDrafts,
    myReview,
    draft,
    user,
  ]);

  // ── Handlers ─────────────────────────────────────────────────────────────
  async function toggleOptOut(nightId: number, currentlyOptedOut: boolean) {
    // Optimistic update
    const userId = user?.id;
    setNights((prev) =>
      prev.map((n) => {
        if (n.id !== nightId || !userId) return n;
        const opts = n.opted_out_members;
        return {
          ...n,
          opted_out_members: currentlyOptedOut
            ? opts.filter((o) => o.id !== userId)
            : [
                ...opts,
                { id: userId, name: user!.name, initials: user!.initials },
              ],
        };
      }),
    );
    try {
      if (currentlyOptedOut) {
        await deleteClubNightOptOut(nightId);
      } else {
        await postClubNightOptOut(nightId);
      }
    } catch (err) {
      // Roll back optimistic update on failure
      const restored = await getClubNights();
      setNights(restored);
      console.error(err);
      toast.error("Noget gik galt. Prøv igen.");
    }
  }

  async function handlePublishDrafts() {
    setPublishingDrafts(true);
    try {
      const result = await publishDraftNights();
      setNights((prev) =>
        prev.map((n) => {
          const published = result.nights.find((p) => p.id === n.id);
          return published ?? n;
        }),
      );
      toast.success(
        result.published === 1
          ? `1 klubaften er nu udgivet og synlig for vagterne.`
          : `${result.published} klubaftener er nu udgivet og synlige for vagterne.`,
      );
    } catch (err) {
      console.error(err);
      toast.error("Noget gik galt. Prøv igen.");
    } finally {
      setPublishingDrafts(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────
  if (!authorized) return null;
  return (
    <main className="bg-neutral-100 min-h-[calc(100vh-3.5rem)] p-4 sm:p-8 flex flex-col gap-6 sm:gap-8">
      {/* Edit club night modal */}
      {isAdmin && editingNight && (
        <ClubNightModal
          night={editingNight}
          onClose={() => setEditingNight(null)}
          onEdit={async (data) => {
            try {
              const updated = await putClubNight(editingNight.id, {
                name: data.name,
                time_from: data.timeFrom,
                time_to: data.timeTo,
                location_id: data.location_id,
              });
              setNights((prev) =>
                prev.map((n) => (n.id === updated.id ? updated : n)),
              );
            } catch (err) {
              console.error(err);
              toast.error("Noget gik galt. Prøv igen.");
            }
            setEditingNight(null);
          }}
        />
      )}

      {/* Add club night modal */}
      {isAdmin && showAddModal && (
        <ClubNightModal
          nextNumber={
            nights.length > 0
              ? Math.max(...nights.map((n) => n.number)) + 1
              : 51
          }
          existingDates={nights.map((n) => n.date)}
          onClose={() => setShowAddModal(false)}
          onAdd={async (data) => {
            try {
              const created = await postClubNight({
                name: data.name,
                date: data.date,
                time_from: data.timeFrom,
                time_to: data.timeTo,
                location_id: data.location_id,
                vagt_member_id: data.vagt_member_id,
              });
              setNights((prev) =>
                [...prev, created].sort((a, b) => a.date.localeCompare(b.date)),
              );
            } catch (err) {
              console.error(err);
              toast.error("Noget gik galt. Prøv igen.");
            }
            setShowAddModal(false);
          }}
        />
      )}

      {/* Replace-vagt confirmation dialog */}
      {draft.confirmDialog &&
        (() => {
          const night = nights.find(
            (n) => n.id === draft.confirmDialog!.nightId,
          );
          const current = night ? draft.effectiveVagt(night) : null;
          const newMember = vagter.find(
            (v) => v.id === draft.confirmDialog!.newMemberId,
          );
          return (
            <Modal
              open={!!draft.confirmDialog}
              onClose={draft.cancelConfirm}
              maxWidth="max-w-sm"
              panelClassName="p-6 flex flex-col gap-4"
            >
              <h2 className="font-semibold text-base text-neutral-900">
                Erstat vagt?
              </h2>
              <p className="text-sm text-neutral-500">
                <span className="font-semibold text-neutral-900">
                  {current?.name}
                </span>{" "}
                er allerede tildelt. Vil du erstatte med{" "}
                <span className="font-semibold text-neutral-900">
                  {newMember?.name}
                </span>
                ?
              </p>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={draft.cancelConfirm}>
                  Annuller
                </Button>
                <Button
                  className="bg-brand-red hover:bg-red-600 text-white"
                  onClick={draft.confirmReplace}
                >
                  Erstat
                </Button>
              </div>
            </Modal>
          );
        })()}

      {/* Cancel night confirmation dialog */}
      {cancelConfirmNight !== null && (
        <Modal
          open={cancelConfirmNight !== null}
          onClose={() => setCancelConfirmNight(null)}
          maxWidth="max-w-sm"
          panelClassName="p-6 flex flex-col gap-4"
        >
          <h2 className="font-semibold text-base text-neutral-900">
            Aflys klubaften?
          </h2>
          <p className="text-sm text-neutral-500">
            Er du sikker på at du vil aflyse{" "}
            <span className="font-semibold text-neutral-900">
              {cancelConfirmNight.name}
            </span>
            ? Aftenen forbliver synlig på begivenhedssiden markeret som aflyst.
          </p>
          <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5">
            <span className="text-amber-500 shrink-0 mt-0.5 text-base leading-4">
              ⚠️
            </span>
            <p className="text-xs text-amber-800 leading-5">
              Vagten og alle følgere vil modtage en notifikation og e-mail om
              aflysningen.
            </p>
          </div>
          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              onClick={() => setCancelConfirmNight(null)}
            >
              Annuller
            </Button>
            <Button
              className="bg-brand-red hover:bg-red-600 text-white"
              onClick={async () => {
                const night = cancelConfirmNight;
                setCancelConfirmNight(null);
                try {
                  const updated = await cancelClubNight(night.id);
                  setNights((prev) =>
                    prev.map((n) => (n.id === updated.id ? updated : n)),
                  );
                } catch (err) {
                  console.error(err);
                  toast.error("Noget gik galt. Prøv igen.");
                }
              }}
            >
              Aflys
            </Button>
          </div>
        </Modal>
      )}

      {/* Delete night confirmation dialog */}
      {deleteConfirmId !== null &&
        (() => {
          const night = nights.find((n) => n.id === deleteConfirmId);
          return (
            <Modal
              open={deleteConfirmId !== null}
              onClose={() => setDeleteConfirmId(null)}
              maxWidth="max-w-sm"
              panelClassName="p-6 flex flex-col gap-4"
            >
              <h2 className="font-semibold text-base text-neutral-900">
                Slet klubaften?
              </h2>
              <p className="text-sm text-neutral-500">
                Er du sikker på at du vil slette{" "}
                <span className="font-semibold text-neutral-900">
                  {night?.name}
                </span>
                ? Dette kan ikke fortrydes.
              </p>
              {night?.vagt_member_id && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5">
                  <span className="text-amber-500 shrink-0 mt-0.5 text-base leading-4">
                    ⚠️
                  </span>
                  <p className="text-xs text-amber-800 leading-5">
                    <span className="font-semibold">
                      {night.assigned_member_name ?? "En vagt"}
                    </span>{" "}
                    er tildelt denne aften og vil blive afmeldt og modtage en
                    notifikation og e-mail.
                  </p>
                </div>
              )}
              <div className="flex gap-2 justify-end">
                <Button
                  variant="outline"
                  onClick={() => setDeleteConfirmId(null)}
                >
                  Annuller
                </Button>
                <Button
                  className="bg-brand-red hover:bg-red-600 text-white"
                  onClick={async () => {
                    try {
                      await deleteClubNight(deleteConfirmId!);
                      setNights((prev) =>
                        prev.filter((n) => n.id !== deleteConfirmId),
                      );
                      draft.deletePending(deleteConfirmId!);
                    } catch (err) {
                      console.error(err);
                      toast.error("Noget gik galt. Prøv igen.");
                    } finally {
                      setDeleteConfirmId(null);
                    }
                  }}
                >
                  Slet
                </Button>
              </div>
            </Modal>
          );
        })()}

      {/* Hero stats */}
      <MemberHero>
        <div className="flex flex-col items-center">
          <span className="font-bold text-brand-orange text-2xl leading-8">
            {nights.length}
          </span>
          <span className="text-white/60 text-xs leading-4">
            Kommende klubaftener
          </span>
        </div>
        {isAdmin && (
          <>
            <div className="hidden sm:block bg-white/20 w-px h-10" />
            <div className="flex flex-col items-center">
              <span className="font-bold text-brand-red text-2xl leading-8">
                {missingCount}
              </span>
              <span className="text-white/60 text-xs leading-4">
                Vagter at tildele
              </span>
            </div>
            <div className="hidden sm:block bg-white/20 w-px h-10" />
            <div className="flex flex-col items-center">
              <span className="font-bold text-brand-orange text-2xl leading-8">
                {awaitingConfirmCount}
              </span>
              <span className="text-white/60 text-xs leading-4">
                Afventer bekræftelse
              </span>
            </div>
            <div className="hidden sm:block bg-white/20 w-px h-10" />
            <div className="flex flex-col items-center">
              <span className="font-bold text-brand-teal text-2xl leading-8">
                {vagter.length}
              </span>
              <span className="text-white/60 text-xs leading-4">
                Aktive vagter
              </span>
            </div>
          </>
        )}
      </MemberHero>

      {/* View toggle (list / calendar) — always visible above the main area. */}
      <div className="flex items-center justify-between gap-3 flex-wrap print:hidden">
        <div
          className="inline-flex rounded-md border border-neutral-200 bg-white overflow-hidden"
          role="tablist"
          aria-label="Visningstilstand"
        >
          <button
            role="tab"
            aria-selected={view === "list"}
            onClick={() => setView("list")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer border-none ${
              view === "list"
                ? "bg-brand-red text-white"
                : "bg-white text-neutral-600 hover:bg-neutral-50"
            }`}
          >
            <ListIcon className="size-3.5" />
            Liste
          </button>
          <button
            role="tab"
            aria-selected={view === "calendar"}
            onClick={() => setView("calendar")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer border-none border-l border-l-neutral-200 ${
              view === "calendar"
                ? "bg-brand-red text-white"
                : "bg-white text-neutral-600 hover:bg-neutral-50"
            }`}
          >
            <LayoutGrid className="size-3.5" />
            Kalender
          </button>
        </div>
        {view === "calendar" && isAdmin && (
          <div className="flex items-center gap-2 flex-wrap">
            {draftCount > 0 && (
              <Button
                size="sm"
                className="bg-amber-500 hover:bg-amber-600 text-white gap-2"
                onClick={handlePublishDrafts}
                disabled={publishingDrafts}
              >
                <Send className="size-4" />
                {publishingDrafts
                  ? "Udgiver…"
                  : `Udgiv ${draftCount} kladde${draftCount !== 1 ? "r" : ""}`}
              </Button>
            )}
            {draft.hasPendingChanges && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={draft.discard}
                  disabled={draft.saving}
                >
                  Fortryd
                </Button>
                <Button
                  size="sm"
                  className="bg-brand-teal hover:bg-teal-700 text-white gap-2"
                  onClick={draft.saveChanges}
                  disabled={draft.saving}
                >
                  <Check className="size-4" />
                  {draft.saving
                    ? "Gemmer…"
                    : `Gem ${Object.keys(draft.pendingChanges).length} ændring${Object.keys(draft.pendingChanges).length !== 1 ? "er" : ""}`}
                </Button>
              </>
            )}
            <Button
              size="sm"
              className="bg-brand-red text-white gap-2"
              onClick={() => setShowAddModal(true)}
            >
              <Plus className="size-4" />
              Tilføj klubaften
            </Button>
          </div>
        )}
      </div>

      {view === "calendar" ? (
        <div className="flex flex-col gap-4">
          {/* Auto-assign on mobile (member chip strip is hidden below md). */}
          {isAdmin && (
            <div className="md:hidden flex gap-2 print:hidden">
              <Button
                variant="outline"
                className="flex-1 gap-2 border-purple-200 text-purple-700 hover:bg-purple-50 hover:border-purple-400"
                onClick={draft.handleAutoAssign}
                disabled={draft.saving}
              >
                <Wand2 className="size-4" />
                Auto-tildel vagter
              </Button>
              <Button
                variant="outline"
                className="shrink-0 px-2 border-purple-200 text-purple-700 hover:bg-purple-50 hover:border-purple-400"
                onClick={() => setShowAutoAssignSettings(true)}
                disabled={draft.saving}
                aria-label="Auto-tildel indstillinger"
                title="Auto-tildel indstillinger"
              >
                <Settings className="size-4" />
              </Button>
            </div>
          )}
          {isAdmin && (
            <div className="hidden md:block sticky top-14 z-20 bg-neutral-100 -mx-4 sm:-mx-8 px-4 sm:px-8 pb-2 pt-1 print:static print:mx-0 print:px-0">
              <VagterPanel
                vagter={vagter}
                draggingMemberId={draft.draggingMemberId}
                saving={draft.saving}
                onDragStart={(id) => draft.setDraggingMemberId(id)}
                onDragEnd={() => {
                  draft.setDraggingMemberId(null);
                  draft.setDragOverNightId(null);
                }}
                onAutoAssign={draft.handleAutoAssign}
                onOpenAutoAssignSettings={() => setShowAutoAssignSettings(true)}
                orientation="horizontal"
              />
            </div>
          )}
          <CalendarView
            nights={nights}
            vagter={vagter}
            isAdmin={isAdmin}
            pendingChanges={draft.pendingChanges}
            autoAssignedIds={draft.autoAssignedIds}
            problemNightIds={draft.problemNightIds}
            draggingMemberId={draft.draggingMemberId}
            dragOverNightId={draft.dragOverNightId}
            effectiveVagt={draft.effectiveVagt}
            setDragOverNightId={draft.setDragOverNightId}
            onCellDrop={(nightId) => draft.handleDrop(nightId)}
            onCellReassignDrop={(from, to) =>
              draft.handleReassignDrop(from, to)
            }
            onAssignClick={(nightId) => setAssignModalNightId(nightId)}
            onRemoveVagt={(nightId) => draft.removeVagt(nightId)}
            onEdit={(night) => setEditingNight(night)}
            onDelete={(nightId) => setDeleteConfirmId(nightId)}
            onCancel={(night) => setCancelConfirmNight(night)}
          />
        </div>
      ) : (
        <div
          className={`grid gap-6 ${isAdmin ? "grid-cols-1 md:grid-cols-3 items-stretch" : "grid-cols-1"}`}
        >
          {/* Shift list */}
          <Card
            className={`${isAdmin ? "md:col-span-2" : "col-span-1"} p-6 gap-4 flex flex-col`}
          >
            <CardHeader className="p-0 gap-4 flex flex-col">
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                <div className="flex items-center gap-2">
                  <CalendarDays className="size-5" />
                  <CardTitle className="text-base leading-6">
                    Klubaftener · Vagtplan
                  </CardTitle>
                </div>
                {isAdmin && (
                  <Button
                    className="bg-brand-red text-white gap-2"
                    onClick={() => setShowAddModal(true)}
                  >
                    <Plus className="size-4" />
                    Tilføj klubaften
                  </Button>
                )}
              </div>

              {/* Publish drafts banner — shown when admin has unpublished nights */}
              {isAdmin && draftCount > 0 && (
                <div className="flex items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5">
                  <span className="text-amber-600 text-sm font-medium flex-1">
                    {draftCount === 1
                      ? `1 klubaften er kladde og ikke synlig for vagterne endnu.`
                      : `${draftCount} klubaftener er kladder og ikke synlige for vagterne endnu.`}
                  </span>
                  <Button
                    size="sm"
                    className="bg-amber-500 hover:bg-amber-600 text-white gap-2 shrink-0"
                    onClick={handlePublishDrafts}
                    disabled={publishingDrafts}
                  >
                    <Send className="size-4" />
                    {publishingDrafts
                      ? "Udgiver…"
                      : `Udgiv ${draftCount === 1 ? "kladde" : "alle kladder"}`}
                  </Button>
                </div>
              )}

              {/* Auto-assign buttons — mobile only */}
              {isAdmin && (
                <div className="md:hidden flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1 gap-2 border-purple-200 text-purple-700 hover:bg-purple-50 hover:border-purple-400"
                    onClick={draft.handleAutoAssign}
                    disabled={draft.saving}
                  >
                    <Wand2 className="size-4" />
                    Auto-tildel vagter
                  </Button>
                  <Button
                    variant="outline"
                    className="shrink-0 px-2 border-purple-200 text-purple-700 hover:bg-purple-50 hover:border-purple-400"
                    onClick={() => setShowAutoAssignSettings(true)}
                    disabled={draft.saving}
                    aria-label="Auto-tildel indstillinger"
                    title="Auto-tildel indstillinger"
                  >
                    <Settings className="size-4" />
                  </Button>
                </div>
              )}

              {/* Save/discard pending changes */}
              {isAdmin && draft.hasPendingChanges && (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={draft.discard}
                    disabled={draft.saving}
                  >
                    Fortryd
                  </Button>
                  <Button
                    className="bg-brand-teal hover:bg-teal-700 text-white gap-2"
                    onClick={draft.saveChanges}
                    disabled={draft.saving}
                  >
                    <Check className="size-4" />
                    {draft.saving
                      ? "Gemmer…"
                      : `Gem ${Object.keys(draft.pendingChanges).length} ændring${Object.keys(draft.pendingChanges).length !== 1 ? "er" : ""}`}
                  </Button>
                </div>
              )}

              <div className="relative">
                <Search
                  className="size-4 top-1/2 -translate-y-1/2 text-neutral-500 absolute left-3"
                  aria-hidden="true"
                />
                <Input
                  aria-label="Søg efter klubaften"
                  placeholder="Søg på navn, dato eller vagt…"
                  className="pl-9 h-9"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              {/* Filter toggles */}
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => {
                    setFilterUnreviewed((v) => !v);
                    setFilterMissingVagt(false);
                    setFilterMyShifts(false);
                    setFilterDrafts(false);
                  }}
                  className={`flex items-center gap-1.5 text-xs font-medium rounded-full px-3 py-1 border cursor-pointer transition-colors ${
                    filterUnreviewed
                      ? "bg-brand-orange border-brand-orange text-white"
                      : "bg-white border-neutral-200 text-neutral-600 hover:border-neutral-400"
                  }`}
                >
                  Ikke gennemgået
                </button>
                {!isTilskuer && (
                  <button
                    onClick={() => {
                      setFilterMyShifts((v) => !v);
                      setFilterMissingVagt(false);
                      setFilterUnreviewed(false);
                      setFilterDrafts(false);
                    }}
                    className={`flex items-center gap-1.5 text-xs font-medium rounded-full px-3 py-1 border cursor-pointer transition-colors ${
                      filterMyShifts
                        ? "bg-brand-teal border-brand-teal text-white"
                        : "bg-white border-neutral-200 text-neutral-600 hover:border-neutral-400"
                    }`}
                  >
                    Mine vagter
                  </button>
                )}
                {isAdmin && (
                  <button
                    onClick={() => {
                      setFilterMissingVagt((v) => !v);
                      setFilterUnreviewed(false);
                      setFilterMyShifts(false);
                      setFilterDrafts(false);
                    }}
                    className={`flex items-center gap-1.5 text-xs font-medium rounded-full px-3 py-1 border cursor-pointer transition-colors ${
                      filterMissingVagt
                        ? "bg-brand-red border-brand-red text-white"
                        : "bg-white border-neutral-200 text-neutral-600 hover:border-neutral-400"
                    }`}
                  >
                    Mangler vagt
                  </button>
                )}
                {isAdmin && draftCount > 0 && (
                  <button
                    onClick={() => {
                      setFilterDrafts((v) => !v);
                      setFilterMissingVagt(false);
                      setFilterUnreviewed(false);
                      setFilterMyShifts(false);
                    }}
                    className={`flex items-center gap-1.5 text-xs font-medium rounded-full px-3 py-1 border cursor-pointer transition-colors ${
                      filterDrafts
                        ? "bg-amber-500 border-amber-500 text-white"
                        : "bg-white border-amber-300 text-amber-700 hover:border-amber-500"
                    }`}
                  >
                    Kladder{draftCount > 0 && ` (${draftCount})`}
                  </button>
                )}
              </div>
            </CardHeader>

            <CardContent className="flex p-0 flex-col gap-3 flex-1 min-h-0">
              {/* Vagt review banner */}
              {hasUnreviewedNights && !isTilskuer && (
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-lg border border-brand-orange/40 bg-brand-orange/10 p-3">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-neutral-800">
                      Der er nye aftener siden du sidst gennemgik skemaet
                    </p>
                    <p className="text-xs text-neutral-500 mt-0.5">
                      Gennemgå listen og meld fra på de aftener du ikke kan tage
                    </p>
                  </div>
                  <button
                    onClick={submitReview}
                    disabled={submittingReview}
                    className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-orange text-white text-xs font-semibold hover:bg-orange-400 transition-colors cursor-pointer border-none disabled:opacity-60 w-full sm:w-auto justify-center"
                  >
                    <Check className="size-3.5" />
                    {submittingReview
                      ? "Gemmer…"
                      : "Jeg har gennemgået skemaet"}
                  </button>
                </div>
              )}
              <div className="relative flex-1 min-h-0 flex flex-col">
                <div
                  className="flex flex-col gap-3 overflow-y-auto flex-1 min-h-0"
                  style={{ maxHeight: "calc(8 * 5.5rem + 7 * 0.75rem)" }}
                >
                  {scheduleLoading ? (
                    Array.from({ length: 6 }).map((_, i) => (
                      <ScheduleNightCardSkeleton key={i} />
                    ))
                  ) : (
                    <>
                      {filteredNights.length === 0 && (
                        <p className="text-sm text-neutral-400 py-6 text-center">
                          Ingen klubaftener fundet
                        </p>
                      )}
                      {filteredNights.map((night) => {
                        const vagt = draft.effectiveVagt(night);
                        const isPending = night.id in draft.pendingChanges;
                        const swapMsg =
                          pendingSwapMsgs.find(
                            (m) => m.shift_night_id === night.id,
                          ) ?? null;
                        const myOptOut =
                          user !== null &&
                          night.opted_out_members.some((o) => o.id === user.id);
                        const canOptOut =
                          !!user && !user.roles.includes("Tilskuer");

                        return (
                          <ScheduleNightCard
                            key={night.id}
                            night={night}
                            vagt={vagt}
                            isPending={isPending}
                            isAutoAssigned={draft.autoAssignedIds.has(night.id)}
                            isProblem={draft.problemNightIds.includes(night.id)}
                            isOver={draft.dragOverNightId === night.id}
                            swapMsg={swapMsg}
                            myOptOut={myOptOut}
                            canOptOut={canOptOut}
                            isAdmin={isAdmin}
                            userId={user?.id ?? null}
                            onDragOver={(e) => {
                              e.preventDefault();
                              draft.setDragOverNightId(night.id);
                            }}
                            onDragLeave={() => draft.setDragOverNightId(null)}
                            onDrop={() => draft.handleDrop(night.id)}
                            onAssign={() => setAssignModalNightId(night.id)}
                            onRemoveVagt={() => draft.removeVagt(night.id)}
                            onEdit={() => setEditingNight(night)}
                            onDelete={() => setDeleteConfirmId(night.id)}
                            onCancel={() => setCancelConfirmNight(night)}
                            onToggleOptOut={() =>
                              toggleOptOut(night.id, myOptOut)
                            }
                          />
                        );
                      })}
                    </>
                  )}
                </div>
                {/* Top fade */}
                <div className="pointer-events-none absolute inset-x-0 top-0 h-6 bg-gradient-to-b from-white to-transparent" />
                {/* Bottom fade */}
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-white to-transparent" />
              </div>
            </CardContent>
          </Card>

          {/* Sidebar — admins only */}
          {isAdmin && (
            <div className="col-span-1 flex flex-col gap-6 min-h-0">
              <VagterPanel
                vagter={vagter}
                draggingMemberId={draft.draggingMemberId}
                saving={draft.saving}
                onDragStart={(id) => draft.setDraggingMemberId(id)}
                onDragEnd={() => {
                  draft.setDraggingMemberId(null);
                  draft.setDragOverNightId(null);
                }}
                onAutoAssign={draft.handleAutoAssign}
                onOpenAutoAssignSettings={() => setShowAutoAssignSettings(true)}
              />

              {/* Review status panel */}
              <Card className="p-6 gap-4 flex flex-col">
                <CardHeader className="p-0 gap-1 flex flex-col">
                  <div className="flex items-center gap-2">
                    <UserCheck className="size-5 text-brand-teal" />
                    <CardTitle className="text-base leading-6">
                      Skemaoversigt
                    </CardTitle>
                  </div>
                  <p className="text-xs text-neutral-500">
                    Har vagterne gennemgået de nyeste aftener?
                  </p>
                </CardHeader>
                <CardContent className="flex p-0 flex-col gap-2">
                  {vagter.length === 0 && (
                    <p className="text-xs text-neutral-400 py-2 text-center">
                      Ingen vagter
                    </p>
                  )}
                  {vagter.map((m) => {
                    if (m.is_virtual) {
                      return (
                        <div
                          key={m.id}
                          className="flex items-center gap-2 rounded-md px-2 py-2 border border-brand-teal/20 bg-brand-teal/5"
                        >
                          <div className="w-7 h-7 rounded-full bg-brand-teal/30 border-2 border-dashed border-brand-teal text-brand-teal flex items-center justify-center text-[0.55rem] font-bold select-none shrink-0">
                            {m.initials}
                          </div>
                          <span className="text-xs font-medium text-neutral-800 flex-1 truncate">
                            {m.name}
                          </span>
                          <span className="flex items-center gap-1 text-[10px] text-brand-teal font-medium whitespace-nowrap">
                            <Check className="size-3" />
                            Auto-godkendt
                          </span>
                        </div>
                      );
                    }
                    const review = reviews.find((r) => r.member_id === m.id);
                    const hasUnreviewed = nights.some(
                      (n) =>
                        n.status === "published" &&
                        (!review || n.created_at > (review.reviewed_at ?? "")),
                    );
                    return (
                      <div
                        key={m.id}
                        className="flex items-center gap-2 rounded-md px-2 py-2 border border-neutral-100 bg-white"
                      >
                        <div
                          className={`w-7 h-7 rounded-full text-white flex items-center justify-center text-[0.55rem] font-bold select-none shrink-0 overflow-hidden ${m.is_virtual ? "bg-brand-teal/40 border border-dashed border-brand-teal" : "bg-brand-red"}`}
                        >
                          {m.has_avatar ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={`/api/members/${m.id}/avatar`}
                              alt={m.initials}
                              width={28}
                              height={28}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            m.initials
                          )}
                        </div>
                        <span className="text-xs font-medium text-neutral-800 flex-1 truncate">
                          {m.name}
                        </span>
                        {hasUnreviewed ? (
                          <span className="text-[10px] text-brand-red font-medium whitespace-nowrap">
                            Ikke gennemgået
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-[10px] text-brand-teal font-medium whitespace-nowrap">
                            <Check className="size-3" />
                            Gennemgået
                          </span>
                        )}
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}

      {/* Mobile assign-vagt bottom sheet */}
      {isAdmin &&
        assignModalNightId !== null &&
        (() => {
          const night = nights.find((n) => n.id === assignModalNightId);
          if (!night) return null;
          const currentVagt = draft.effectiveVagt(night);
          return (
            <AssignModal
              night={night}
              currentVagt={currentVagt}
              vagter={vagter}
              onAssign={(nightId, memberId) => {
                draft.handleAssignFromModal(nightId, memberId);
                setAssignModalNightId(null);
              }}
              onRemoveVagt={(nightId) => {
                draft.removeVagt(nightId);
                setAssignModalNightId(null);
              }}
              onClose={() => setAssignModalNightId(null)}
            />
          );
        })()}

      {isAdmin && (
        <AutoAssignSettingsModal
          open={showAutoAssignSettings}
          onClose={() => setShowAutoAssignSettings(false)}
          vagter={vagter}
          setVagter={setVagter}
        />
      )}
    </main>
  );
}
