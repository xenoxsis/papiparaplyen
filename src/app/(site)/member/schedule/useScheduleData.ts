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

export function useScheduleData(isAdmin: boolean) {
  const { user } = useAuth();

  const [nights, setNights] = useState<ApiClubNight[]>([]);
  const [vagter, setVagter] = useState<ApiMember[]>([]);
  const [reviews, setReviews] = useState<ApiScheduleReview[]>([]);
  const [pendingSwapMsgs, setPendingSwapMsgs] = useState<ApiMessage[]>([]);
  const [submittingReview, setSubmittingReview] = useState(false);

  useEffect(() => {
    getClubNights().then(setNights).catch(console.error);
    getMembers()
      .then((ms) =>
        setVagter(ms.filter((m) => m.roles.includes("Vagt") && !m.banned)),
      )
      .catch(console.error);
    getMessages(2)
      .then((msgs) =>
        setPendingSwapMsgs(
          msgs.filter(
            (m) => m.type === "shift_swap" && m.swap_status === "pending",
          ),
        ),
      )
      .catch(console.error);
    if (isAdmin) {
      getScheduleReviews().then(setReviews).catch(console.error);
    } else if (user?.roles.includes("Vagt")) {
      getMyScheduleReview()
        .then((r) => {
          if (r) setReviews([r]);
        })
        .catch(console.error);
    }
  }, [isAdmin, user]);

  // For vagter: which nights are newer than their last review?
  const myReview = user
    ? reviews.find((r) => r.member_id === user.id)
    : undefined;
  const hasUnreviewedNights =
    !!user &&
    nights.some((n) => !myReview || n.created_at > myReview.reviewed_at);

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

  async function reloadNights() {
    const updated = await getClubNights();
    setNights(updated);
    return updated;
  }

  return {
    nights,
    setNights,
    vagter,
    reviews,
    pendingSwapMsgs,
    submittingReview,
    myReview,
    hasUnreviewedNights,
    submitReview,
    reloadNights,
  };
}
