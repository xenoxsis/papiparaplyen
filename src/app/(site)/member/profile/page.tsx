"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  AlarmClock,
  Bell,
  CalendarDays,
  Clock,
  MapPin,
  Pencil,
} from "lucide-react";
import { MemberHero } from "@/components/MemberHero";
import { ClubNightModal } from "@/components/ClubNightModal";
import { DateBadge } from "@/components/DateBadge";
import { useAuth } from "@/lib/auth-context";
import { useRequireAuth } from "@/lib/useRequireAuth";
import {
  getClubNights,
  getChannels,
  getMessages,
  getMemberShifts,
  getMyScheduleReview,
  getChannelMembers,
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
  type ApiChannelMember,
} from "@/lib/api";
import { useChannelSSE } from "@/lib/useChannelSSE";
import { ShiftsPanel } from "./ShiftsPanel";
import { SwapModal } from "./SwapModal";
import { SwapConfirmModal } from "./SwapConfirmModal";
import { ChatPanel } from "./ChatPanel";
import { EditProfileModal } from "./EditProfileModal";

// ── Message map helpers ─────────────────────────────────────────────────────
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

// ── Swap modal state ──────────────────────────────────────────────────────────
type SwapState = {
  showModal: boolean;
  targetShift: ApiClubNight | null;
  modalMessage: string;
  confirmMsg: ApiMessage | null;
};
type SwapAction =
  | { type: "OPEN"; shift: ApiClubNight }
  | { type: "CLOSE" }
  | { type: "SET_MESSAGE"; message: string }
  | { type: "SET_CONFIRM"; msg: ApiMessage | null };

const initialSwapState: SwapState = {
  showModal: false,
  targetShift: null,
  modalMessage: "",
  confirmMsg: null,
};

function swapReducer(state: SwapState, action: SwapAction): SwapState {
  switch (action.type) {
    case "OPEN":
      return {
        ...state,
        showModal: true,
        targetShift: action.shift,
        modalMessage: "",
      };
    case "CLOSE":
      return {
        ...state,
        showModal: false,
        targetShift: null,
        modalMessage: "",
      };
    case "SET_MESSAGE":
      return { ...state, modalMessage: action.message };
    case "SET_CONFIRM":
      return { ...state, confirmMsg: action.msg };
    default:
      return state;
  }
}

