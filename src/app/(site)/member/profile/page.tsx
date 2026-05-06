"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  AlarmClock,
  Bell,
  CalendarDays,
  ChevronDown,
  Clock,
  MapPin,
  MessagesSquare,
  RefreshCcw,
  Search,
  Send,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { MemberHero } from "@/components/MemberHero";
import { ClubNightModal } from "@/components/ClubNightModal";
import { useAuth } from "@/lib/auth-context";
import { useRequireAuth } from "@/lib/useRequireAuth";
import {
  getClubNights,
  getChannels,
  getMessages,
  getMemberShifts,
  getMyScheduleReview,
  postClubNight,
  postMessage,
  patchMessage,
  patchClubNight,
  postClubNightConfirm,
  postClubNightOptOut,
  type ApiClubNight,
  type ApiChannel,
  type ApiMessage,
  type ApiScheduleReview,
} from "@/lib/api";

function GroupChatItem({
  active,
  name,
  color,
  badgeLabel,
  badgeColor,
  lastMsg,
  lastTime,
  onClick,
}: {
  active: boolean;
  name: string;
  color: string;
  badgeLabel: string;
  badgeColor: string;
  lastMsg: string;
  lastTime: string;
  onClick: () => void;
}) {
  return (
    <div
      className={`flex p-2 items-center gap-3 rounded-md cursor-pointer transition-colors border-b ${
        color === "red"
          ? `bg-red-50 border-red-100 ${active ? "bg-red-100" : "hover:bg-red-100"}`
          : `bg-teal-50 border-teal-100 ${active ? "bg-teal-100" : "hover:bg-teal-100"}`
      }`}
      onClick={onClick}
    >
      <div
        className={`w-9 h-9 rounded-full text-white flex items-center justify-center shrink-0 ${
          color === "red" ? "bg-[#e63946]" : "bg-[#2a9d8f]"
        }`}
      >
        <Users className="size-4" />
      </div>
      <div className="flex flex-col flex-1 min-w-0">
        <div className="flex justify-between items-center">
          <span
            className={`text-sm text-neutral-900 truncate ${active ? "font-semibold" : "font-medium"}`}
          >
            {name}
          </span>
          <span className="text-neutral-500 text-[0.625rem] shrink-0 pl-1">
            {lastTime}
          </span>
        </div>
        <span className="text-neutral-500 text-xs truncate">{lastMsg}</span>
      </div>
      <span
        className={`text-[0.6rem] font-semibold uppercase tracking-wider rounded-full px-1.5 py-0.5 whitespace-nowrap shrink-0 ${
          badgeColor === "red"
            ? "text-[#e63946] bg-red-100"
            : "text-[#2a9d8f] bg-teal-100"
        }`}
      >
        {badgeLabel}
      </span>
    </div>
  );
}

