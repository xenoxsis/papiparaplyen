"use client";

import { ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";

export function MemberHero({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const name = user?.name ?? "Gæst";
  const initials = user?.initials ?? "?";

  const isAdmin = user?.roles?.includes("Administrator");
  const isVagt = user?.roles?.includes("Vagt");

  const roleBadge = isAdmin ? (
    <span className="bg-[#f4a261] text-neutral-900 text-xs font-medium px-2 py-0.5 rounded-full">
      Administrator
    </span>
  ) : isVagt ? (
    <span className="bg-[#2a9d8f] text-white text-xs font-medium px-2 py-0.5 rounded-full">
      Vagt
    </span>
  ) : null;

  const roleLabel = isAdmin ? "Administrator" : isVagt ? "Vagt" : "Medlem";

  return (
    <div className="bg-neutral-900 rounded-2xl text-white p-6 flex justify-between items-center gap-6">
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-full border-2 border-[#e63946] bg-[#e63946] text-white flex items-center justify-center text-lg font-bold tracking-wider select-none shrink-0">
          {initials}
        </div>
        <div className="flex flex-col gap-1">
          <span className="uppercase text-white/60 text-xs tracking-wider">
            Velkommen tilbage
          </span>
          <h1 className="font-bold text-2xl text-white">{name}</h1>
          <div className="flex items-center gap-2">
            {roleBadge ?? (
              <span className="text-white/70 text-sm">{roleLabel}</span>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-6 shrink-0">{children}</div>
    </div>
  );
}