export default function ProfilePage() {
  const { authorized } = useRequireAuth();
  const { user, setPendingShiftCount } = useAuth();

  // ── Data state ────────────────────────────────────────────────────────────
  const [activeChannelId, setActiveChannelId] = useState<number>(1);
  const [showAddModal, setShowAddModal] = useState(false);
  const [shifts, setShifts] = useState<ApiClubNight[]>([]);
  const [nights, setNights] = useState<ApiClubNight[]>([]);
  const [channels, setChannels] = useState<ApiChannel[]>([]);
  const [messageMap, setMessageMap] = useState<Record<number, ApiMessage[]>>(
    {},
  );
  const messages = messageMap[activeChannelId] ?? [];
  const [lastSeenIds, setLastSeenIds] = useState<Record<number, number>>({});
  const [channelMembers, setChannelMembers] = useState<ApiChannelMember[]>([]);
  const [myReview, setMyReview] = useState<ApiScheduleReview | null>(null);

  // Derived: vagter channel ID (avoids hardcoding channel 2 everywhere)
  const vagterChannelId = useMemo(
    () => channels.find((c) => c.type === "vagter")?.id,
    [channels],
  );

  // ── Swap state ────────────────────────────────────────────────────────────
  const [swap, dispatchSwap] = useReducer(swapReducer, initialSwapState);

  // ── Deep link ─────────────────────────────────────────────────────────────
  const [vagterMsgId, setVagterMsgId] = useState<number | null>(null);
  const didHandleVagterParam = useRef(false);

  // ── Highlight ─────────────────────────────────────────────────────────────
  const [highlightMessageId, setHighlightMessageId] = useState<number | null>(
    null,
  );

  // ── Edit modal ────────────────────────────────────────────────────────────
  const [showEditModal, setShowEditModal] = useState(false);

  // ── Scroll refs (shared with ChatPanel) ──────────────────────────────────
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const scrollOnNextRender = useRef(false);
  const pendingScrollMsgId = useRef<number | null>(null);
  const [loading, setLoading] = useState(true);

  // ── Initial data fetch ────────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true);
    const promises: Promise<unknown>[] = [
      getClubNights().then(setNights).catch(console.error),
      getMyScheduleReview().then(setMyReview).catch(console.error),
      getChannels()
        .then(async (chs) => {
          setChannels(chs);
          const all = await Promise.all(chs.map((c) => getMessages(c.id)));
          const map: Record<number, ApiMessage[]> = {};
          const seed: Record<number, number> = {};
          chs.forEach((c, i) => {
            map[c.id] = all[i];
            for (const msg of all[i]) {
              if ((seed[msg.channel_id] ?? 0) < msg.id)
                seed[msg.channel_id] = msg.id;
            }
          });
          setMessageMap(map);
          setLastSeenIds(seed);
        })
        .catch(console.error),
    ];
    if (user)
      promises.push(
        getMemberShifts(user.id).then(setShifts).catch(console.error),
      );
    Promise.all(promises).finally(() => setLoading(false));
  }, [user]);

  // Mark active channel seen
  useEffect(() => {
    const bucket = messageMap[activeChannelId] ?? [];
    const latestId = Math.max(0, ...bucket.map((m) => m.id));
    if (latestId > 0)
      setLastSeenIds((prev) => ({ ...prev, [activeChannelId]: latestId }));
  }, [activeChannelId, messageMap]);

  // Fetch messages + members for active channel
  useEffect(() => {
    getMessages(activeChannelId)
      .then((msgs) => {
        scrollOnNextRender.current = true;
        setMessageMap((prev) => ({ ...prev, [activeChannelId]: msgs }));
      })
      .catch(console.error);
    getChannelMembers(activeChannelId)
      .then(setChannelMembers)
      .catch(console.error);
  }, [activeChannelId]);

  // SSE real-time updates
  const { connected: sseConnected } = useChannelSSE(activeChannelId, (msg) => {
    if (msg.channel_id === activeChannelId) scrollOnNextRender.current = true;
    setMessageMap((prev) => upsertIntoMap(prev, msg));
  });

  // Fallback poll — only active when SSE is disconnected
  useEffect(() => {
    if (sseConnected) return;
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

  // Read ?vagter= param
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = Number(params.get("vagter")) || null;
    if (id) setVagterMsgId(id);
  }, []);

  // Handle ?vagter= deep link
  useEffect(() => {
    const allMsgs = Object.values(messageMap).flat();
    if (!vagterMsgId || didHandleVagterParam.current || allMsgs.length === 0)
      return;
    const msg = allMsgs.find((m) => m.id === vagterMsgId);
    if (!msg) return;
    didHandleVagterParam.current = true;
    pendingScrollMsgId.current = vagterMsgId;
    if (activeChannelId !== msg.channel_id) {
      setActiveChannelId(msg.channel_id);
    } else {
      const el = messagesContainerRef.current?.querySelector(
        `[data-msg-id="${vagterMsgId}"]`,
      ) as HTMLElement | null;
      if (el) {
        el.scrollIntoView({ block: "center" });
        setHighlightMessageId(vagterMsgId);
        setTimeout(() => setHighlightMessageId(null), 2000);
      }
    }
  }, [messageMap, vagterMsgId, activeChannelId]);

  // Auto-refresh after swap taken
  useEffect(() => {
    if (!user) return;
    const myTakenSwap = (
      vagterChannelId !== undefined ? (messageMap[vagterChannelId] ?? []) : []
    ).find(
      (m) =>
        m.type === "shift_swap" &&
        m.swap_status === "taken" &&
        m.sender_id === user.id,
    );
    if (myTakenSwap) {
      getClubNights().then(setNights).catch(console.error);
      getMemberShifts(user.id).then(setShifts).catch(console.error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messageMap, vagterChannelId]);

  // Scroll effect for new messages / deep link
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
      if (container) container.scrollTop = container.scrollHeight;
      scrollOnNextRender.current = false;
    }
  }, [messages]);

  // ── Derived state ─────────────────────────────────────────────────────────
  const pendingSwap = useMemo(() => {
    if (!user || vagterChannelId === undefined) return null;
    const m = (
      vagterChannelId !== undefined ? (messageMap[vagterChannelId] ?? []) : []
    ).find(
      (msg) =>
        msg.type === "shift_swap" &&
        msg.swap_status === "pending" &&
        msg.sender_id === user.id,
    );
    if (m && m.shift_night_id !== undefined)
      return { shiftId: m.shift_night_id, messageId: m.id };
    return null;
  }, [messageMap, user, vagterChannelId]);

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
  const isVagtOrAdmin =
    user?.roles.includes("Vagt") || user?.roles.includes("Administrator");

  useEffect(() => {
    setPendingShiftCount(pendingShiftsForMe.length);
  }, [pendingShiftsForMe.length, setPendingShiftCount]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleSendMessage = useCallback(
    async (body: string) => {
      if (!user) return;
      const msg = await postMessage(activeChannelId, user.id, body);
      scrollOnNextRender.current = true;
      setMessageMap((prev) => upsertIntoMap(prev, msg));
    },
    [activeChannelId, user],
  );

  const requestSwap = useCallback(async () => {
    if (!user || !swap.targetShift || vagterChannelId === undefined) return;
    try {
      const msg = await postMessage(
        vagterChannelId,
        user.id,
        swap.modalMessage.trim() ||
          `Kan nogen tage min vagt til ${swap.targetShift.name}?`,
        { type: "shift_swap", shift_night_id: swap.targetShift.id },
      );
      setMessageMap((prev) => upsertIntoMap(prev, msg));
      if (activeChannelId === vagterChannelId)
        scrollOnNextRender.current = true;
      dispatchSwap({ type: "CLOSE" });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Noget gik galt. Prøv igen.",
      );
    }
  }, [
    user,
    swap.targetShift,
    swap.modalMessage,
    vagterChannelId,
    activeChannelId,
  ]);

  const cancelSwap = useCallback(async () => {
    if (!user || !pendingSwap || vagterChannelId === undefined) return;
    try {
      await patchMessage(vagterChannelId, pendingSwap.messageId, {
        body: `Annulleret af ${user.name}`,
        swap_status: "cancelled",
      });
      getMessages(vagterChannelId).then((msgs) =>
        setMessageMap((prev) => ({ ...prev, [vagterChannelId]: msgs })),
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Noget gik galt. Prøv igen.",
      );
    }
  }, [user, pendingSwap, vagterChannelId]);

  const confirmTakeSwap = useCallback(async () => {
    if (
      !user ||
      !swap.confirmMsg ||
      swap.confirmMsg.shift_night_id === undefined ||
      vagterChannelId === undefined
    )
      return;
    try {
      await patchClubNight(swap.confirmMsg.shift_night_id, {
        vagt_member_id: user.id,
      });
      await patchMessage(vagterChannelId, swap.confirmMsg.id, {
        swap_status: "taken",
        taken_by_member_id: user.id,
      });
      dispatchSwap({ type: "SET_CONFIRM", msg: null });
      getClubNights().then(setNights).catch(console.error);
      getMemberShifts(user.id).then(setShifts).catch(console.error);
      getMessages(vagterChannelId).then((msgs) =>
        setMessageMap((prev) => ({ ...prev, [vagterChannelId]: msgs })),
      );
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : "Noget gik galt. Prøv igen.",
      );
    }
  }, [user, swap.confirmMsg, vagterChannelId]);

  async function handleConfirmShift(shiftId: number) {
    try {
      await postClubNightConfirm(shiftId);
      const updated = await getClubNights();
      setNights(updated);
      getMemberShifts(user!.id).then(setShifts).catch(console.error);
      toast.success("Vagt bekræftet!");
    } catch {
      toast.error("Noget gik galt. Prøv igen.");
    }
  }

  async function handleOptOut(shiftId: number) {
    try {
      await postClubNightOptOut(shiftId);
      const updated = await getClubNights();
      setNights(updated);
      toast.success("Framelding registreret");
    } catch {
      toast.error("Noget gik galt. Prøv igen.");
    }
  }

  async function handleConfirmAllShifts() {
    try {
      await Promise.all(
        pendingShiftsForMe.map((s) => postClubNightConfirm(s.id)),
      );
      const updated = await getClubNights();
      setNights(updated);
      getMemberShifts(user!.id).then(setShifts).catch(console.error);
      toast.success("Alle vagter bekræftet!");
    } catch {
      toast.error("Noget gik galt. Prøv igen.");
    }
  }

  if (!authorized) return null;

  return (
    <main className="bg-neutral-100 min-h-[calc(100vh-3.5rem)] p-4 sm:p-8 flex flex-col gap-6 sm:gap-8">
      {/* Add night modal */}
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
              toast.error(
                err instanceof Error
                  ? err.message
                  : "Noget gik galt. Prøv igen.",
              );
            }
            setShowAddModal(false);
          }}
        />
      )}

      {/* Swap modals */}
      <SwapModal
        open={swap.showModal && swap.targetShift !== null}
        onClose={() => dispatchSwap({ type: "CLOSE" })}
        shift={swap.targetShift}
        message={swap.modalMessage}
        setMessage={(m) => dispatchSwap({ type: "SET_MESSAGE", message: m })}
        onSubmit={requestSwap}
      />

      <SwapConfirmModal
        msg={swap.confirmMsg}
        nights={nights}
        onClose={() => dispatchSwap({ type: "SET_CONFIRM", msg: null })}
        onConfirm={confirmTakeSwap}
      />

      {/* Profile hero */}
      <MemberHero
        action={
          <button
            onClick={() => setShowEditModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/20 text-white/70 hover:bg-white/10 hover:text-white transition-colors text-xs font-medium cursor-pointer"
          >
            <Pencil className="size-3.5" />
            Rediger profil
          </button>
        }
      >
        <div className="flex flex-col items-center">
          <span className="font-bold text-2xl text-brand-orange">
            {shifts.length}
          </span>
          <span className="text-white/60 text-xs">Vagter</span>
        </div>
        <div className="hidden sm:block w-px h-10 bg-white/20" />
        <div className="flex flex-col items-center">
          <span className="font-bold text-2xl text-brand-teal">
            {confirmedNightsCount}
          </span>
          <span className="text-white/60 text-xs">Klubaftener</span>
        </div>
        <div className="hidden sm:block w-px h-10 bg-white/20" />
      </MemberHero>

      {/* Unreviewed nights banner */}
      {hasUnreviewedNights && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-brand-orange/40 bg-brand-orange/10 p-4">
          <div className="flex items-start gap-3 flex-1">
            <Bell className="size-5 text-brand-orange shrink-0 mt-0.5" />
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
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-orange text-white text-xs font-semibold hover:bg-orange-400 transition-colors w-full sm:w-auto justify-center"
          >
            <CalendarDays className="size-3.5" />
            Gå til vagtplan
          </Link>
        </div>
      )}

      {/* Two-column grid */}
      <div
        className={`grid grid-cols-1 gap-6 ${isVagtOrAdmin ? "md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]" : ""}`}
      >
        {/* Left: Shifts panel — Vagt/Admin only */}
        {isVagtOrAdmin && (
          <ShiftsPanel
            loading={loading}
            shifts={shifts}
            pendingShiftsForMe={pendingShiftsForMe}
            pendingSwap={pendingSwap}
            onConfirmShift={handleConfirmShift}
            onOptOut={handleOptOut}
            onConfirmAllShifts={handleConfirmAllShifts}
            onRequestSwap={(shift) => {
              dispatchSwap({ type: "OPEN", shift });
            }}
            onCancelSwap={cancelSwap}
          />
        )}

        {/* Right: Club nights list */}
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
                const isMyShift = evt.vagt_member_id === user?.id;
                const hasOtherVagt = evt.vagt_member_id !== null && !isMyShift;
                const colorClass = isMyShift
                  ? "bg-brand-teal"
                  : hasOtherVagt
                    ? "bg-brand-orange"
                    : "bg-brand-red";

                return (
                  <div
                    key={evt.id}
                    className="border border-neutral-200 rounded-lg flex p-3 items-center gap-4"
                  >
                    <DateBadge date={evt.date} colorClass={colorClass} />
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
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap bg-brand-teal/10 text-brand-teal shrink-0">
                        Din vagt
                      </span>
                    ) : hasOtherVagt ? (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="w-6 h-6 rounded-full bg-brand-orange text-white text-[0.6rem] font-bold flex items-center justify-center shrink-0">
                          {evt.assigned_member_initials}
                        </span>
                        <span className="text-xs font-medium text-neutral-600 whitespace-nowrap">
                          {evt.assigned_member_name}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap bg-brand-red/10 text-brand-red shrink-0">
                        Ingen vagt
                      </span>
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      </div>

      {/* Chat */}
      <ChatPanel
        loading={loading}
        channels={channels}
        activeChannelId={activeChannelId}
        setActiveChannelId={setActiveChannelId}
        messages={messages}
        messageMap={messageMap}
        lastSeenIds={lastSeenIds}
        setLastSeenIds={setLastSeenIds}
        user={user}
        nights={nights}
        highlightMessageId={highlightMessageId}
        setHighlightMessageId={setHighlightMessageId}
        swapConfirmMsg={swap.confirmMsg}
        setSwapConfirmMsg={(msg) => dispatchSwap({ type: "SET_CONFIRM", msg })}
        channelMembers={channelMembers}
        onSend={handleSendMessage}
        messagesContainerRef={messagesContainerRef}
        chatEndRef={chatEndRef}
        pendingScrollMsgId={pendingScrollMsgId}
      />

      {/* Edit profile modal */}
      <EditProfileModal
        open={showEditModal}
        onClose={() => setShowEditModal(false)}
      />
    </main>
  );
}