export default function ProfilePage() {
  useRequireAuth();
  const { user, setPendingShiftCount } = useAuth();
  const [activeChannelId, setActiveChannelId] = useState<number>(1);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAllShifts, setShowAllShifts] = useState(false);
  const [shifts, setShifts] = useState<ApiClubNight[]>([]);
  const [nights, setNights] = useState<ApiClubNight[]>([]);
  const [channels, setChannels] = useState<ApiChannel[]>([]);
  const [messages, setMessages] = useState<ApiMessage[]>([]);
  const [allMessages, setAllMessages] = useState<ApiMessage[]>([]);
  const [msgBody, setMsgBody] = useState("");
  const [channelSearch, setChannelSearch] = useState("");
  const [showChannelSearch, setShowChannelSearch] = useState(false);
  const [showChannelDrawer, setShowChannelDrawer] = useState(false);
  const [myReview, setMyReview] = useState<ApiScheduleReview | null>(null);
  // Swap state
  const [showSwapModal, setShowSwapModal] = useState(false);
  const [swapTargetShift, setSwapTargetShift] = useState<ApiClubNight | null>(
    null,
  );
  const [swapModalMessage, setSwapModalMessage] = useState("");
  const [swapConfirmMsg, setSwapConfirmMsg] = useState<ApiMessage | null>(null);
  const channelSearchRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const scrollOnNextRender = useRef(false);
  const pendingScrollMsgId = useRef<number | null>(null);
  const [isScrolledUp, setIsScrolledUp] = useState(false);
  const [highlightMessageId, setHighlightMessageId] = useState<number | null>(
    null,
  );

  useEffect(() => {
    getClubNights().then(setNights).catch(console.error);
    getMyScheduleReview().then(setMyReview).catch(console.error);
    getChannels()
      .then(async (chs) => {
        setChannels(chs);
        const all = await Promise.all(chs.map((c) => getMessages(c.id)));
        setAllMessages(all.flat());
      })
      .catch(console.error);
    if (user) {
      getMemberShifts(user.id).then(setShifts).catch(console.error);
    }
  }, [user]);

  useEffect(() => {
    getMessages(activeChannelId)
      .then((msgs) => {
        scrollOnNextRender.current = true;
        setMessages(msgs);
      })
      .catch(console.error);
    const id = setInterval(() => {
      getMessages(activeChannelId).then(setMessages).catch(console.error);
    }, 3000);
    return () => clearInterval(id);
  }, [activeChannelId]);

  useEffect(() => {
    if (channels.length === 0) return;
    const id = setInterval(() => {
      Promise.all(channels.map((c) => getMessages(c.id)))
        .then((results) => setAllMessages(results.flat()))
        .catch(console.error);
    }, 15000);
    return () => clearInterval(id);
  }, [channels]);

  // Derived: pending swap the current user has requested
  const pendingSwap = useMemo(() => {
    if (!user) return null;
    const m = allMessages.find(
      (msg) =>
        msg.type === "shift_swap" &&
        msg.swap_status === "pending" &&
        msg.sender_id === user.id,
    );
    if (m && m.shift_night_id !== undefined) {
      return { shiftId: m.shift_night_id, messageId: m.id };
    }
    return null;
  }, [allMessages, user]);

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
        return;
      }
    }
    if (scrollOnNextRender.current) {
      const container = messagesContainerRef.current;
      if (container) {
        container.scrollTop = container.scrollHeight;
      }
      scrollOnNextRender.current = false;
    }
  }, [messages]);

  async function sendMessage() {
    if (!msgBody.trim() || !user) return;
    try {
      const msg = await postMessage(activeChannelId, user.id, msgBody.trim());
      scrollOnNextRender.current = true;
      setMessages((prev) => [...prev, msg]);
      setMsgBody("");
    } catch (err) {
      console.error(err);
    }
  }

  async function requestSwap() {
    if (!user || !swapTargetShift) return;
    try {
      const msg = await postMessage(
        2,
        user.id,
        swapModalMessage.trim() ||
          `Kan nogen tage min vagt til ${swapTargetShift.name}?`,
        { type: "shift_swap", shift_night_id: swapTargetShift.id },
      );
      setAllMessages((prev) => [...prev, msg]);
      setShowSwapModal(false);
      setSwapModalMessage("");
      setSwapTargetShift(null);
      // If already on channel 2, push the message in and scroll
      if (activeChannelId === 2) {
        scrollOnNextRender.current = true;
        setMessages((prev) => [...prev, msg]);
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function cancelSwap() {
    if (!user || !pendingSwap) return;
    try {
      await patchMessage(2, pendingSwap.messageId, {
        body: `Annulleret af ${user.name}`,
        swap_status: "cancelled",
      });
      // Refresh channel 2 messages
      getMessages(2).then((msgs) => {
        setAllMessages((prev) => [
          ...prev.filter((m) => m.channel_id !== 2),
          ...msgs,
        ]);
        if (activeChannelId === 2) setMessages(msgs);
      });
    } catch (err) {
      console.error(err);
    }
  }

  async function confirmTakeSwap() {
    if (!user || !swapConfirmMsg || swapConfirmMsg.shift_night_id === undefined)
      return;
    try {
      // Assign the shift first — this may 409 if the user is opted out
      await patchClubNight(swapConfirmMsg.shift_night_id, {
        vagt_member_id: user.id,
      });
      // Only update the message if the shift assignment succeeded
      await patchMessage(2, swapConfirmMsg.id, {
        swap_status: "taken",
        taken_by_member_id: user.id,
      });
      setSwapConfirmMsg(null);
      // Refresh shifts + channel 2 messages
      getMemberShifts(user.id).then(setShifts).catch(console.error);
      getMessages(2).then((msgs) => {
        setAllMessages((prev) => [
          ...prev.filter((m) => m.channel_id !== 2),
          ...msgs,
        ]);
        if (activeChannelId === 2) setMessages(msgs);
      });
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Noget gik galt. Prøv igen.";
      toast.error(msg);
    }
  }

  const nextShift = shifts[0] ?? null;
  const activeChannel = channels.find((c) => c.id === activeChannelId);

  // Nights assigned to me but not yet confirmed (visible only to the assigned vagt)
  const today = new Date().toISOString().slice(0, 10);
  const confirmedNightsCount = nights.filter((n) => n.vagt_confirmed).length;
  const isVagt = user?.roles.includes("Vagt") ?? false;
  const hasUnreviewedNights =
    isVagt &&
    nights.some((n) => !myReview || n.created_at > myReview.reviewed_at);
  const pendingShiftsForMe = user
    ? nights.filter(
        (n) =>
          n.vagt_member_id === user.id && !n.vagt_confirmed && n.date >= today,
      )
    : [];

  useEffect(() => {
    setPendingShiftCount(pendingShiftsForMe.length);
  }, [pendingShiftsForMe.length, setPendingShiftCount]);

  const messageSearchResults =
    channelSearch.trim().length > 1
      ? allMessages.filter((m) =>
          m.body.toLowerCase().includes(channelSearch.toLowerCase()),
        )
      : [];

  return (
    <main className="bg-neutral-100 min-h-[calc(100vh-3.5rem)] p-4 sm:p-8 flex flex-col gap-6 sm:gap-8">
      {showAddModal && (
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

      {/* Swap modal */}
      {showSwapModal && swapTargetShift && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6 flex flex-col gap-4">
            <h2 className="font-semibold text-base text-neutral-900">
              Anmod om vagtbytte
            </h2>
            <p className="text-sm text-neutral-500">
              {swapTargetShift.name} —{" "}
              {new Date(swapTargetShift.date).toLocaleDateString("da-DK", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </p>
            <textarea
              className="w-full h-28 border border-neutral-200 rounded-lg px-3 py-2 text-sm outline-none font-[inherit] resize-none placeholder:text-neutral-400 focus:border-neutral-400"
              placeholder="Skriv en besked til de andre vagter (valgfrit)…"
              value={swapModalMessage}
              onChange={(e) => setSwapModalMessage(e.target.value)}
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => {
                  setShowSwapModal(false);
                  setSwapModalMessage("");
                  setSwapTargetShift(null);
                }}
              >
                Annuller
              </Button>
              <Button
                className="bg-[#e63946] hover:bg-red-600 text-white"
                onClick={requestSwap}
              >
                Send anmodning
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Tag over confirmation */}
      {swapConfirmMsg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-6 flex flex-col gap-4">
            <h2 className="font-semibold text-base text-neutral-900">
              Tag over vagten?
            </h2>
            <p className="text-sm text-neutral-500">
              {nights.find((n) => n.id === swapConfirmMsg.shift_night_id)
                ?.name ?? "Denne vagt"}{" "}
              flyttes til dig.
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setSwapConfirmMsg(null)}>
                Fortryd
              </Button>
              <Button
                className="bg-[#2a9d8f] hover:bg-teal-700 text-white"
                onClick={confirmTakeSwap}
              >
                Bekræft
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Profile Hero */}
      <MemberHero>
        <div className="flex flex-col items-center">
          <span className="font-bold text-2xl text-[#f4a261]">
            {shifts.length}
          </span>
          <span className="text-white/60 text-xs">Vagter</span>
        </div>
        <div className="hidden sm:block w-px h-10 bg-white/20" />
        <div className="flex flex-col items-center">
          <span className="font-bold text-2xl text-[#2a9d8f]">
            {confirmedNightsCount}
          </span>
          <span className="text-white/60 text-xs">Klubaftener</span>
        </div>
      </MemberHero>

      {/* Unreviewed nights banner — for vagter */}
      {hasUnreviewedNights && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-[#F4A261]/40 bg-[#F4A261]/10 p-4">
          <div className="flex items-start gap-3 flex-1">
            <Bell className="size-5 text-[#F4A261] shrink-0 mt-0.5" />
            <div className="flex flex-col gap-0.5">
              <p className="text-sm font-semibold text-neutral-900">
                Der er nye aftener siden du sidst gennemgik skemaet
              </p>
              <p className="text-xs text-neutral-500">
                Gennemgå listen og meld fra på de aftener du ikke kan tage
              </p>
            </div>
          </div>
          <Link
            href="/member/schedule"
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F4A261] text-white text-xs font-semibold hover:bg-orange-400 transition-colors w-full sm:w-auto justify-center"
          >
            <CalendarDays className="size-3.5" />
            Gå til vagtplan
          </Link>
        </div>
      )}

      {/* Two-column grid */}
      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-6">
        {/* Left: Pending confirmation + Next shift / All shifts */}
        <div className="flex flex-col gap-4">
          {/* Pending shifts panel */}
          {pendingShiftsForMe.length > 0 && (
            <div className="bg-white rounded-xl border-l-4 border-[#F4A261] p-6 flex flex-col gap-4 shadow-sm w-full min-w-0">
              <div className="flex items-center gap-2">
                <AlarmClock className="size-5 text-[#F4A261] shrink-0" />
                <h2 className="font-semibold text-base text-neutral-900">
                  Afventende vagter
                </h2>
                <span className="ml-auto text-xs font-semibold bg-[#F4A261]/15 text-[#F4A261] rounded-full px-2 py-0.5">
                  {pendingShiftsForMe.length}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 -mt-2">
                <p className="text-xs text-neutral-500">
                  Du er tildelt disse vagter - bekræft at du kan, eller meld fra
                </p>
                {pendingShiftsForMe.length > 1 && (
                  <button
                    onClick={async () => {
                      try {
                        await Promise.all(
                          pendingShiftsForMe.map((s) =>
                            postClubNightConfirm(s.id),
                          ),
                        );
                        const updated = await getClubNights();
                        setNights(updated);
                        getMemberShifts(user!.id)
                          .then(setShifts)
                          .catch(console.error);
                        toast.success("Alle vagter bekræftet!");
                      } catch {
                        toast.error("Noget gik galt. Prøv igen.");
                      }
                    }}
                    className="shrink-0 text-xs font-semibold px-3 py-1 rounded-lg bg-[#2a9d8f] text-white hover:bg-teal-700 transition-colors cursor-pointer border-none"
                  >
                    Bekræft alle
                  </button>
                )}
              </div>
              <div className="flex flex-col gap-3">
                {pendingShiftsForMe.map((shift) => (
                  <div
                    key={shift.id}
                    className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 flex flex-col gap-2"
                  >
                    <div className="flex items-center gap-3">
                      <div className="rounded-lg bg-[#F4A261] text-white flex flex-col justify-center items-center w-14 h-14 shrink-0">
                        <span className="font-medium uppercase text-[0.55rem] leading-none">
                          {new Date(shift.date).toLocaleDateString("da-DK", {
                            weekday: "short",
                          })}
                        </span>
                        <span className="font-bold text-lg leading-tight">
                          {new Date(shift.date).getDate()}
                        </span>
                        <span className="font-medium uppercase text-[0.55rem] leading-none opacity-80">
                          {new Date(shift.date).toLocaleDateString("da-DK", {
                            month: "short",
                          })}
                        </span>
                      </div>
                      <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                        <span className="font-semibold text-sm text-neutral-900 truncate">
                          {shift.name}
                        </span>
                        <div className="flex items-center gap-2 text-xs text-neutral-500">
                          <span className="flex items-center gap-1">
                            <Clock className="size-3" />
                            {shift.time_from} - {shift.time_to}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-neutral-500">
                      <MapPin className="size-3" />
                      {shift.location}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={async () => {
                          try {
                            await postClubNightConfirm(shift.id);
                            const updated = await getClubNights();
                            setNights(updated);
                            getMemberShifts(user!.id)
                              .then(setShifts)
                              .catch(console.error);
                            toast.success("Vagt bekræftet!");
                          } catch {
                            toast.error("Noget gik galt. Prøv igen.");
                          }
                        }}
                        className="flex-1 h-8 rounded-lg bg-[#2a9d8f] text-white text-xs font-semibold hover:bg-teal-700 transition-colors cursor-pointer border-none"
                      >
                        Bekræft vagt
                      </button>
                      <button
                        onClick={async () => {
                          try {
                            await postClubNightOptOut(shift.id);
                            const updated = await getClubNights();
                            setNights(updated);
                            toast.success("Framelding registreret");
                          } catch {
                            toast.error("Noget gik galt. Prøv igen.");
                          }
                        }}
                        className="flex-1 h-8 rounded-lg bg-white border border-[#e63946]/40 text-[#e63946] text-xs font-semibold hover:bg-[#e63946]/5 transition-colors cursor-pointer"
                      >
                        Meld fra
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Next shift / All shifts */}
          <div className="bg-white rounded-xl border-l-4 border-[#e63946] p-6 flex flex-col gap-4 shadow-sm w-full min-w-0">
            <div className="flex flex-col gap-2">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <AlarmClock className="size-5 text-[#e63946] shrink-0" />
                  <h2 className="font-semibold text-base text-neutral-900">
                    {showAllShifts ? "Mine vagter" : "Min næste vagt"}
                  </h2>
                </div>
              </div>
              <p className="text-xs text-neutral-500">
                {showAllShifts ? `${shifts.length} vagter i alt` : ""}
              </p>
            </div>

            {!showAllShifts ? (
              <>
                {nextShift ? (
                  <div className="flex flex-col gap-3">
                    <div className="bg-neutral-100 rounded-lg flex p-3 items-center gap-3">
                      <div className="rounded-lg bg-[#e63946] text-white flex flex-col justify-center items-center w-14 h-14 shrink-0">
                        <span className="font-medium uppercase text-[0.625rem] leading-none">
                          {new Date(nextShift.date).toLocaleDateString(
                            "da-DK",
                            {
                              weekday: "short",
                            },
                          )}
                        </span>
                        <span className="font-bold text-xl leading-tight">
                          {new Date(nextShift.date).getDate()}
                        </span>
                        <span className="font-medium uppercase text-[0.625rem] leading-none opacity-80">
                          {new Date(nextShift.date).toLocaleDateString(
                            "da-DK",
                            { month: "short" },
                          )}
                        </span>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="font-semibold text-sm text-neutral-900">
                          {nextShift.name}
                        </span>
                        <span className="text-neutral-500 text-xs">
                          {new Date(nextShift.date).toLocaleDateString(
                            "da-DK",
                            {
                              day: "numeric",
                              month: "long",
                              year: "numeric",
                            },
                          )}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 text-sm text-neutral-900">
                      <div className="flex items-center gap-2">
                        <Clock className="size-4 text-neutral-500 shrink-0" />
                        <span>
                          {nextShift.time_from} - {nextShift.time_to}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <MapPin className="size-4 text-neutral-500 shrink-0" />
                        <span>{nextShift.location}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-neutral-400 py-4 text-center">
                    Ingen kommende vagter
                  </p>
                )}
                {nextShift && (
                  <div className="flex gap-2">
                    {pendingSwap?.shiftId === nextShift.id ? (
                      <Button
                        variant="outline"
                        className="flex-1 gap-2 border-red-300 text-[#e63946] hover:bg-red-50"
                        onClick={cancelSwap}
                      >
                        <RefreshCcw className="size-4" />
                        Annuller bytte
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        className="flex-1 gap-2"
                        onClick={() => {
                          if (!nextShift) return;
                          setSwapTargetShift(nextShift);
                          setShowSwapModal(true);
                        }}
                        disabled={
                          pendingSwap !== null &&
                          pendingSwap.shiftId !== nextShift.id
                        }
                      >
                        <RefreshCcw className="size-4" />
                        Byt vagt
                      </Button>
                    )}
                  </div>
                )}
                <button
                  onClick={() => setShowAllShifts(true)}
                  className="mt-auto text-xs text-[#e63946] hover:underline text-left font-medium cursor-pointer bg-transparent border-none p-0"
                >
                  Se alle mine vagter →
                </button>
              </>
            ) : (
              <>
                <div className="flex flex-col gap-2">
                  {shifts.length === 0 && (
                    <p className="text-sm text-neutral-400 py-4 text-center">
                      Ingen kommende vagter
                    </p>
                  )}
                  {shifts.map((s) => (
                    <div
                      key={s.id}
                      className="rounded-lg flex flex-col gap-2 p-3 border bg-white border-neutral-200"
                    >
                      <div className="flex items-center gap-3">
                        <div className="rounded-lg bg-[#e63946] text-white flex flex-col justify-center items-center w-14 h-14 shrink-0">
                          <span className="font-medium uppercase text-[0.55rem] leading-none">
                            {new Date(s.date).toLocaleDateString("da-DK", {
                              weekday: "short",
                            })}
                          </span>
                          <span className="font-bold text-lg leading-tight">
                            {new Date(s.date).getDate()}
                          </span>
                          <span className="font-medium uppercase text-[0.55rem] leading-none opacity-80">
                            {new Date(s.date).toLocaleDateString("da-DK", {
                              month: "short",
                            })}
                          </span>
                        </div>
                        <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                          <span className="font-semibold text-sm text-neutral-900 truncate">
                            {s.name}
                          </span>
                          <div className="flex items-center gap-2 text-xs text-neutral-500">
                            <span className="flex items-center gap-1">
                              <Clock className="size-3" />
                              {s.time_from} - {s.time_to}
                            </span>
                            <span className="flex items-center gap-1">
                              <MapPin className="size-3" />
                              {s.location}
                            </span>
                          </div>
                        </div>
                      </div>
                      {pendingSwap?.shiftId === s.id ? (
                        <button
                          onClick={cancelSwap}
                          className="w-full h-8 rounded-lg border border-red-200 bg-red-50 text-[#e63946] text-xs font-medium hover:bg-red-100 transition-colors cursor-pointer"
                        >
                          Annuller vagtbytte
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            setSwapTargetShift(s);
                            setShowSwapModal(true);
                          }}
                          disabled={
                            pendingSwap !== null && pendingSwap.shiftId !== s.id
                          }
                          className="w-full h-8 rounded-lg border border-neutral-200 bg-neutral-50 text-neutral-600 text-xs font-medium hover:bg-neutral-100 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                        >
                          <RefreshCcw className="size-3" />
                          Byt vagt
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => setShowAllShifts(false)}
                  className="mt-auto text-xs text-neutral-500 hover:underline text-left font-medium cursor-pointer bg-transparent border-none p-0"
                >
                  ← Vis kun næste vagt
                </button>
              </>
            )}
          </div>
        </div>
        {/* end left column flex-col wrapper */}

        {/* Right: Events */}
        <div className="bg-white rounded-xl border border-black/6 p-6 flex flex-col gap-4 shadow-sm">
          <div className="flex flex-col gap-2">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <CalendarDays className="size-5 text-neutral-900 shrink-0" />
                <h2 className="font-semibold text-base text-neutral-900">
                  Klubaftener
                </h2>
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-500">
                  {confirmedNightsCount} kommende
                </span>
              </div>
            </div>
            <p className="text-xs text-neutral-500">
              Administrer kommende klubaftener og vagter
            </p>
          </div>

          <div
            className="flex flex-col gap-3 overflow-y-auto"
            style={{ maxHeight: "calc(5 * 4.5rem + 4 * 0.75rem)" }}
          >
            {nights
              .filter((n) => n.vagt_confirmed)
              .map((evt) => {
                const d = new Date(evt.date);
                const isMyShift = evt.vagt_member_id === user?.id;
                const hasOtherVagt = evt.vagt_member_id !== null && !isMyShift;

                return (
                  <div
                    key={evt.id}
                    className="border border-neutral-200 rounded-lg flex p-3 items-center gap-4"
                  >
                    <div
                      className={`rounded-lg text-white flex flex-col justify-center items-center w-14 h-14 shrink-0 ${
                        isMyShift
                          ? "bg-[#2a9d8f]"
                          : hasOtherVagt
                            ? "bg-[#f4a261]"
                            : "bg-[#e63946]"
                      }`}
                    >
                      <span className="font-medium uppercase text-[0.625rem] leading-none">
                        {d.toLocaleDateString("da-DK", { weekday: "short" })}
                      </span>
                      <span className="font-bold text-lg leading-tight">
                        {d.getDate()}
                      </span>
                      <span className="font-medium uppercase text-[0.625rem] leading-none opacity-80">
                        {d.toLocaleDateString("da-DK", { month: "short" })}
                      </span>
                    </div>
                    <div className="flex flex-col flex-1 min-w-0 gap-0.5">
                      <span className="font-semibold text-sm text-neutral-900 truncate">
                        {evt.name}
                      </span>
                      <div className="flex items-center gap-3 text-neutral-500 text-xs">
                        <span className="flex items-center gap-1">
                          <Clock className="size-3" />
                          {evt.time_from}
                        </span>
                        <span className="flex items-center gap-1">
                          <MapPin className="size-3" />
                          {evt.location}
                        </span>
                      </div>
                    </div>
                    {isMyShift ? (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap bg-[#2a9d8f]/10 text-[#2a9d8f] shrink-0">
                        Din vagt
                      </span>
                    ) : hasOtherVagt ? (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap bg-neutral-100 text-neutral-600 shrink-0">
                        {evt.assigned_member_name}
                      </span>
                    ) : (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap bg-[#e63946]/10 text-[#e63946] shrink-0">
                        Ingen vagt
                      </span>
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      </div>

      {/* Chat Card */}
      <div className="bg-white rounded-xl border border-black/6 p-6 flex flex-col gap-4 shadow-sm">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <MessagesSquare className="size-5 text-neutral-900 shrink-0" />
            <h2 className="font-semibold text-base text-neutral-900">
              Medlemschat
            </h2>
          </div>
          <button
            onClick={() => {
              setShowChannelSearch((v) => !v);
              setChannelSearch("");
              setTimeout(() => channelSearchRef.current?.focus(), 50);
            }}
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors cursor-pointer border-none font-[inherit] ${
              showChannelSearch
                ? "bg-neutral-100 text-neutral-900"
                : "bg-transparent text-neutral-500 hover:bg-neutral-100"
            }`}
          >
            <Search className="size-4" />
            Søg samtale
          </button>
        </div>

        <div className="relative grid grid-cols-1 md:grid-cols-[1fr_2fr] gap-4 h-105">
          {/* Contact list — drawer on mobile, sidebar on md+ */}
          {/* Mobile backdrop */}
          {showChannelDrawer && (
            <div
              className="md:hidden absolute inset-0 z-10 bg-black/30 rounded-lg"
              onClick={() => setShowChannelDrawer(false)}
            />
          )}
          <div
            className={`flex flex-col overflow-hidden border border-neutral-200 rounded-lg
            md:flex
            ${
              showChannelDrawer
                ? "absolute inset-y-0 left-0 z-20 w-72 bg-white shadow-xl"
                : "hidden md:flex"
            }`}
          >
            {showChannelSearch && (
              <div className="p-2 border-b border-neutral-100">
                <div className="relative">
                  <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
                  <input
                    ref={channelSearchRef}
                    value={channelSearch}
                    onChange={(e) => setChannelSearch(e.target.value)}
                    placeholder="Søg i beskeder…"
                    className="w-full h-8 pl-8 pr-3 text-xs rounded-md border border-neutral-200 outline-none bg-transparent placeholder:text-neutral-400 focus:border-neutral-400 font-[inherit]"
                  />
                </div>
              </div>
            )}
            {showChannelSearch && channelSearch.trim().length > 1 ? (
              <div className="flex flex-col overflow-y-auto flex-1">
                {messageSearchResults.length === 0 && (
                  <p className="text-xs text-neutral-400 text-center py-4">
                    Ingen beskeder fundet
                  </p>
                )}
                {messageSearchResults.map((msg) => {
                  const ch = channels.find((c) => c.id === msg.channel_id);
                  const isActive = activeChannelId === msg.channel_id;
                  const color =
                    ch?.type === "all_members" ? "#e63946" : "#2a9d8f";
                  const query = channelSearch.toLowerCase();
                  const bodyLower = msg.body.toLowerCase();
                  const idx = bodyLower.indexOf(query);
                  const before = msg.body.slice(0, idx);
                  const match = msg.body.slice(idx, idx + channelSearch.length);
                  const after = msg.body.slice(idx + channelSearch.length);
                  return (
                    <button
                      key={msg.id}
                      onClick={() => {
                        setShowChannelSearch(false);
                        setChannelSearch("");
                        setShowChannelDrawer(false);
                        if (msg.channel_id !== activeChannelId) {
                          pendingScrollMsgId.current = msg.id;
                          setActiveChannelId(msg.channel_id);
                        } else {
                          const el =
                            messagesContainerRef.current?.querySelector(
                              `[data-msg-id="${msg.id}"]`,
                            ) as HTMLElement | null;
                          if (el) {
                            el.scrollIntoView({ block: "center" });
                            setHighlightMessageId(msg.id);
                            setTimeout(() => setHighlightMessageId(null), 2000);
                          }
                        }
                      }}
                      className={`text-left flex flex-col gap-0.5 px-3 py-2 border-b border-neutral-100 hover:bg-neutral-50 transition-colors ${
                        isActive ? "bg-neutral-50" : ""
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span
                          className="text-[0.6rem] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full"
                          style={{ color, background: color + "18" }}
                        >
                          {ch?.name}
                        </span>
                        <span className="text-[0.6rem] text-neutral-400">
                          {msg.sender_name}
                        </span>
                      </div>
                      <p className="text-xs text-neutral-600 leading-4 line-clamp-2">
                        {before}
                        <mark className="bg-yellow-200 text-neutral-900 rounded-sm px-0">
                          {match}
                        </mark>
                        {after}
                      </p>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col p-2 gap-1 overflow-y-auto flex-1">
                {channels.map((ch) => (
                  <GroupChatItem
                    key={ch.id}
                    active={activeChannelId === ch.id}
                    name={ch.name}
                    color={ch.type === "all_members" ? "red" : "teal"}
                    badgeLabel={ch.type === "all_members" ? "Fælles" : "Vagter"}
                    badgeColor={ch.type === "all_members" ? "red" : "teal"}
                    lastMsg=""
                    lastTime=""
                    onClick={() => {
                      setActiveChannelId(ch.id);
                      setShowChannelSearch(false);
                      setChannelSearch("");
                      setShowChannelDrawer(false);
                    }}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Chat window */}
          <div className="border border-neutral-200 rounded-lg flex flex-col overflow-hidden">
            <div className="border-b border-neutral-200 flex p-3 justify-between items-center shrink-0">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowChannelDrawer(true)}
                  className="md:hidden flex items-center justify-center w-8 h-8 rounded-md border-none bg-transparent text-neutral-500 hover:bg-neutral-100 transition-colors cursor-pointer shrink-0"
                  aria-label="Åbn samtaler"
                >
                  <MessagesSquare className="size-4" />
                </button>
                <div
                  className={`w-10 h-10 rounded-full text-white flex items-center justify-center shrink-0 ${
                    activeChannel?.type === "all_members"
                      ? "bg-[#e63946]"
                      : "bg-[#2a9d8f]"
                  }`}
                >
                  <Users className="size-[1.1rem]" />
                </div>
                <div className="flex flex-col">
                  <span className="font-semibold text-sm text-neutral-900">
                    {activeChannel?.name}
                  </span>
                  <span
                    className={`text-xs ${
                      activeChannel?.type === "all_members"
                        ? "text-[#e63946]"
                        : "text-[#2a9d8f]"
                    }`}
                  >
                    {activeChannel?.type === "all_members"
                      ? "Fælles kanal"
                      : "Kun for vagter"}
                  </span>
                </div>
              </div>
            </div>

            <div className="relative flex flex-col flex-1 overflow-hidden">
              {isScrolledUp && (
                <button
                  onClick={() => {
                    const el = messagesContainerRef.current;
                    if (el) el.scrollTop = el.scrollHeight;
                  }}
                  className="absolute bottom-4 right-4 z-10 flex items-center justify-center w-8 h-8 rounded-full bg-white border border-neutral-200 shadow-md text-neutral-600 hover:bg-neutral-50 transition-colors cursor-pointer"
                >
                  <ChevronDown className="size-4" />
                </button>
              )}
              <div
                ref={messagesContainerRef}
                onScroll={() => {
                  const el = messagesContainerRef.current;
                  if (!el) return;
                  setIsScrolledUp(
                    el.scrollHeight - el.scrollTop - el.clientHeight > 80,
                  );
                }}
                className="bg-neutral-50/40 flex p-4 flex-col flex-1 gap-3 overflow-y-auto"
              >
                {(() => {
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  const yesterday = new Date(today);
                  yesterday.setDate(yesterday.getDate() - 1);

                  function dayLabel(date: Date) {
                    const d = new Date(date);
                    d.setHours(0, 0, 0, 0);
                    if (d.getTime() === today.getTime()) return "I dag";
                    if (d.getTime() === yesterday.getTime()) return "I går";
                    return d.toLocaleDateString("da-DK", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    });
                  }

                  const groups: { label: string; msgs: typeof messages }[] = [];
                  for (const msg of messages) {
                    const label = dayLabel(new Date(msg.sent_at));
                    const last = groups[groups.length - 1];
                    if (last && last.label === label) {
                      last.msgs.push(msg);
                    } else {
                      groups.push({ label, msgs: [msg] });
                    }
                  }

                  const accentColor =
                    activeChannel?.type === "all_members"
                      ? "bg-[#e63946]"
                      : "bg-[#2a9d8f]";
                  const outgoingColor = "bg-[#3d5a80]";

                  return groups.map((group) => (
                    <div key={group.label} className="flex flex-col gap-3">
                      <div className="flex justify-center">
                        <span className="bg-white border border-neutral-200 rounded-full px-2 py-0.5 text-[0.625rem] text-neutral-500">
                          {group.label}
                        </span>
                      </div>
                      {group.msgs.map((msg) => {
                        const outgoing = msg.sender_id === user?.id;
                        const timeStr = new Date(
                          msg.sent_at,
                        ).toLocaleTimeString("da-DK", {
                          hour: "2-digit",
                          minute: "2-digit",
                        });

                        // ── Swap card ──────────────────────────────────────────
                        if (msg.type === "shift_swap") {
                          const swapNight = nights.find(
                            (n) => n.id === msg.shift_night_id,
                          );
                          const userOptedOut =
                            !!user &&
                            !!swapNight &&
                            swapNight.opted_out_members.some(
                              (o) => o.id === user.id,
                            );
                          const canTake =
                            !outgoing &&
                            msg.swap_status === "pending" &&
                            !userOptedOut &&
                            (user?.roles.includes("Vagt") ||
                              user?.roles.includes("Administrator"));
                          return (
                            <div
                              key={msg.id}
                              data-msg-id={msg.id}
                              className={`flex ${outgoing ? "justify-end" : ""} rounded-xl transition-colors duration-700 ${highlightMessageId === msg.id ? "bg-yellow-50" : ""}`}
                            >
                              <div className="border border-neutral-200 bg-white rounded-xl p-3 flex flex-col gap-2 max-w-xs w-full shadow-sm">
                                <div className="flex items-center gap-2">
                                  <RefreshCcw className="size-3.5 text-[#2a9d8f] shrink-0" />
                                  <span className="text-[0.65rem] font-semibold text-neutral-500 uppercase tracking-wide">
                                    Vagtbytte
                                  </span>
                                  <span className="ml-auto text-[0.6rem] text-neutral-400">
                                    {timeStr}
                                  </span>
                                </div>
                                {swapNight && (
                                  <p className="text-xs font-semibold text-neutral-800 leading-snug">
                                    {swapNight.name}
                                    <span className="font-normal text-neutral-500 ml-1">
                                      {new Date(
                                        swapNight.date,
                                      ).toLocaleDateString("da-DK", {
                                        day: "numeric",
                                        month: "short",
                                      })}
                                    </span>
                                  </p>
                                )}
                                <p className="text-xs text-neutral-600 leading-snug">
                                  {msg.body}
                                </p>
                                {msg.swap_status === "pending" && (
                                  <>
                                    {!outgoing && (
                                      <span className="text-[0.6rem] text-neutral-400">
                                        {msg.sender_name}
                                      </span>
                                    )}
                                    {canTake ? (
                                      <button
                                        onClick={() => setSwapConfirmMsg(msg)}
                                        className="mt-1 w-full h-8 rounded-lg bg-[#2a9d8f] text-white text-xs font-semibold hover:bg-teal-700 transition-colors cursor-pointer border-none"
                                      >
                                        Tag vagt
                                      </button>
                                    ) : userOptedOut ? (
                                      <div className="mt-1 flex flex-col gap-1">
                                        <button
                                          disabled
                                          className="w-full h-8 rounded-lg bg-neutral-100 text-neutral-400 text-xs font-semibold border border-neutral-200 cursor-not-allowed"
                                        >
                                          Tag vagt
                                        </button>
                                        <span className="text-[0.6rem] text-neutral-400 italic text-center">
                                          Du har meldt fra denne aften
                                        </span>
                                      </div>
                                    ) : outgoing ? (
                                      <span className="text-[0.65rem] text-neutral-400 italic">
                                        Afventer svar…
                                      </span>
                                    ) : null}
                                  </>
                                )}
                                {msg.swap_status === "taken" && (
                                  <span className="text-[0.65rem] font-semibold text-[#2a9d8f]">
                                    ✓ Taget af {msg.taken_by_name}
                                  </span>
                                )}
                                {msg.swap_status === "cancelled" && (
                                  <span className="text-[0.65rem] text-neutral-400 italic">
                                    {msg.body}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        }

                        // ── Normal bubble ──────────────────────────────────────
                        if (outgoing) {
                          return (
                            <div
                              key={msg.id}
                              data-msg-id={msg.id}
                              className={`flex justify-end items-end rounded-xl px-1 transition-colors duration-700 ${highlightMessageId === msg.id ? "bg-yellow-50" : ""}`}
                            >
                              <div className="flex flex-col items-end gap-1 max-w-md">
                                <div
                                  className={`px-4 py-2 text-sm text-white rounded-[1rem_1rem_0.25rem_1rem] ${outgoingColor}`}
                                >
                                  {msg.body}
                                </div>
                                <span className="text-[0.625rem] text-neutral-500 pr-2">
                                  {timeStr}
                                </span>
                              </div>
                            </div>
                          );
                        }

                        return (
                          <div
                            key={msg.id}
                            data-msg-id={msg.id}
                            className={`flex flex-col gap-0.5 rounded-xl px-1 transition-colors duration-700 ${highlightMessageId === msg.id ? "bg-yellow-50" : ""}`}
                          >
                            <div className="flex items-end gap-2">
                              <div
                                className={`w-7 h-7 rounded-full text-white flex items-center justify-center text-[0.55rem] font-bold shrink-0 select-none ${accentColor}`}
                              >
                                {msg.sender_initials}
                              </div>
                              <div className="flex flex-col gap-0.5 max-w-md">
                                <span className="text-[0.65rem] font-semibold text-neutral-600 pl-1">
                                  {msg.sender_name}
                                </span>
                                <div className="px-4 py-2 text-sm bg-white border border-neutral-200 rounded-[1rem_1rem_1rem_0.25rem]">
                                  {msg.body}
                                </div>
                              </div>
                            </div>
                            <span className="text-[0.625rem] text-neutral-500 pl-9">
                              {timeStr}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ));
                })()}
                <div ref={chatEndRef} />
              </div>
            </div>

            <div className="border-t border-neutral-200 flex p-3 items-center gap-2 shrink-0">
              {/* <button className="inline-flex items-center justify-center w-8 h-8 rounded-md border-none bg-transparent text-neutral-500 hover:bg-neutral-100 transition-colors cursor-pointer">
                <Paperclip className="size-4" />
              </button>
              <button className="inline-flex items-center justify-center w-8 h-8 rounded-md border-none bg-transparent text-neutral-500 hover:bg-neutral-100 transition-colors cursor-pointer">
                <Smile className="size-4" />
              </button> */}
              <input
                className="flex-1 h-10 border border-neutral-200 rounded-lg px-3 text-sm outline-none font-[inherit] bg-transparent placeholder:text-neutral-400 focus:border-neutral-900"
                placeholder={`Skriv til ${activeChannel?.name?.toLowerCase() ?? "gruppen"}…`}
                value={msgBody}
                onChange={(e) => setMsgBody(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
              />
              <button
                onClick={sendMessage}
                className={`inline-flex items-center justify-center w-10 h-10 rounded-lg text-white transition-colors border-none cursor-pointer shrink-0 ${
                  activeChannel?.type === "all_members"
                    ? "bg-[#e63946] hover:bg-red-600"
                    : "bg-[#2a9d8f] hover:bg-teal-600"
                }`}
              >
                <Send className="size-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
