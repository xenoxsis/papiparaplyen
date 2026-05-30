"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, MessagesSquare, Search, Send, Users } from "lucide-react";
import { GroupChatItem } from "./GroupChatItem";
import { MessageGroup } from "./MessageGroup";
import { Skeleton } from "@/components/ui/skeleton";
import { postTyping } from "@/lib/api";
import { useUserSSE } from "@/lib/UserSSEContext";
import type {
  ApiChannel,
  ApiChannelMember,
  ApiClubNight,
  ApiMessage,
} from "@/lib/api";
import type { User } from "@/lib/auth-context";

interface ChatPanelProps {
  loading?: boolean;
  channels: ApiChannel[];
  activeChannelId: number;
  setActiveChannelId: (id: number) => void;
  messages: ApiMessage[];
  messageMap: Record<number, ApiMessage[]>;
  lastSeenIds: Record<number, number>;
  setLastSeenIds: React.Dispatch<React.SetStateAction<Record<number, number>>>;
  user: User | null;
  nights: ApiClubNight[];
  highlightMessageId: number | null;
  setHighlightMessageId: (id: number | null) => void;
  swapConfirmMsg: ApiMessage | null;
  setSwapConfirmMsg: (msg: ApiMessage | null) => void;
  channelMembers: ApiChannelMember[];
  onSend: (body: string) => Promise<void>;
  onEdit: (msg: ApiMessage, newBody: string) => Promise<void>;
  onDelete: (msg: ApiMessage) => Promise<void>;
  messagesContainerRef: React.RefObject<HTMLDivElement | null>;
  chatEndRef: React.RefObject<HTMLDivElement | null>;
  pendingScrollMsgId: React.MutableRefObject<number | null>;
  hideChannelSelector?: boolean;
}

