"use client";

import { useEffect, useRef, useState } from "react";
import {
  AtSign,
  Bell,
  CheckCheck,
  Clock,
  Repeat2,
  Shield,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { ApiNotification, NotificationType } from "@/lib/api";

interface Props {
  notifications: ApiNotification[];
  unreadCount: number;
  onMarkRead: (id: number) => void;
  onMarkAllRead: () => void;
}

const typeIcon: Record<NotificationType, React.ReactNode> = {
  swap_requested: <Repeat2 className="size-4 text-blue-500 shrink-0" />,
  swap_accepted: <CheckCheck className="size-4 text-green-500 shrink-0" />,
  swap_cancelled: <X className="size-4 text-neutral-400 shrink-0" />,
  shift_assigned: <Shield className="size-4 text-brand-red shrink-0" />,
  nights_added: <Clock className="size-4 text-orange-400 shrink-0" />,
  mentioned: <AtSign className="size-4 text-purple-500 shrink-0" />,
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Lige nu";
  if (mins < 60) return `${mins} min siden`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} t siden`;
  const days = Math.floor(hrs / 24);
  return `${days} dag${days !== 1 ? "e" : ""} siden`;
}

export default function NotificationBell({
  notifications,
  unreadCount,
  onMarkRead,
  onMarkAllRead,
}: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  function handleNotificationClick(n: ApiNotification) {
    if (!n.is_read) onMarkRead(n.id);
    setOpen(false);
    if (n.link) router.push(n.link);
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative flex items-center justify-center w-9 h-9 rounded-full text-neutral-600 hover:bg-neutral-100 transition-colors"
        aria-label="Notifikationer"
      >
        <Bell className="size-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 min-w-[1rem] h-4 px-0.5 rounded-full bg-brand-red text-white text-[0.6rem] font-bold flex items-center justify-center leading-none">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white border border-neutral-200 rounded-xl shadow-lg overflow-hidden z-50">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100">
            <span className="font-semibold text-sm text-neutral-900">
              Notifikationer
              {unreadCount > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-brand-red/10 text-brand-red text-xs font-bold">
                  {unreadCount}
                </span>
              )}
            </span>
            {unreadCount > 0 && (
              <button
                onClick={() => {
                  onMarkAllRead();
                }}
                className="text-xs text-neutral-500 hover:text-neutral-900 transition-colors"
              >
                Marker alle som læst
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-96 overflow-y-auto divide-y divide-neutral-50">
            {notifications.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-neutral-400">
                Ingen notifikationer
              </p>
            ) : (
              notifications.slice(0, 10).map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleNotificationClick(n)}
                  className={`w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-neutral-50 transition-colors ${
                    !n.is_read ? "bg-blue-50/50" : ""
                  }`}
                >
                  <div className="mt-0.5">
                    {typeIcon[n.type] ?? (
                      <Bell className="size-4 text-neutral-400 shrink-0" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-sm leading-snug ${
                        !n.is_read
                          ? "text-neutral-900 font-medium"
                          : "text-neutral-600"
                      }`}
                    >
                      {n.body}
                    </p>
                    <p className="text-xs text-neutral-400 mt-0.5">
                      {relativeTime(n.created_at)}
                    </p>
                  </div>
                  {!n.is_read && (
                    <span className="mt-1.5 w-2 h-2 rounded-full bg-brand-red shrink-0" />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
