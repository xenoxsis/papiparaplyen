import { Users } from "lucide-react";

interface GroupChatItemProps {
  active: boolean;
  name: string;
  color: "red" | "teal";
  badgeLabel: string;
  badgeColor: "red" | "teal";
  lastMsg: string;
  lastTime: string;
  unread?: boolean;
  onClick: () => void;
}

export function GroupChatItem({
  active,
  name,
  color,
  badgeLabel,
  badgeColor,
  lastMsg,
  lastTime,
  unread,
  onClick,
}: GroupChatItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left flex p-2 items-center gap-3 rounded-md transition-colors border-b ${
        color === "red"
          ? `bg-red-50 border-red-100 ${active ? "bg-red-100" : "hover:bg-red-100"}`
          : `bg-teal-50 border-teal-100 ${active ? "bg-teal-100" : "hover:bg-teal-100"}`
      }`}
    >
      <div
        className={`relative w-9 h-9 rounded-full text-white flex items-center justify-center shrink-0 ${
          color === "red" ? "bg-brand-red" : "bg-brand-teal"
        }`}
      >
        <Users className="size-4" />
        {unread && (
          <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-brand-red border-2 border-white" />
        )}
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
            ? "text-brand-red bg-red-100"
            : "text-brand-teal bg-teal-100"
        }`}
      >
        {badgeLabel}
      </span>
    </button>
  );
}
