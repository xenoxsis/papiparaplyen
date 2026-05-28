"use client";

import { useEffect, useState } from "react";
import {
  getClubNights,
  getMembers,
  getMessages,
  getMyScheduleReview,
  getScheduleReviews,
  postScheduleReview,
  type ApiClubNight,
  type ApiMember,
  type ApiMessage,
  type ApiScheduleReview,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useUserSSE } from "@/lib/UserSSEContext";

export function useScheduleData(isAdmin: boolean) {
  const { user } = useAuth();

  const [nights, setNights] = useState<ApiClubNight[]>([]);
  const [vagter, setVagter] = useState<ApiMember[]>([]);
  const [reviews, setReviews] = useState<ApiScheduleReview[]>([]);
  const [pendingSwapMsgs, setPendingSwapMsgs] = useState<ApiMessage[]>([]);
  const [submittingReview, setSubmittingReview] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const promises: Promise<unknown>[] = [
      getClubNights().then(setNights).catch(console.error),
      getMembers()
        .then((ms) =>
          setVagter(ms.filter((m) => m.roles.includes("Vagt") && !m.banned)),
        )
        .catch(console.error),
      getMessages(2)
        .then((msgs) =>
          setPendingSwapMsgs(
            msgs.filter(
              (m) => m.type === "shift_swap" && m.swap_status === "pending",
            ),
          ),
        )
        .catch(console.error),
    ];
    if (isAdmin) {
      promises.push(getScheduleReviews().then(setReviews).catch(console.error));
    } else if (user?.roles.includes("Vagt")) {
      promises.push(
        getMyScheduleReview()
          .then((r) => {
            if (r) setReviews([r]);
          })
          .catch(console.error),
      );
    }
    Promise.all(promises).finally(() => setLoading(false));
  }, [isAdmin, user]);

  // For vagter: which nights are newer than their last review?
  const myReview = user
    ? reviews.find((r) => r.member_id === user.id)
    : undefined;
  const hasUnreviewedNights =
    !!user &&
    !loading &&
    nights.some(
      (n) => !myReview || n.created_at > (myReview.reviewed_at ?? ""),
    );

  async function submitReview() {
    setSubmittingReview(true);
    try {
      const { reviewed_at } = await postScheduleReview();
      // Optimistic: no night data changes on review submission,
      // only the review record itself updates. Skip full getClubNights() refetch.
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
              is_virtual: false,
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

  async function reloadNights() {
    const updated = await getClubNights();
    setNights(updated);
    return updated;
  }

  // Real-time updates via SSE
  useUserSSE((evt) => {
    if (evt.event !== "schedule_updated") return;
    const d = evt.data;
    if (d.type === "night_confirmed") {
      const night = d.night;
      setNights((prev) => prev.map((n) => (n.id === night.id ? night : n)));
    } else if (d.type === "drafts_published") {
      // For admins: update existing night entries to published status.
      // For non-admins (Vagter): these nights are new to them — add them.
      const published: ApiClubNight[] = d.nights;
      setNights((prev) => {
        const existingIds = new Set(prev.map((n) => n.id));
        const updated = prev.map((n) => {
          const match = published.find((p) => p.id === n.id);
          return match ? match : n;
        });
        const brand_new = published.filter((p) => !existingIds.has(p.id));
        return [...updated, ...brand_new].sort((a, b) =>
          a.date.localeCompare(b.date),
        );
      });
    } else if (d.type === "review_submitted") {
      const { memberId, memberName, memberInitials, reviewedAt } = d;
      setReviews((prev) => {
        const exists = prev.some((r) => r.member_id === memberId);
        if (exists) {
          return prev.map((r) =>
            r.member_id === memberId ? { ...r, reviewed_at: reviewedAt } : r,
          );
        }
        return [
          ...prev,
          {
            id: null,
            member_id: memberId,
            reviewed_at: reviewedAt,
            member_name: memberName,
            member_initials: memberInitials,
            is_virtual: false,
          },
        ];
      });
    }
  });

  return {
    nights,
    setNights,
    vagter,
    setVagter,
    reviews,
    pendingSwapMsgs,
    submittingReview,
    loading,
    myReview,
    hasUnreviewedNights,
    submitReview,
    reloadNights,
  };
}
