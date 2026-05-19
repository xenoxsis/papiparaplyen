"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  getClubNights,
  patchClubNight,
  type ApiClubNight,
  type ApiMember,
} from "@/lib/api";
import { autoAssign } from "@/lib/auto-assign";

export type PendingChanges = Record<number, number | null>;

export function useVagtDraft(
  nights: ApiClubNight[],
  setNights: React.Dispatch<React.SetStateAction<ApiClubNight[]>>,
  vagter: ApiMember[],
  isAdmin: boolean,
) {
  const [pendingChanges, setPendingChanges] = useState<PendingChanges>({});
  const [autoAssignedIds, setAutoAssignedIds] = useState<Set<number>>(
    new Set(),
  );
  const [problemNightIds, setProblemNightIds] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [draggingMemberId, setDraggingMemberId] = useState<number | null>(null);
  const [dragOverNightId, setDragOverNightId] = useState<number | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    nightId: number;
    newMemberId: number;
  } | null>(null);
  const dragErrorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasPendingChanges = Object.keys(pendingChanges).length > 0;

  // Warn before leaving with unsaved changes (admin only).
  useEffect(() => {
    if (!isAdmin || !hasPendingChanges) return;

    function handleBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
    }

    function handleClick(e: MouseEvent) {
      const anchor = (e.target as HTMLElement).closest("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("http")) return;
      if (
        !window.confirm(
          "Du har ugemte ændringer. Vil du forlade siden uden at gemme?",
        )
      ) {
        e.preventDefault();
        e.stopPropagation();
      }
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("click", handleClick, true);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("click", handleClick, true);
    };
  }, [isAdmin, hasPendingChanges]);

  const effectiveVagt = useCallback(
    (
      night: ApiClubNight,
    ): { id: number; name: string; initials: string } | null => {
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
    },
    [pendingChanges, vagter],
  );

  function showDragError(msg: string) {
    if (dragErrorTimer.current) clearTimeout(dragErrorTimer.current);
    toast.error(msg);
  }

  function handleDrop(nightId: number) {
    if (draggingMemberId === null) return;
    const night = nights.find((n) => n.id === nightId);
    if (!night) return;

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

  /**
   * Move the effective member from one club night to another. Used by the
   * calendar's cell-to-cell drag. If the target already has someone, the
   * normal replace-confirmation dialog kicks in (memorising the source so the
   * source is cleared once the user confirms).
   */
  function handleReassignDrop(fromNightId: number, toNightId: number) {
    if (fromNightId === toNightId) return;
    const fromNight = nights.find((n) => n.id === fromNightId);
    const toNight = nights.find((n) => n.id === toNightId);
    if (!fromNight || !toNight) return;

    const movingMember = effectiveVagt(fromNight);
    if (!movingMember) return;

    const optedOut = toNight.opted_out_members.find(
      (o) => o.id === movingMember.id,
    );
    if (optedOut) {
      showDragError(`${optedOut.name} har meldt fra denne aften`);
      return;
    }

    const targetCurrent = effectiveVagt(toNight);
    if (targetCurrent && targetCurrent.id !== movingMember.id) {
      // Pre-clear the source so confirming the replace also empties it.
      setPendingChanges((prev) => ({ ...prev, [fromNightId]: null }));
      setConfirmDialog({ nightId: toNightId, newMemberId: movingMember.id });
      return;
    }

    setPendingChanges((prev) => ({
      ...prev,
      [fromNightId]: null,
      [toNightId]: movingMember.id,
    }));
  }

  function handleAssignFromModal(nightId: number, memberId: number) {
    const night = nights.find((n) => n.id === nightId);
    if (!night) return;
    const current = effectiveVagt(night);
    if (current && current.id !== memberId) {
      setConfirmDialog({ nightId, newMemberId: memberId });
    } else {
      setPendingChanges((prev) => ({ ...prev, [nightId]: memberId }));
    }
  }

  function confirmReplace() {
    if (!confirmDialog) return;
    setPendingChanges((prev) => ({
      ...prev,
      [confirmDialog.nightId]: confirmDialog.newMemberId,
    }));
    setConfirmDialog(null);
  }

  function cancelConfirm() {
    setConfirmDialog(null);
  }

  function handleAutoAssign() {
    const result = autoAssign(nights, vagter, pendingChanges);
    const count = Object.keys(result.assignments).length;
    if (count === 0 && result.problemNightIds.length === 0) {
      toast.info("Ingen fremtidige vagter mangler tildeling.");
      return;
    }
    setPendingChanges((prev) => ({ ...prev, ...result.assignments }));
    setAutoAssignedIds(
      (prev) =>
        new Set([...prev, ...Object.keys(result.assignments).map(Number)]),
    );
    setProblemNightIds(result.problemNightIds);
    if (count > 0 && result.problemNightIds.length > 0) {
      toast.warning(
        `${count} vagt${count !== 1 ? "er" : ""} tildelt automatisk. ${result.problemNightIds.length} aften${result.problemNightIds.length !== 1 ? "er" : ""} kunne ikke tildeles.`,
      );
    } else if (count > 0) {
      toast.success(
        `${count} vagt${count !== 1 ? "er" : ""} tildelt automatisk. Husk at gemme.`,
      );
    } else {
      toast.warning(
        `${result.problemNightIds.length} aften${result.problemNightIds.length !== 1 ? "er" : ""} uden mulig kandidat.`,
      );
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
      setAutoAssignedIds(new Set());
      setProblemNightIds([]);
      toast.success("Vagtplanen er gemt");
    } catch (err) {
      console.error(err);
      toast.error("Noget gik galt. Prøv igen.");
    } finally {
      setSaving(false);
    }
  }

  function discard() {
    setPendingChanges({});
    setAutoAssignedIds(new Set());
    setProblemNightIds([]);
  }

  function deletePending(nightId: number) {
    setPendingChanges((prev) => {
      const next = { ...prev };
      delete next[nightId];
      return next;
    });
  }

  return {
    pendingChanges,
    autoAssignedIds,
    problemNightIds,
    saving,
    hasPendingChanges,
    draggingMemberId,
    setDraggingMemberId,
    dragOverNightId,
    setDragOverNightId,
    confirmDialog,
    effectiveVagt,
    handleDrop,
    handleReassignDrop,
    removeVagt,
    handleAssignFromModal,
    confirmReplace,
    cancelConfirm,
    handleAutoAssign,
    saveChanges,
    discard,
    deletePending,
  };
}
