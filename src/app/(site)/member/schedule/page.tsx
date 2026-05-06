"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  CalendarDays,
  Check,
  ChevronDown,
  Clock,
  GripVertical,
  MapPin,
  Plus,
  Search,
  Trash2,
  UserCheck,
  UserMinus,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { MemberHero } from "@/components/MemberHero";
import { ClubNightModal } from "@/components/ClubNightModal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth-context";
import { useRequireAuth } from "@/lib/useRequireAuth";
import {
  deleteClubNightOptOut,
  deleteClubNight,
  getClubNights,
  getMembers,
  getMyScheduleReview,
  getScheduleReviews,
  patchClubNight,
  postClubNight,
  postClubNightOptOut,
  postScheduleReview,
  type ApiClubNight,
  type ApiMember,
  type ApiScheduleReview,
} from "@/lib/api";

type PendingChanges = Record<number, number | null>;

export default function SchedulePage() {
  useRequireAuth();
  const { user } = useAuth();
  const isAdmin = user?.roles.includes("Administrator") ?? false;

  const [nights, setNights] = useState<ApiClubNight[]>([]);
  const [vagter, setVagter] = useState<ApiMember[]>([]);
  const [reviews, setReviews] = useState<ApiScheduleReview[]>([]);
  const [submittingReview, setSubmittingReview] = useState(false);
  const [search, setSearch] = useState("");
  const [memberSearch, setMemberSearch] = useState("");
  const [filterMissingVagt, setFilterMissingVagt] = useState(false);
  const [filterUnreviewed, setFilterUnreviewed] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [pendingChanges, setPendingChanges] = useState<PendingChanges>({});
  const [saving, setSaving] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    nightId: number;
    newMemberId: number;
  } | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [draggingMemberId, setDraggingMemberId] = useState<number | null>(null);
  const [dragOverNightId, setDragOverNightId] = useState<number | null>(null);
  const [assignModalNightId, setAssignModalNightId] = useState<number | null>(
    null,
  );
  const [assignModalSearch, setAssignModalSearch] = useState("");
  const dragErrorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    getClubNights().then(setNights).catch(console.error);
    getMembers()
      .then((ms) =>
        setVagter(ms.filter((m) => m.roles.includes("Vagt") && !m.banned)),
      )
      .catch(console.error);
    if (isAdmin) {
      getScheduleReviews().then(setReviews).catch(console.error);
    } else {
      getMyScheduleReview()
        .then((r) => {
          if (r) setReviews([r]);
        })
        .catch(console.error);
    }
  }, [isAdmin]);

  function effectiveVagt(
    night: ApiClubNight,
  ): { id: number; name: string; initials: string } | null {
    if (night.id in pendingChanges) {
      const id = pendingChanges[night.id];
      if (id === null) return null;
      const m = vagter.find((v) => v.id === id);
      return m ? { id: m.id, name: m.name, initials: m.initials } : null;
    }
    if (night.vagt_member_id === null) return null;
    return {
      id: night.vagt_member_id,
      name: night.assigned_member_name ?? "",
      initials: night.assigned_member_initials ?? "",
    };
  }

  const missingCount = nights.filter((n) => effectiveVagt(n) === null).length;
  const awaitingConfirmCount = nights.filter(
    (n) => n.vagt_member_id !== null && !n.vagt_confirmed,
  ).length;
  const hasPendingChanges = Object.keys(pendingChanges).length > 0;

  // For vagter: which nights are newer than their last review?
  const myReview = user
    ? reviews.find((r) => r.member_id === user.id)
    : undefined;
  const hasUnreviewedNights =
    !!user &&
    nights.some((n) => !myReview || n.created_at > myReview.reviewed_at);

  const filteredNights = nights
    .filter((n) => n.name.toLowerCase().includes(search.toLowerCase()))
    .filter((n) => !filterMissingVagt || effectiveVagt(n) === null)
    .filter(
      (n) =>
        !filterUnreviewed || !myReview || n.created_at > myReview.reviewed_at,
    )
    .sort((a, b) => a.date.localeCompare(b.date));

  const filteredVagter = vagter.filter((m) =>
    m.name.toLowerCase().includes(memberSearch.toLowerCase()),
  );

  function showDragError(msg: string) {
    if (dragErrorTimer.current) clearTimeout(dragErrorTimer.current);
    toast.error(msg);
  }

  function handleDrop(nightId: number) {
    if (draggingMemberId === null) return;
    const night = nights.find((n) => n.id === nightId);
    if (!night) return;

    // Block if member opted out
    const optedOut = night.opted_out_members.find(
      (o) => o.id === draggingMemberId,
    );
    if (optedOut) {
      showDragError(`${optedOut.name} har meldt fra denne aften`);
      setDraggingMemberId(null);
      setDragOverNightId(null);
      return;
    }

    const current = effectiveVagt(night);
    if (current && current.id !== draggingMemberId) {
      setConfirmDialog({ nightId, newMemberId: draggingMemberId });
    } else {
      setPendingChanges((prev) => ({ ...prev, [nightId]: draggingMemberId }));
    }
    setDraggingMemberId(null);
    setDragOverNightId(null);
  }

  function removeVagt(nightId: number) {
    setPendingChanges((prev) => ({ ...prev, [nightId]: null }));
  }

  function handleAssignFromModal(nightId: number, memberId: number) {
    const night = nights.find((n) => n.id === nightId);
    if (!night) return;
    const current = effectiveVagt(night);
    setAssignModalNightId(null);
    setAssignModalSearch("");
    if (current && current.id !== memberId) {
      setConfirmDialog({ nightId, newMemberId: memberId });
    } else {
      setPendingChanges((prev) => ({ ...prev, [nightId]: memberId }));
    }
  }

  async function saveChanges() {
    setSaving(true);
    try {
      await Promise.all(
        Object.entries(pendingChanges).map(([nightId, memberId]) =>
          patchClubNight(Number(nightId), { vagt_member_id: memberId }),
        ),
      );
      const updated = await getClubNights();
      setNights(updated);
      setPendingChanges({});
      toast.success("Vagtplanen er gemt");
    } catch (err) {
      console.error(err);
      toast.error("Noget gik galt. Prøv igen.");
    } finally {
      setSaving(false);
    }
  }

  async function submitReview() {
    setSubmittingReview(true);
    try {
      const { reviewed_at } = await postScheduleReview();
      const updatedNights = await getClubNights();
      setNights(updatedNights);
      if (isAdmin) {
        const updatedReviews = await getScheduleReviews();
        setReviews(updatedReviews);
      } else if (user) {
        setReviews((prev) => {
          const existing = prev.find((r) => r.member_id === user.id);
          if (existing) {
            return prev.map((r) =>
              r.member_id === user.id ? { ...r, reviewed_at } : r,
            );
          }
          return [
            ...prev,
            {
              id: Date.now(),
              member_id: user.id,
              reviewed_at,
              member_name: user.name,
              member_initials: user.initials,
            },
          ];
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSubmittingReview(false);
    }
  }

  async function toggleOptOut(nightId: number, currentlyOptedOut: boolean) {
    try {
      if (currentlyOptedOut) {
        await deleteClubNightOptOut(nightId);
      } else {
        await postClubNightOptOut(nightId);
      }
      const updated = await getClubNights();
      setNights(updated);
    } catch (err) {
      console.error(err);
    }
  }

  return (
    <main className="bg-neutral-100 min-h-[calc(100vh-3.5rem)] p-4 sm:p-8 flex flex-col gap-6 sm:gap-8">
      {isAdmin && showAddModal && (
        <ClubNightModal
          nextNumber={
            nights.length > 0
              ? Math.max(...nights.map((n) => n.number)) + 1
              : 51
          }
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
            }
            setShowAddModal(false);
          }}
        />
      )}

      {/* Replace-vagt confirmation dialog */}
      {confirmDialog &&
        (() => {
          const night = nights.find((n) => n.id === confirmDialog.nightId);
          const current = night ? effectiveVagt(night) : null;
          const newMember = vagter.find(
            (v) => v.id === confirmDialog.newMemberId,
          );
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
              <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-6 flex flex-col gap-4">
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
                  <Button
                    variant="outline"
                    onClick={() => setConfirmDialog(null)}
                  >
                    Annuller
                  </Button>
                  <Button
                    className="bg-[#E63946] hover:bg-red-600 text-white"
                    onClick={() => {
                      setPendingChanges((prev) => ({
                        ...prev,
                        [confirmDialog.nightId]: confirmDialog.newMemberId,
                      }));
                      setConfirmDialog(null);
                    }}
                  >
                    Erstat
                  </Button>
                </div>
              </div>
            </div>
          );
        })()}

      {/* Delete night confirmation dialog */}
      {deleteConfirmId !== null &&
        (() => {
          const night = nights.find((n) => n.id === deleteConfirmId);
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
              <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-6 flex flex-col gap-4">
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
                    className="bg-[#E63946] hover:bg-red-600 text-white"
                    onClick={async () => {
                      try {
                        await deleteClubNight(deleteConfirmId);
                        setNights((prev) =>
                          prev.filter((n) => n.id !== deleteConfirmId),
                        );
                        setPendingChanges((prev) => {
                          const next = { ...prev };
                          delete next[deleteConfirmId];
                          return next;
                        });
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
              </div>
            </div>
          );
        })()}

      <MemberHero>
        <div className="flex flex-col items-center">
          <span className="font-bold text-[#F4A261] text-2xl leading-8">
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
              <span className="font-bold text-[#E63946] text-2xl leading-8">
                {missingCount}
              </span>
              <span className="text-white/60 text-xs leading-4">
                Vagter at tildele
              </span>
            </div>
            <div className="hidden sm:block bg-white/20 w-px h-10" />
            <div className="flex flex-col items-center">
              <span className="font-bold text-[#F4A261] text-2xl leading-8">
                {awaitingConfirmCount}
              </span>
              <span className="text-white/60 text-xs leading-4">
                Afventer bekræftelse
              </span>
            </div>
            <div className="hidden sm:block bg-white/20 w-px h-10" />
            <div className="flex flex-col items-center">
              <span className="font-bold text-[#2A9D8F] text-2xl leading-8">
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
                  className="bg-[#E63946] text-white gap-2"
                  onClick={() => setShowAddModal(true)}
                >
                  <Plus className="size-4" />
                  Tilføj klubaften
                </Button>
              )}
            </div>

            {/* Save/discard pending changes — own row so it never competes with the title */}
            {isAdmin && hasPendingChanges && (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setPendingChanges({})}
                  disabled={saving}
                >
                  Fortryd
                </Button>
                <Button
                  className="bg-[#2A9D8F] hover:bg-teal-700 text-white gap-2"
                  onClick={saveChanges}
                  disabled={saving}
                >
                  <Check className="size-4" />
                  {saving
                    ? "Gemmer…"
                    : `Gem ${Object.keys(pendingChanges).length} ændring${Object.keys(pendingChanges).length !== 1 ? "er" : ""}`}
                </Button>
              </div>
            )}

            <div className="relative">
              <Search className="size-4 top-1/2 -translate-y-1/2 text-neutral-500 absolute left-3" />
              <Input
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
                    ? "bg-[#F4A261] border-[#F4A261] text-white"
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
                      ? "bg-[#E63946] border-[#E63946] text-white"
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
            {hasUnreviewedNights && (
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-lg border border-[#F4A261]/40 bg-[#F4A261]/10 p-3">
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
                  className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F4A261] text-white text-xs font-semibold hover:bg-orange-400 transition-colors cursor-pointer border-none disabled:opacity-60 w-full sm:w-auto justify-center"
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
              {filteredNights.length === 0 && (
                <p className="text-sm text-neutral-400 py-6 text-center">
                  Ingen klubaftener fundet
                </p>
              )}
              {filteredNights.map((night) => {
                const d = new Date(night.date);
                const vagt = effectiveVagt(night);
                const hasVagt = vagt !== null;
                const isPending = night.id in pendingChanges;
                const isOver = dragOverNightId === night.id;
                const myOptOut =
                  user !== null &&
                  night.opted_out_members.some((o) => o.id === user.id);

                return (
                  <div
                    key={night.id}
                    {...(isAdmin
                      ? {
                          onDragOver: (e: React.DragEvent) => {
                            e.preventDefault();
                            setDragOverNightId(night.id);
                          },
                          onDragLeave: () => setDragOverNightId(null),
                          onDrop: () => handleDrop(night.id),
                        }
                      : {})}
                    className={`rounded-lg flex flex-col p-4 gap-3 border transition-colors ${
                      isOver
                        ? "border-[#2A9D8F] bg-[#2A9D8F]/5"
                        : isPending
                          ? "border-[#F4A261]/60 bg-[#F4A261]/5"
                          : hasVagt
                            ? "border-neutral-200 bg-white"
                            : "border-[#E63946]/40 bg-[#E63946]/5"
                    }`}
                  >
                    {/* Top row: date badge + info + assignment badge */}
                    <div className="flex items-center gap-4">
                      <div
                        className={`shrink-0 rounded-lg text-white flex flex-col justify-center items-center w-14 h-14 ${
                          hasVagt ? "bg-[#2A9D8F]" : "bg-[#E63946]"
                        }`}
                      >
                        <span className="font-medium uppercase text-[10px]">
                          {d.toLocaleDateString("da-DK", { weekday: "short" })}
                        </span>
                        <span className="font-bold text-lg leading-5">
                          {d.getDate()}
                        </span>
                        <span className="font-medium uppercase text-[10px] opacity-80">
                          {d.toLocaleDateString("da-DK", { month: "short" })}
                        </span>
                      </div>
                      <div className="flex flex-col flex-1 gap-1 min-w-0">
                        <span className="font-semibold text-sm leading-5 truncate">
                          {night.name}
                        </span>
                        <div className="text-neutral-500 text-xs leading-4 flex items-center gap-3">
                          <span className="flex items-center gap-1">
                            <Clock className="size-3" />
                            {night.time_from}
                          </span>
                          <span className="flex items-center gap-1">
                            <MapPin className="size-3" />
                            {night.location}
                          </span>
                        </div>
                        <div className="flex mt-1 items-center gap-2 flex-wrap">
                          {hasVagt ? (
                            <>
                              <div
                                onClick={() =>
                                  isAdmin && setAssignModalNightId(night.id)
                                }
                                className={`rounded-full flex pl-1 pr-2 py-1 items-center gap-1 border ${
                                  isPending
                                    ? "bg-[#F4A261]/10 border-[#F4A261]/40"
                                    : "bg-white border-neutral-200"
                                } ${isAdmin ? "cursor-pointer hover:border-neutral-400" : ""}`}
                              >
                                <div className="w-6 h-6 rounded-full bg-[#E63946] text-white flex items-center justify-center text-[0.55rem] font-bold select-none shrink-0">
                                  {vagt.initials}
                                </div>
                                <span className="text-xs leading-4">
                                  {vagt.name}
                                </span>
                                {isAdmin && (
                                  <button
                                    onClick={() => removeVagt(night.id)}
                                    className="cursor-pointer text-neutral-400 border-none bg-transparent p-0 hover:text-neutral-700 transition-colors"
                                  >
                                    <X className="size-3" />
                                  </button>
                                )}
                              </div>
                              {/* Confirmation status badge (saved assignments only) */}
                              {!isPending &&
                                (night.vagt_confirmed ? (
                                  <span className="flex items-center gap-1 text-[10px] font-medium text-[#2A9D8F] bg-[#2A9D8F]/10 rounded-full px-2 py-0.5">
                                    <Check className="size-3" />
                                    Bekræftet
                                  </span>
                                ) : (
                                  <span className="flex items-center gap-1 text-[10px] font-medium text-[#F4A261] bg-[#F4A261]/10 rounded-full px-2 py-0.5">
                                    Afventer
                                  </span>
                                ))}
                            </>
                          ) : isAdmin ? (
                            <button
                              onClick={() => setAssignModalNightId(night.id)}
                              className={`rounded-lg sm:rounded-full border flex px-2.5 py-1.5 sm:py-1 items-center gap-1.5 transition-colors ${
                                isOver
                                  ? "border-[#2A9D8F] bg-[#2A9D8F]/10 text-[#2A9D8F]"
                                  : "border-[#E63946]/40 bg-[#E63946] sm:bg-[#E63946]/10 text-white sm:text-[#E63946] hover:bg-[#E63946]/20 sm:hover:bg-[#E63946]/20 sm:hover:border-[#E63946]/60"
                              }`}
                            >
                              <UserPlus className="size-3.5 sm:size-3 shrink-0" />
                              <span className="text-xs leading-4 font-medium">
                                {isOver ? "Slip for at tildele" : "Tildel vagt"}
                              </span>
                              <ChevronDown className="size-3 shrink-0 sm:hidden" />
                            </button>
                          ) : (
                            <div className="rounded-full border border-dashed flex px-2 py-1 items-center gap-1 border-[#E63946]/30 bg-[#E63946]/10">
                              <UserPlus className="size-3 text-[#E63946]" />
                              <span className="text-xs leading-4 text-[#E63946]">
                                Ingen vagt tildelt
                              </span>
                            </div>
                          )}
                          {isPending && (
                            <span className="text-[10px] text-[#F4A261] font-medium">
                              Ikke gemt
                            </span>
                          )}
                        </div>
                      </div>
                      {isAdmin && (
                        <button
                          onClick={() => setDeleteConfirmId(night.id)}
                          className="shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-md border-none bg-transparent text-neutral-400 hover:text-[#E63946] hover:bg-[#E63946]/10 transition-colors cursor-pointer"
                          title="Slet klubaften"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Bottom row: opt-outs + opt-out button */}
                    {(night.opted_out_members.length > 0 || !!user) && (
                      <div className="flex items-center gap-2 flex-wrap border-t border-neutral-100 pt-2">
                        {night.opted_out_members.length > 0 && (
                          <>
                            <span className="text-[10px] text-neutral-400 font-medium uppercase tracking-wide">
                              Meldt fra:
                            </span>
                            {night.opted_out_members.map((o) => (
                              <div
                                key={o.id}
                                title={o.name}
                                className="rounded-full flex pl-1 pr-2 py-0.5 items-center gap-1 border bg-neutral-50 border-neutral-200"
                              >
                                <div className="w-5 h-5 rounded-full bg-neutral-400 text-white flex items-center justify-center text-[0.5rem] font-bold select-none shrink-0">
                                  {o.initials}
                                </div>
                                <span className="text-[10px] text-neutral-500">
                                  {o.name}
                                </span>
                              </div>
                            ))}
                          </>
                        )}
                        {user && night.vagt_member_id !== user.id && (
                          <button
                            onClick={() => toggleOptOut(night.id, myOptOut)}
                            className={`ml-auto flex items-center gap-1 text-[10px] font-medium rounded-full px-2 py-0.5 border cursor-pointer transition-colors ${
                              myOptOut
                                ? "bg-neutral-100 border-neutral-300 text-neutral-600 hover:bg-neutral-200"
                                : "bg-[#E63946]/10 border-[#E63946]/30 text-[#E63946] hover:bg-[#E63946]/20"
                            }`}
                          >
                            <UserMinus className="size-3" />
                            {myOptOut ? "Annuller framelding" : "Meld fra"}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Draggable people panel + review panel — admins only */}
        {isAdmin && (
          <div className="col-span-1 flex flex-col gap-6 min-h-0">
            {/* Vagter drag panel — desktop only */}
            <Card className="border-l-4 border-l-[#E63946] p-6 gap-4 hidden md:flex flex-col flex-1 min-h-0">
              <CardHeader className="p-0 gap-2 flex flex-col">
                <div className="flex items-center gap-2">
                  <Users className="size-5 text-[#E63946]" />
                  <CardTitle className="text-base leading-6">Vagter</CardTitle>
                  <Badge variant="secondary" className="text-xs">
                    {vagter.length}
                  </Badge>
                </div>
                <p className="text-xs text-neutral-500">
                  Træk en person til en klubaften for at tildele
                </p>
              </CardHeader>
              <CardContent className="flex p-0 flex-col gap-2 flex-1 min-h-0">
                <div className="relative">
                  <Search className="size-4 top-1/2 -translate-y-1/2 text-neutral-500 absolute left-3" />
                  <Input
                    placeholder="Søg vagt…"
                    className="pl-9 h-9"
                    value={memberSearch}
                    onChange={(e) => setMemberSearch(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1 overflow-y-auto flex-1 min-h-0">
                  {filteredVagter.map((m) => (
                    <div
                      key={m.id}
                      draggable
                      onDragStart={() => setDraggingMemberId(m.id)}
                      onDragEnd={() => {
                        setDraggingMemberId(null);
                        setDragOverNightId(null);
                      }}
                      className={`select-none cursor-grab active:cursor-grabbing rounded-md flex p-2 items-center gap-3 border transition-colors ${
                        draggingMemberId === m.id
                          ? "opacity-50 border-neutral-200 bg-neutral-50"
                          : "border-transparent hover:bg-neutral-50 hover:border-neutral-200"
                      }`}
                    >
                      <GripVertical className="hidden sm:block size-4 text-neutral-300 shrink-0" />
                      <div className="w-9 h-9 rounded-full bg-[#E63946] text-white flex items-center justify-center text-[0.65rem] font-bold select-none shrink-0">
                        {m.initials}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="truncate text-sm font-medium leading-5">
                          {m.name}
                        </span>
                        <span className="text-[10px] text-neutral-400">
                          Vagt
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Review status panel — admins, all screens */}
            <Card className="p-6 gap-4 flex flex-col">
              <CardHeader className="p-0 gap-1 flex flex-col">
                <div className="flex items-center gap-2">
                  <UserCheck className="size-5 text-[#2A9D8F]" />
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
                      <div className="w-7 h-7 rounded-full bg-[#E63946] text-white flex items-center justify-center text-[0.55rem] font-bold select-none shrink-0">
                        {m.initials}
                      </div>
                      <span className="text-xs font-medium text-neutral-800 flex-1 truncate">
                        {m.name}
                      </span>
                      {hasUnreviewed ? (
                        <span className="text-[10px] text-[#E63946] font-medium whitespace-nowrap">
                          Ikke gennemgået
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[10px] text-[#2A9D8F] font-medium whitespace-nowrap">
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

      {/* Mobile assign-vagt bottom sheet (admin only) */}
      {isAdmin &&
        assignModalNightId !== null &&
        (() => {
          const night = nights.find((n) => n.id === assignModalNightId);
          const currentVagt = night ? effectiveVagt(night) : null;
          const query = assignModalSearch.toLowerCase();
          const filtered = vagter.filter((m) =>
            m.name.toLowerCase().includes(query),
          );
          return (
            <>
              {/* Backdrop */}
              <div
                className="fixed inset-0 z-40 bg-black/40"
                onClick={() => {
                  setAssignModalNightId(null);
                  setAssignModalSearch("");
                }}
              />
              {/* Sheet */}
              <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl shadow-2xl flex flex-col max-h-[75vh]">
                {/* Handle */}
                <div className="flex justify-center pt-3 pb-1 shrink-0">
                  <div className="w-10 h-1 rounded-full bg-neutral-200" />
                </div>
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100 shrink-0">
                  <div className="flex flex-col">
                    <span className="font-semibold text-sm text-neutral-900">
                      Tildel vagt
                    </span>
                    {night && (
                      <span className="text-xs text-neutral-500 truncate">
                        {night.name}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      setAssignModalNightId(null);
                      setAssignModalSearch("");
                    }}
                    className="w-8 h-8 flex items-center justify-center rounded-full bg-neutral-100 text-neutral-500 hover:bg-neutral-200 transition-colors"
                  >
                    <X className="size-4" />
                  </button>
                </div>
                {/* Search */}
                <div className="px-4 py-2 shrink-0">
                  <div className="relative">
                    <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
                    <input
                      autoFocus
                      placeholder="Søg vagt…"
                      value={assignModalSearch}
                      onChange={(e) => setAssignModalSearch(e.target.value)}
                      className="w-full h-9 pl-9 pr-3 text-sm rounded-lg border border-neutral-200 outline-none bg-white placeholder:text-neutral-400 focus:border-neutral-400 font-[inherit]"
                    />
                  </div>
                </div>
                {/* List */}
                <div className="flex flex-col overflow-y-auto px-2 pb-4 gap-1">
                  {/* Remove option */}
                  {currentVagt && (
                    <button
                      onClick={() => {
                        removeVagt(assignModalNightId);
                        setAssignModalNightId(null);
                        setAssignModalSearch("");
                      }}
                      className="flex items-center gap-3 px-3 py-3 rounded-xl text-left hover:bg-red-50 transition-colors"
                    >
                      <div className="w-10 h-10 rounded-full bg-[#E63946]/10 text-[#E63946] flex items-center justify-center shrink-0">
                        <UserMinus className="size-4" />
                      </div>
                      <span className="text-sm font-medium text-[#E63946]">
                        Fjern vagt
                      </span>
                    </button>
                  )}
                  {filtered.length === 0 && (
                    <p className="text-sm text-neutral-400 text-center py-4">
                      Ingen vagter fundet
                    </p>
                  )}
                  {filtered.map((m) => {
                    const isCurrent = currentVagt?.id === m.id;
                    return (
                      <button
                        key={m.id}
                        onClick={() =>
                          handleAssignFromModal(assignModalNightId, m.id)
                        }
                        className={`flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-colors ${
                          isCurrent ? "bg-[#2A9D8F]/10" : "hover:bg-neutral-50"
                        }`}
                      >
                        <div className="w-10 h-10 rounded-full bg-[#E63946] text-white flex items-center justify-center text-xs font-bold shrink-0">
                          {m.initials}
                        </div>
                        <div className="flex flex-col flex-1 min-w-0">
                          <span className="text-sm font-medium text-neutral-900 truncate">
                            {m.name}
                          </span>
                          <span className="text-xs text-neutral-400">Vagt</span>
                        </div>
                        {isCurrent && (
                          <Check className="size-4 text-[#2A9D8F] shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          );
        })()}
    </main>
  );
}
