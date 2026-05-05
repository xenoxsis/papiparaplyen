"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  UserX,
  UserCheck,
  Search,
  Users,
  X,
} from "lucide-react";
import { MemberHero } from "@/components/MemberHero";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  getMembers,
  patchMember,
  putMemberRoles,
  type ApiMember,
} from "@/lib/api";

type Role = "Vagt" | "Administrator";

const ROLE_STYLES: Record<Role, string> = {
  Vagt: "bg-[#2a9d8f]/10 text-[#2a9d8f]",
  Administrator: "bg-[#f4a261]/15 text-[#d4751a]",
};

export default function AdminPage() {
  const [members, setMembers] = useState<ApiMember[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"alle" | Role | "banned">("alle");
  const [pendingBan, setPendingBan] = useState<ApiMember | null>(null);

  useEffect(() => {
    getMembers().then(setMembers).catch(console.error);
  }, []);

  async function toggleRole(id: number, role: Role) {
    const m = members.find((m) => m.id === id);
    if (!m) return;
    const hasRole = m.roles.includes(role);
    const rolesForApi = (
      hasRole ? m.roles.filter((r) => r !== role) : [...m.roles, role]
    ).filter((r) => r === "Vagt" || r === "Administrator");
    try {
      const updated = await putMemberRoles(id, rolesForApi);
      setMembers((prev) => prev.map((m) => (m.id === id ? updated : m)));
    } catch (err) {
      console.error(err);
    }
  }

  async function toggleBan(id: number) {
    const m = members.find((m) => m.id === id);
    if (!m) return;
    try {
      const updated = await patchMember(id, { banned: !m.banned });
      setMembers((prev) => prev.map((m) => (m.id === id ? updated : m)));
    } catch (err) {
      console.error(err);
    }
  }

  const filtered = members.filter((m) => {
    const matchesSearch =
      m.name.toLowerCase().includes(search.toLowerCase()) ||
      m.email.toLowerCase().includes(search.toLowerCase());
    if (!matchesSearch) return false;
    if (filter === "banned") return m.banned;
    if (filter === "alle") return !m.banned;
    return m.roles.includes(filter) && !m.banned;
  });

  function handleBanClick(m: ApiMember) {
    if (m.banned) {
      toggleBan(m.id);
    } else {
      setPendingBan(m);
    }
  }

  function confirmBan() {
    if (pendingBan) toggleBan(pendingBan.id);
    setPendingBan(null);
  }

  const counts = {
    alle: members.filter((m) => !m.banned).length,
    Vagt: members.filter((m) => m.roles.includes("Vagt") && !m.banned).length,
    Administrator: members.filter(
      (m) => m.roles.includes("Administrator") && !m.banned,
    ).length,
    banned: members.filter((m) => m.banned).length,
  };

  return (
    <main className="bg-neutral-100 min-h-[calc(100vh-3.5rem)] p-8 flex flex-col gap-8">
      {/* Confirm ban dialog */}
      {pendingBan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 flex flex-col gap-4">
            <div className="flex items-start justify-between gap-4">
              <div className="w-10 h-10 rounded-full bg-[#e63946]/10 flex items-center justify-center shrink-0">
                <AlertTriangle className="size-5 text-[#e63946]" />
              </div>
              <button
                onClick={() => setPendingBan(null)}
                className="text-neutral-400 hover:text-neutral-700 transition-colors mt-0.5"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="flex flex-col gap-1">
              <h2 className="font-semibold text-neutral-900">Udeluk medlem?</h2>
              <p className="text-sm text-neutral-500">
                Er du sikker på, at du vil udelukke{" "}
                <span className="font-medium text-neutral-900">
                  {pendingBan.name}
                </span>
                ? Medlemmet mister adgang til alle funktioner.
              </p>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setPendingBan(null)}>
                Annullér
              </Button>
              <Button
                onClick={confirmBan}
                className="bg-[#e63946] hover:bg-red-600 text-white gap-2"
              >
                <UserX className="size-4" />
                Udeluk
              </Button>
            </div>
          </div>
        </div>
      )}
      <MemberHero>
        <div className="flex flex-col items-center">
          <span className="font-bold text-2xl text-[#f4a261]">
            {members.filter((m) => !m.banned).length}
          </span>
          <span className="text-white/60 text-xs">Aktive medlemmer</span>
        </div>
        <div className="bg-white/20 w-px h-10" />
        <div className="flex flex-col items-center">
          <span className="font-bold text-2xl text-[#2a9d8f]">
            {counts.Vagt}
          </span>
          <span className="text-white/60 text-xs">Vagter</span>
        </div>
        <div className="bg-white/20 w-px h-10" />
        <div className="flex flex-col items-center">
          <span className="font-bold text-[#e63946] text-2xl">
            {counts.banned}
          </span>
          <span className="text-white/60 text-xs">Udelukkede</span>
        </div>
      </MemberHero>

      <div className="bg-white rounded-xl border border-neutral-200 p-6 flex flex-col gap-4 shadow-sm">
        {/* Toolbar */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Users className="size-5" />
            <h2 className="font-semibold text-base text-neutral-900">
              Medlemsoversigt
            </h2>
          </div>

          <div className="relative w-72">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
            <Input
              placeholder="Søg navn eller e-mail…"
              className="pl-9 h-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Filter chips */}
        <div className="flex items-center gap-2 flex-wrap">
          {(["alle", "Vagt", "Administrator", "banned"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-xs font-medium px-3 py-1 rounded-full transition-colors border ${
                filter === f
                  ? "bg-neutral-900 text-white border-neutral-900"
                  : "bg-white text-neutral-600 border-neutral-200 hover:border-neutral-400"
              }`}
            >
              {f === "alle" ? "Alle aktive" : f === "banned" ? "Udelukkede" : f}
              <span className="ml-1.5 opacity-60">
                {f === "alle"
                  ? counts.alle
                  : f === "banned"
                    ? counts.banned
                    : counts[f]}
              </span>
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-100 text-left text-xs text-neutral-500 uppercase tracking-wider">
                <th className="pb-2 pr-4 font-medium">Medlem</th>
                <th className="pb-2 pr-4 font-medium">E-mail</th>
                <th className="pb-2 pr-4 font-medium">Tilmeldt</th>
                <th className="pb-2 pr-4 font-medium">Rolle</th>
                <th className="pb-2 font-medium">Handlinger</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="py-8 text-center text-neutral-400 text-sm"
                  >
                    Ingen medlemmer fundet
                  </td>
                </tr>
              )}
              {filtered.map((m) => (
                <tr
                  key={m.id}
                  className={`group ${m.banned ? "opacity-50" : ""}`}
                >
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-[#e63946] text-white flex items-center justify-center text-[0.6rem] font-bold shrink-0 select-none">
                        {m.initials}
                      </div>
                      <span className="font-medium text-neutral-900">
                        {m.name}
                      </span>
                      {m.banned && (
                        <Badge className="bg-[#e63946]/10 text-[#e63946] border-0 text-[10px]">
                          Udelukket
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="py-3 pr-4 text-neutral-500">{m.email}</td>
                  <td className="py-3 pr-4 text-neutral-500">
                    {new Date(m.joined_date).toLocaleDateString("da-DK", {
                      month: "long",
                      year: "numeric",
                    })}
                  </td>
                  <td className="py-3 pr-4">
                    {m.banned ? (
                      <span className="text-neutral-400 text-xs">-</span>
                    ) : (
                      <div className="flex gap-1 flex-wrap">
                        <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-500 border border-transparent">
                          Medlem
                        </span>
                        {(["Vagt", "Administrator"] as Role[]).map((r) => (
                          <button
                            key={r}
                            onClick={() => toggleRole(m.id, r)}
                            className={`text-[11px] font-medium px-2 py-0.5 rounded-full border transition-colors ${
                              m.roles.includes(r)
                                ? ROLE_STYLES[r] + " border-transparent"
                                : "bg-white text-neutral-400 border-neutral-200 hover:border-neutral-400"
                            }`}
                          >
                            {r}
                          </button>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="py-3">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleBanClick(m)}
                      className={`gap-1.5 text-xs h-8 ${
                        m.banned
                          ? "text-[#2a9d8f] border-[#2a9d8f]/30 hover:bg-[#2a9d8f]/5"
                          : "text-[#e63946] border-[#e63946]/30 hover:bg-[#e63946]/5"
                      }`}
                    >
                      {m.banned ? (
                        <>
                          <UserCheck className="size-3" /> Genoptag
                        </>
                      ) : (
                        <>
                          <UserX className="size-3" /> Udeluk
                        </>
                      )}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
