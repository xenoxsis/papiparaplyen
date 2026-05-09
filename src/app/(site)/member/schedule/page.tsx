"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  CalendarDays,
  Check,
  Plus,
  Search,
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

export default function SchedulePage() {
  const { user, authorized } = useRequireAuth([
    "Administrator",
    "Vagt",
    "Tilskuer",
  ]);

  const isAdmin = user?.roles.includes("Administrator") ?? false;
  const isTilskuer = !isAdmin && (user?.roles.includes("Tilskuer") ?? false);

  // ── Data ─────────────────────────────────────────────────────────────────
  const {
    nights,
    setNights,
    vagter,
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
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingNight, setEditingNight] = useState<ApiClubNight | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [assignModalNightId, setAssignModalNightId] = useState<number | null>(
    null,
  );

  // ── Derived ──────────────────────────────────────────────────────────────
  const missingCount = nights.filter(
    (n) => draft.effectiveVagt(n) === null,
  ).length;
  const awaitingConfirmCount = nights.filter(
    (n) => n.vagt_member_id !== null && !n.vagt_confirmed,
  ).length;

  const filteredNights = useMemo(() => {
    const now = new Date();
    return nights
      .filter((n) => new Date(`${n.date}T${n.time_to}`) > now)
      .filter((n) => n.name.toLowerCase().includes(search.toLowerCase()))
      .filter((n) => !filterMissingVagt || draft.effectiveVagt(n) === null)
      .filter(
        (n) =>
          !filterUnreviewed || !myReview || n.created_at > myReview.reviewed_at,
      )
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [nights, search, filterMissingVagt, filterUnreviewed, myReview, draft]);

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
                location: data.location,
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
                location: data.location,
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

            {/* Auto-assign button — mobile only */}
            {isAdmin && (
              <Button
                variant="outline"
                className="md:hidden gap-2 border-purple-200 text-purple-700 hover:bg-purple-50 hover:border-purple-400"
                onClick={draft.handleAutoAssign}
                disabled={draft.saving}
              >
                <Wand2 className="size-4" />
                Auto-tildel vagter
              </Button>
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
                placeholder="Søg efter klubaften…"
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
                }}
                className={`flex items-center gap-1.5 text-xs font-medium rounded-full px-3 py-1 border cursor-pointer transition-colors ${
                  filterUnreviewed
                    ? "bg-brand-orange border-brand-orange text-white"
                    : "bg-white border-neutral-200 text-neutral-600 hover:border-neutral-400"
                }`}
              >
                Ikke gennemgået
              </button>
              {isAdmin && (
                <button
                  onClick={() => {
                    setFilterMissingVagt((v) => !v);
                    setFilterUnreviewed(false);
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
            </div>
          </CardHeader>

          <CardContent className="flex p-0 flex-col gap-3">
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
                  {submittingReview ? "Gemmer…" : "Jeg har gennemgået skemaet"}
                </button>
              </div>
            )}
            <div
              className="flex flex-col gap-3 overflow-y-auto"
              style={{ maxHeight: "calc(6 * 5.5rem + 5 * 0.75rem)" }}
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
                        onToggleOptOut={() => toggleOptOut(night.id, myOptOut)}
                      />
                    );
                  })}
                </>
              )}
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
                  const review = reviews.find((r) => r.member_id === m.id);
                  const hasUnreviewed = nights.some(
                    (n) => !review || n.created_at > review.reviewed_at,
                  );
                  return (
                    <div
                      key={m.id}
                      className="flex items-center gap-2 rounded-md px-2 py-2 border border-neutral-100 bg-white"
                    >
                      <div className="w-7 h-7 rounded-full bg-brand-red text-white flex items-center justify-center text-[0.55rem] font-bold select-none shrink-0">
                        {m.initials}
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
    </main>
  );
}