export function ChatPanel({
  loading = false,
  channels,
  activeChannelId,
  setActiveChannelId,
  messages,
  messageMap,
  lastSeenIds,
  setLastSeenIds,
  user,
  nights,
  highlightMessageId,
  setHighlightMessageId,
  swapConfirmMsg: _swapConfirmMsg,
  setSwapConfirmMsg,
  channelMembers,
  onSend,
  onEdit,
  onDelete,
  messagesContainerRef,
  chatEndRef,
  pendingScrollMsgId,
  hideChannelSelector = false,
}: ChatPanelProps) {
  const [channelSearch, setChannelSearch] = useState("");
  const [showChannelSearch, setShowChannelSearch] = useState(false);
  const [showChannelDrawer, setShowChannelDrawer] = useState(false);
  const [isScrolledUp, setIsScrolledUp] = useState(false);

  // Message compose
  const [msgBody, setMsgBody] = useState("");
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionDropsDown, setMentionDropsDown] = useState(false);
  const [dropdownRect, setDropdownRect] = useState<DOMRect | null>(null);

  const channelSearchRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const mentionContainerRef = useRef<HTMLDivElement>(null);
  const lastTypingSentRef = useRef<number>(0);

  // Typing indicator state: channelId -> list of { memberId, name, until }
  const [typingUsers, setTypingUsers] = useState<
    Record<number, { memberId: number; name: string; until: number }[]>
  >({});

  // Subscribe to typing events via the user SSE stream
  useUserSSE((evt) => {
    if (evt.event !== "typing") return;
    const { channelId: ch, memberId: mid, name } = evt.data;
    if (mid === user?.id) return; // ignore own typing
    const until = Date.now() + 3_000;
    setTypingUsers((prev) => {
      const existing = (prev[ch] ?? []).filter((t) => t.memberId !== mid);
      return { ...prev, [ch]: [...existing, { memberId: mid, name, until }] };
    });
  });

  // Clear expired typing entries every second
  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      setTypingUsers((prev) => {
        const next: typeof prev = {};
        let changed = false;
        for (const [k, arr] of Object.entries(prev)) {
          const filtered = arr.filter((t) => t.until > now);
          if (filtered.length !== arr.length) changed = true;
          if (filtered.length > 0) next[Number(k)] = filtered;
        }
        return changed ? next : prev;
      });
    }, 1_000);
    return () => clearInterval(id);
  }, []);

  // Scroll to bottom when typing indicator appears so it stays visible
  useEffect(() => {
    if (!activeChannelId) return;
    const typers = typingUsers[activeChannelId] ?? [];
    if (typers.length === 0) return;
    const el = messagesContainerRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distFromBottom < 120) el.scrollTop = el.scrollHeight;
  }, [typingUsers, activeChannelId, messagesContainerRef]);

  const activeChannel = channels.find((c) => c.id === activeChannelId);

  const messageSearchResults = useMemo(
    () =>
      channelSearch.trim().length > 1
        ? Object.values(messageMap)
            .flat()
            .filter((m) =>
              m.body.toLowerCase().includes(channelSearch.toLowerCase()),
            )
        : [],
    [messageMap, channelSearch],
  );

  // Virtual entries for group mentions (negative IDs)
  const GROUP_MENTIONS: ApiChannelMember[] = [
    { id: -1, name: "vagter", initials: "VAG" },
    { id: -2, name: "alle", initials: "ALL" },
  ];

  const mentionResults = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    const groups = GROUP_MENTIONS.filter((g) => g.name.startsWith(q));
    const members = channelMembers
      .filter(
        (m) =>
          m.id !== user?.id &&
          (m.name.toLowerCase().includes(q) ||
            m.initials.toLowerCase().includes(q)),
      )
      .slice(0, 6 - groups.length);
    return [...groups, ...members];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mentionQuery, channelMembers, user?.id]);

  useEffect(() => {
    if (mentionQuery === null) return;
    const el = mentionContainerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const estimatedHeight = Math.min(mentionResults.length, 6) * 44 + 8;
    setDropdownRect(rect);
    setMentionDropsDown(rect.top < estimatedHeight);
  }, [mentionQuery, mentionResults.length]);

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    setMsgBody(value);
    const cursor = e.target.selectionStart ?? value.length;
    const textBeforeCursor = value.slice(0, cursor);
    const mentionMatch = textBeforeCursor.match(/@([^@\s]*)$/);
    if (mentionMatch) {
      setMentionQuery(mentionMatch[1]);
      setMentionIndex(0);
    } else {
      setMentionQuery(null);
    }
    // Throttled typing indicator (at most once per 2 s)
    if (value.trim() && user) {
      const now = Date.now();
      if (now - lastTypingSentRef.current > 2_000) {
        lastTypingSentRef.current = now;
        postTyping(activeChannelId, user.name).catch(() => {});
      }
    }
  }

  function selectMention(member: ApiChannelMember) {
    const cursor = inputRef.current?.selectionStart ?? msgBody.length;
    const textBeforeCursor = msgBody.slice(0, cursor);
    const mentionMatch = textBeforeCursor.match(/@([^@\s]*)$/);
    if (!mentionMatch) return;
    const start = cursor - mentionMatch[0].length;
    // Group mentions (id < 0) use bare @keyword syntax; individual members use @[Name](id)
    const replacement =
      member.id < 0 ? `@${member.name} ` : `@[${member.name}](${member.id}) `;
    const newBody =
      msgBody.slice(0, start) + replacement + msgBody.slice(cursor);
    setMsgBody(newBody);
    setMentionQuery(null);
    setMentionIndex(0);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  async function sendMessage() {
    if (!msgBody.trim()) return;
    await onSend(msgBody.trim());
    setMsgBody("");
    setMentionQuery(null);
  }

  const accentColor =
    activeChannel?.type === "all_members" ? "bg-brand-red" : "bg-brand-teal";
  const outgoingColor = "bg-brand-blue";

  // ── Day grouping helper ───────────────────────────────────────────────────
  function dayLabel(date: Date) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
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

  const messageGroups = useMemo(() => {
    const groups: { label: string; msgs: ApiMessage[] }[] = [];
    for (const msg of messages) {
      const label = dayLabel(new Date(msg.sent_at));
      const last = groups[groups.length - 1];
      if (last && last.label === label) {
        last.msgs.push(msg);
      } else {
        groups.push({ label, msgs: [msg] });
      }
    }
    return groups;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  return (
    <div className="bg-white rounded-xl border border-neutral-200 p-6 flex flex-col gap-4 shadow-sm">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <MessagesSquare className="size-5 text-neutral-900 shrink-0" />
          <h2 className="font-semibold text-base text-neutral-900">
            Medlemschat
          </h2>
        </div>
        {!hideChannelSelector && (
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
        )}
      </div>

      <div
        className={`relative grid gap-4 h-105 ${
          hideChannelSelector
            ? "grid-cols-1"
            : "grid-cols-1 md:grid-cols-[1fr_2fr]"
        }`}
      >
        {/* Mobile backdrop */}
        {!hideChannelSelector && showChannelDrawer && (
          <div
            className="md:hidden absolute inset-0 z-10 bg-black/30 rounded-lg"
            onClick={() => setShowChannelDrawer(false)}
          />
        )}

        {/* Channel sidebar */}
        {!hideChannelSelector && (
          <div
            className={`flex flex-col overflow-hidden border border-neutral-200 rounded-lg md:flex ${
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
                    ch?.type === "all_members"
                      ? "var(--color-brand-red)"
                      : "var(--color-brand-teal)";
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
                {loading
                  ? Array.from({ length: 4 }).map((_, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-3 px-3 py-2 rounded-lg"
                      >
                        <Skeleton className="w-8 h-8 rounded-full shrink-0" />
                        <div className="flex flex-col gap-1.5 flex-1">
                          <Skeleton className="h-3.5 w-24 rounded" />
                          <Skeleton className="h-3 w-16 rounded" />
                        </div>
                      </div>
                    ))
                  : channels.map((ch) => {
                      const msgs = messageMap[ch.id] ?? [];
                      const latestId = Math.max(0, ...msgs.map((m) => m.id));
                      const unread =
                        ch.id !== activeChannelId &&
                        latestId > (lastSeenIds[ch.id] ?? 0);
                      const lastMsgObj =
                        [...msgs].reverse().find((m) => !m.is_deleted) ?? null;
                      const lastMsg = lastMsgObj
                        ? lastMsgObj.type === "shift_swap"
                          ? "📅 Vagtvagt"
                          : lastMsgObj.body
                        : "";
                      const lastTime = lastMsgObj
                        ? (() => {
                            const d = new Date(lastMsgObj.sent_at);
                            const now = new Date();
                            const diffDays = Math.floor(
                              (now.getTime() - d.getTime()) / 86_400_000,
                            );
                            if (diffDays === 0)
                              return d.toLocaleTimeString("da-DK", {
                                hour: "2-digit",
                                minute: "2-digit",
                              });
                            if (diffDays < 7)
                              return d.toLocaleDateString("da-DK", {
                                weekday: "short",
                              });
                            return d.toLocaleDateString("da-DK", {
                              day: "numeric",
                              month: "numeric",
                            });
                          })()
                        : "";
                      return (
                        <GroupChatItem
                          key={ch.id}
                          active={activeChannelId === ch.id}
                          name={ch.name}
                          color={ch.type === "all_members" ? "red" : "teal"}
                          badgeLabel={
                            ch.type === "all_members" ? "Fælles" : "Vagter"
                          }
                          badgeColor={
                            ch.type === "all_members" ? "red" : "teal"
                          }
                          lastMsg={lastMsg}
                          lastTime={lastTime}
                          unread={unread}
                          onClick={() => {
                            setLastSeenIds((prev) => ({
                              ...prev,
                              [ch.id]: latestId,
                            }));
                            setActiveChannelId(ch.id);
                            setShowChannelSearch(false);
                            setChannelSearch("");
                            setShowChannelDrawer(false);
                          }}
                        />
                      );
                    })}
              </div>
            )}
          </div>
        )}

        {/* Chat window */}
        <div className="border border-neutral-200 rounded-lg flex flex-col overflow-hidden">
          {/* Window header */}
          <div className="border-b border-neutral-200 flex p-3 justify-between items-center shrink-0">
            <div className="flex items-center gap-3">
              {!hideChannelSelector && (
                <button
                  onClick={() => setShowChannelDrawer(true)}
                  className="md:hidden flex items-center gap-1.5 px-2.5 h-8 rounded-md border border-neutral-200 bg-white text-neutral-600 text-xs font-medium hover:bg-neutral-50 transition-colors cursor-pointer shrink-0"
                  aria-label="Åbn samtaler"
                >
                  <MessagesSquare className="size-3.5" />
                  Samtaler
                </button>
              )}
              <div
                className={`w-10 h-10 rounded-full text-white flex items-center justify-center shrink-0 ${
                  activeChannel?.type === "all_members"
                    ? "bg-brand-red"
                    : "bg-brand-teal"
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
                      ? "text-brand-red"
                      : "text-brand-teal"
                  }`}
                >
                  {activeChannel?.type === "all_members"
                    ? "Fælles kanal"
                    : "Kun for vagter"}
                </span>
              </div>
            </div>
          </div>

          {/* Message list */}
          <div className="relative flex flex-col flex-1 overflow-hidden">
            {isScrolledUp && (
              <button
                onClick={() => {
                  const el = messagesContainerRef.current;
                  if (el) el.scrollTop = el.scrollHeight;
                }}
                aria-label="Scroll til bunden"
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
              role="log"
              aria-live="polite"
              aria-label="Beskeder"
              className="bg-neutral-50/40 flex p-4 flex-col flex-1 gap-3 overflow-y-auto"
            >
              {loading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <div
                      key={i}
                      className={`flex items-end gap-2 ${i % 2 === 0 ? "flex-row-reverse" : ""}`}
                    >
                      <Skeleton className="w-7 h-7 rounded-full shrink-0" />
                      <Skeleton
                        className={`h-10 rounded-2xl ${i % 2 === 0 ? "w-40" : "w-52"}`}
                      />
                    </div>
                  ))
                : messageGroups.map((group) => (
                    <MessageGroup
                      key={group.label}
                      group={group}
                      user={user}
                      nights={nights}
                      highlightMessageId={highlightMessageId}
                      outgoingColor={outgoingColor}
                      accentColor={accentColor}
                      onSwapConfirm={setSwapConfirmMsg}
                      onEdit={onEdit}
                      onDelete={onDelete}
                    />
                  ))}
              {/* Typing indicator */}
              {(typingUsers[activeChannelId] ?? []).length > 0 && (
                <div
                  aria-live="polite"
                  className="flex items-center gap-2 pl-1 text-xs text-neutral-400 italic"
                >
                  <span className="flex gap-0.5">
                    <span className="w-1.5 h-1.5 bg-neutral-400 rounded-full animate-bounce [animation-delay:0ms]" />
                    <span className="w-1.5 h-1.5 bg-neutral-400 rounded-full animate-bounce [animation-delay:150ms]" />
                    <span className="w-1.5 h-1.5 bg-neutral-400 rounded-full animate-bounce [animation-delay:300ms]" />
                  </span>
                  {(typingUsers[activeChannelId] ?? [])
                    .map((t) => t.name)
                    .join(" og ")}{" "}
                  skriver…
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
          </div>

          {/* Input bar */}
          <div className="border-t border-neutral-200 flex p-3 items-center gap-2 shrink-0">
            <div className="flex-1 relative" ref={mentionContainerRef}>
              {mentionQuery !== null &&
                mentionResults.length > 0 &&
                dropdownRect &&
                createPortal(
                  <div
                    style={{
                      position: "fixed",
                      left: dropdownRect.left,
                      width: dropdownRect.width,
                      ...(mentionDropsDown
                        ? { top: dropdownRect.bottom + 4 }
                        : {
                            bottom: window.innerHeight - dropdownRect.top + 4,
                          }),
                      zIndex: 9999,
                      background: "white",
                      border: "1px solid #e5e7eb",
                      borderRadius: 12,
                      boxShadow: "0 4px 24px rgba(0,0,0,0.10)",
                      overflow: "hidden",
                    }}
                  >
                    {mentionResults.map((member, i) => (
                      <button
                        key={member.id}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          selectMention(member);
                        }}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors border-none bg-transparent cursor-pointer ${
                          i === mentionIndex
                            ? "bg-neutral-100"
                            : "hover:bg-neutral-50"
                        }`}
                      >
                        {member.id < 0 ? (
                          <div
                            className="w-6 h-6 rounded-full text-white flex items-center justify-center shrink-0"
                            style={{
                              background:
                                member.name === "vagter"
                                  ? "#166534"
                                  : "#9d174d",
                              fontSize: "0.5rem",
                              fontWeight: 700,
                            }}
                          >
                            {member.name === "vagter" ? "VAG" : "ALL"}
                          </div>
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-brand-red text-white flex items-center justify-center text-[0.55rem] font-bold shrink-0 overflow-hidden">
                            {member.has_avatar ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={`/api/members/${member.id}/avatar`}
                                alt={member.initials}
                                width={24}
                                height={24}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              member.initials
                            )}
                          </div>
                        )}
                        <span className="font-medium text-neutral-900">
                          @{member.name}
                        </span>
                        {member.id < 0 && (
                          <span className="text-neutral-400 text-xs ml-auto">
                            {member.name === "vagter"
                              ? "Alle vagter"
                              : "Alle medlemmer"}
                          </span>
                        )}
                        {member.id >= 0 && (
                          <span className="text-neutral-400 text-xs ml-auto">
                            {member.initials}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>,
                  document.body,
                )}
              <input
                ref={inputRef}
                aria-label={`Skriv til ${activeChannel?.name?.toLowerCase() ?? "gruppen"}`}
                className="w-full h-10 border border-neutral-200 rounded-lg px-3 text-sm outline-none font-[inherit] bg-transparent placeholder:text-neutral-400 focus:border-neutral-900"
                placeholder={`Skriv til ${activeChannel?.name?.toLowerCase() ?? "gruppen"}…`}
                value={msgBody}
                onChange={handleInputChange}
                onKeyDown={(e) => {
                  if (mentionQuery !== null && mentionResults.length > 0) {
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      setMentionIndex((i) => (i + 1) % mentionResults.length);
                      return;
                    }
                    if (e.key === "ArrowUp") {
                      e.preventDefault();
                      setMentionIndex(
                        (i) =>
                          (i - 1 + mentionResults.length) %
                          mentionResults.length,
                      );
                      return;
                    }
                    if (e.key === "Enter" || e.key === "Tab") {
                      e.preventDefault();
                      selectMention(mentionResults[mentionIndex]);
                      return;
                    }
                    if (e.key === "Escape") {
                      setMentionQuery(null);
                      return;
                    }
                  }
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                onBlur={() => setTimeout(() => setMentionQuery(null), 150)}
              />
            </div>
            <button
              onClick={sendMessage}
              aria-label="Send besked"
              className={`inline-flex items-center justify-center w-10 h-10 rounded-lg text-white transition-colors border-none cursor-pointer shrink-0 ${
                activeChannel?.type === "all_members"
                  ? "bg-brand-red hover:bg-red-600"
                  : "bg-brand-teal hover:bg-teal-600"
              }`}
            >
              <Send className="size-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
