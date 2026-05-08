import { memo } from "react";
import { RefreshCcw } from "lucide-react";
import { renderMessageBody } from "@/lib/renderMentions";
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
}

export const MessageGroup = memo(function MessageGroup({
  group,
  user,
  nights,
  highlightMessageId,
  outgoingColor,
  accentColor,
  onSwapConfirm,
}: MessageGroupProps) {
  return (
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
              className={`flex justify-end items-end rounded-xl px-1 transition-colors duration-700 ${
                highlightMessageId === msg.id ? "bg-yellow-50" : ""
              }`}
            >
              <div className="flex flex-col items-end gap-1 max-w-md">
                <div
                  className={`px-4 py-2 text-sm text-white rounded-[1rem_1rem_0.25rem_1rem] ${outgoingColor}`}
                >
                  {user ? renderMessageBody(msg.body, user.id) : msg.body}
                </div>
                <span className="text-[0.625rem] text-neutral-500 pr-2">
                  {timeStr}
                </span>
              </div>
            </div>
          );
        }

        // ── Incoming bubble ──────────────────────────────────────────────
        return (
          <div
            key={msg.id}
            data-msg-id={msg.id}
            className={`flex flex-col gap-0.5 rounded-xl px-1 transition-colors duration-700 ${
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
                <div className="px-4 py-2 text-sm bg-white border border-neutral-200 rounded-[1rem_1rem_1rem_0.25rem]">
                  {user ? renderMessageBody(msg.body, user.id) : msg.body}
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
  );
});
