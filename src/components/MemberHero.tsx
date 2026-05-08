"use client";

import { ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";

export function MemberHero({
  children,
  action,
}: {
  children: ReactNode;
  action?: ReactNode;
}) {
  const { user } = useAuth();
  const name = user?.name ?? "Gæst";
  const initials = user?.initials ?? "?";

  const isAdmin = user?.roles?.includes("Administrator");
  const isVagt = user?.roles?.includes("Vagt");

  const roleBadge = isAdmin ? (
    <span className="bg-brand-orange text-neutral-900 text-xs font-medium px-2 py-0.5 rounded-full">
      Administrator
    </span>
  ) : isVagt ? (
    <span className="bg-brand-teal text-white text-xs font-medium px-2 py-0.5 rounded-full">
      Vagt
    </span>
  ) : null;

  const roleLabel = isAdmin ? "Administrator" : isVagt ? "Vagt" : "Medlem";

  return (
    <div className="bg-neutral-900 rounded-2xl text-white p-6 flex flex-col sm:flex-row justify-between items-center gap-4 sm:gap-6">
      <div className="flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left">
        <div className="w-16 h-16 rounded-full border-2 border-brand-red bg-brand-red text-white flex items-center justify-center text-lg font-bold tracking-wider select-none shrink-0">
          {initials}
        </div>
        <div className="flex flex-col gap-1">
          <span className="uppercase text-white/60 text-xs tracking-wider">
            Velkommen tilbage
          </span>
          <h1 className="font-bold text-2xl text-white">{name}</h1>
          <div className="flex items-center justify-center sm:justify-start gap-2">
            {roleBadge ?? (
              <span className="text-white/70 text-sm">{roleLabel}</span>
            )}
          </div>
        </div>
      </div>
      {/* On mobile: action sits between name and counters */}
      {action && <div className="sm:hidden">{action}</div>}
      <div className="flex items-center justify-center sm:justify-start gap-4 sm:gap-6 shrink-0 flex-wrap">
        {children}
        {/* On desktop: action sits after the counters */}
        {action && <div className="hidden sm:block">{action}</div>}
      </div>
    </div>
  );
}
