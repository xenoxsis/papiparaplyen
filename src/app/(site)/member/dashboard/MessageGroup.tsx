"use client";

import { memo, useState, useRef } from "react";
import { Pencil, RefreshCcw, Trash2, Reply } from "lucide-react";
import { renderMessageBody } from "@/lib/renderMentions";
import { Modal } from "@/components/Modal";
import type { ApiClubNight, ApiMessage } from "@/lib/api";
import type { User } from "@/lib/auth-context";

export interface MessageGroupData {
  label: string;
  msgs: ApiMessage[];
}

interface MessageGroupProps {
  group: MessageGroupData;
  user: User | null;
  nights: ApiClubNight[];
  highlightMessageId: number | null;
  outgoingColor: string;
  accentColor: string;
  onSwapConfirm: (msg: ApiMessage) => void;
  onEdit: (msg: ApiMessage, newBody: string) => Promise<void>;
  onDelete: (msg: ApiMessage) => Promise<void>;
  onReply: (msg: ApiMessage) => void;
  onScrollToMessage: (messageId: number) => void;
}

export const MessageGroup = memo(function MessageGroup({
  group,
  user,
  nights,
  highlightMessageId,
  outgoingColor,
  accentColor,
  onSwapConfirm,
  onEdit,
  onDelete,
  onReply,
  onScrollToMessage,
}: MessageGroupProps) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editBody, setEditBody] = useState("");
  const [deletingMsg, setDeletingMsg] = useState<ApiMessage | null>(null);
  const [saving, setSaving] = useState(false);
  const editInputRef = useRef<HTMLTextAreaElement>(null);

  function startEdit(msg: ApiMessage) {
    setEditingId(msg.id);
    setEditBody(msg.body);
    setTimeout(() => {
      editInputRef.current?.focus();
      editInputRef.current?.select();
    }, 0);
  }

  async function commitEdit(msg: ApiMessage) {
    const trimmed = editBody.trim();
    if (!trimmed || trimmed === msg.body) {
      setEditingId(null);
      return;
    }
    setSaving(true);
    try {
      await onEdit(msg, trimmed);
    } finally {
      setSaving(false);
      setEditingId(null);
    }
  }

  async function confirmDelete() {
    if (!deletingMsg) return;
    setSaving(true);
    try {
      await onDelete(deletingMsg);
    } finally {
      setSaving(false);
      setDeletingMsg(null);
    }
  }

  return (
    <>
      <Modal
        open={!!deletingMsg}
        onClose={() => setDeletingMsg(null)}
        panelClassName="p-6"
      >
        <h2 className="text-base font-semibold text-neutral-900 mb-3">
          Slet besked
        </h2>
        <p className="text-sm text-neutral-600 mb-4">
          Er du sikker på, at du vil slette denne besked? Det kan ikke
          fortrydes.
        </p>
        <div className="flex justify-end gap-2">
          <button
            onClick={() => setDeletingMsg(null)}
            className="px-3 py-1.5 rounded-lg border border-neutral-200 text-sm text-neutral-600 hover:bg-neutral-50 transition-colors cursor-pointer"
          >
            Annuller
          </button>
          <button
            onClick={confirmDelete}
            disabled={saving}
            className="px-3 py-1.5 rounded-lg bg-red-500 text-white text-sm font-semibold hover:bg-red-600 transition-colors cursor-pointer disabled:opacity-50"
          >
            {saving ? "Sletter…" : "Slet"}
          </button>
        </div>
      </Modal>
      <div className="flex flex-col gap-3">
        {/* Day separator */}
        <div className="flex justify-center">
          <span className="bg-white border border-neutral-200 rounded-full px-2 py-0.5 text-[0.625rem] text-neutral-500">
            {group.label}
          </span>
        </div>

        {group.msgs.map((msg) => {
          const outgoing = msg.sender_id === user?.id;
          const timeStr = new Date(msg.sent_at).toLocaleTimeString("da-DK", {
            hour: "2-digit",
            minute: "2-digit",
          });
          const isEditing = editingId === msg.id;
          const canEditDelete =
            outgoing && !msg.is_deleted && msg.type !== "shift_swap";
          const canReply = !msg.is_deleted && msg.type !== "shift_swap";

          // ── Reply quote helper ───────────────────────────────────────────
          const replyQuote = msg.reply_to_id ? (
            <button
              onClick={() => onScrollToMessage(msg.reply_to_id!)}
              className={`flex flex-col text-left rounded-lg px-3 py-1.5 mb-1 max-w-full border-l-2 bg-neutral-50 hover:bg-neutral-100 transition-colors cursor-pointer border-none ${
                outgoing ? "border-white/60" : "border-brand-blue"
              }`}
            >
              <span className="text-[0.6rem] font-semibold text-neutral-500 mb-0.5">
                ↩ {msg.reply_to_sender_name ?? "Ukendt"}
              </span>
              <span className="text-[0.7rem] text-neutral-500 truncate max-w-[20rem]">
                {msg.reply_to_is_deleted
                  ? "Besked slettet"
                  : (msg.reply_to_body ?? "")}
              </span>
            </button>
          ) : null;

          // ── Soft-deleted ─────────────────────────────────────────────────
          if (msg.is_deleted) {
            return (
              <div
                key={msg.id}
                data-msg-id={msg.id}
                className={`flex ${outgoing ? "justify-end" : ""} px-1`}
              >
                <span className="text-xs italic text-neutral-400">
                  Besked slettet
                </span>
              </div>
            );
          }

          // ── Swap card ────────────────────────────────────────────────────
          if (msg.type === "shift_swap") {
            const swapNight = nights.find((n) => n.id === msg.shift_night_id);
            const userOptedOut =
              !!user &&
              !!swapNight &&
              swapNight.opted_out_members.some((o) => o.id === user.id);
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
                className={`flex ${outgoing ? "justify-end" : ""} rounded-xl transition-colors duration-700 ${
                  highlightMessageId === msg.id ? "bg-yellow-50" : ""
                }`}
              >
                <div className="border border-neutral-200 bg-white rounded-xl p-3 flex flex-col gap-2 max-w-xs w-full shadow-sm">
                  <div className="flex items-center gap-2">
                    <RefreshCcw className="size-3.5 text-brand-teal shrink-0" />
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
                        {new Date(swapNight.date).toLocaleDateString("da-DK", {
                          day: "numeric",
                          month: "short",
                        })}
                      </span>
                    </p>
                  )}
                  <p className="text-xs text-neutral-600 leading-snug">
                    {user ? renderMessageBody(msg.body, user.id) : msg.body}
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
                          onClick={() => onSwapConfirm(msg)}
                          className="mt-1 w-full h-8 rounded-lg bg-brand-teal text-white text-xs font-semibold hover:bg-teal-700 transition-colors cursor-pointer border-none"
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
                    <span className="text-[0.65rem] font-semibold text-brand-teal">
                      ✓ Taget af {msg.taken_by_name}
                    </span>
                  )}
                  {msg.swap_status === "cancelled" && (
                    <span className="text-[0.65rem] text-neutral-400 italic">
                      {user ? renderMessageBody(msg.body, user.id) : msg.body}
                    </span>
                  )}
                </div>
              </div>
            );
          }

          // ── Outgoing bubble ──────────────────────────────────────────────
          if (outgoing) {
            return (
              <div
                key={msg.id}
                data-msg-id={msg.id}
                className={`group flex justify-end items-end rounded-xl px-1 transition-colors duration-700 ${
                  highlightMessageId === msg.id ? "bg-yellow-50" : ""
                }`}
              >
                {!isEditing && (
                  <div className="flex items-center gap-1 mr-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    {canReply && (
                      <button
                        onClick={() => onReply(msg)}
                        aria-label="Svar på besked"
                        className="w-6 h-6 flex items-center justify-center rounded-md text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors cursor-pointer"
                      >
                        <Reply className="size-3" />
                      </button>
                    )}
                    {canEditDelete && (
                      <>
                        <button
                          onClick={() => startEdit(msg)}
                          aria-label="Rediger besked"
                          className="w-6 h-6 flex items-center justify-center rounded-md text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors cursor-pointer"
                        >
                          <Pencil className="size-3" />
                        </button>
                        <button
                          onClick={() => setDeletingMsg(msg)}
                          aria-label="Slet besked"
                          className="w-6 h-6 flex items-center justify-center rounded-md text-neutral-400 hover:text-red-500 hover:bg-red-50 transition-colors cursor-pointer"
                        >
                          <Trash2 className="size-3" />
                        </button>
                      </>
                    )}
                  </div>
                )}
                <div className="flex flex-col items-end gap-1 max-w-md">
                  {replyQuote && (
                    <div className="flex flex-col items-end w-full">
                      {replyQuote}
                    </div>
                  )}
                  {isEditing ? (
                    <div className="flex flex-col gap-1 w-full">
                      <textarea
                        ref={editInputRef}
                        value={editBody}
                        onChange={(e) => setEditBody(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") setEditingId(null);
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            commitEdit(msg);
                          }
                        }}
                        rows={2}
                        className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg resize-none outline-none focus:border-neutral-900 font-[inherit]"
                      />
                      <div className="flex gap-1 justify-end text-xs">
                        <button
                          onClick={() => setEditingId(null)}
                          className="px-2 py-0.5 rounded text-neutral-500 hover:bg-neutral-100 cursor-pointer"
                        >
                          Annuller
                        </button>
                        <button
                          onClick={() => commitEdit(msg)}
                          disabled={saving}
                          className="px-2 py-0.5 rounded bg-neutral-900 text-white font-semibold hover:opacity-90 cursor-pointer disabled:opacity-50"
                        >
                          Gem
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      className={`px-4 py-2 text-sm text-white rounded-[1rem_1rem_0.25rem_1rem] ${outgoingColor}`}
                    >
                      {user ? renderMessageBody(msg.body, user.id) : msg.body}
                    </div>
                  )}
                  <div className="flex items-center gap-1 pr-2">
                    {msg.edited_at && (
                      <span className="text-[0.6rem] text-neutral-400 italic">
                        (redigeret)
                      </span>
                    )}
                    <span className="text-[0.625rem] text-neutral-500">
                      {timeStr}
                    </span>
                  </div>
                </div>
              </div>
            );
          }

          // ── Incoming bubble ──────────────────────────────────────────────
          return (
            <div
              key={msg.id}
              data-msg-id={msg.id}
              className={`group flex flex-col gap-0.5 rounded-xl px-1 transition-colors duration-700 ${
                highlightMessageId === msg.id ? "bg-yellow-50" : ""
              }`}
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
                  {replyQuote}
                  <div className="px-4 py-2 text-sm bg-white border border-neutral-200 rounded-[1rem_1rem_1rem_0.25rem]">
                    {user ? renderMessageBody(msg.body, user.id) : msg.body}
                  </div>
                </div>
                {canReply && (
                  <button
                    onClick={() => onReply(msg)}
                    aria-label="Svar på besked"
                    className="mb-0.5 w-6 h-6 flex items-center justify-center rounded-md text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors cursor-pointer opacity-0 group-hover:opacity-100"
                  >
                    <Reply className="size-3" />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-1 pl-9">
                {msg.edited_at && (
                  <span className="text-[0.6rem] text-neutral-400 italic">
                    (redigeret)
                  </span>
                )}
                <span className="text-[0.625rem] text-neutral-500">
                  {timeStr}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
});
