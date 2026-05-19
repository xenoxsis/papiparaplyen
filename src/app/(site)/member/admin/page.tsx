"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  UserX,
  UserCheck,
  Search,
  Users,
  Ghost,
  Plus,
  Eye,
  EyeOff,
  Mail,
} from "lucide-react";
import { MemberHero } from "@/components/MemberHero";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  getMembers,
  patchMember,
  putMemberRoles,
  createVirtualMember,
  realizeMember,
  type ApiMember,
} from "@/lib/api";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { Modal } from "@/components/Modal";
import { Skeleton } from "@/components/ui/skeleton";

type Role = "Vagt" | "Administrator" | "Tilskuer";

const ROLE_STYLES: Record<Role, string> = {
  Vagt: "bg-brand-teal/10 text-brand-teal",
  Administrator: "bg-brand-orange/15 text-[#d4751a]",
  Tilskuer: "bg-blue-50 text-blue-600",
};

export default function AdminPage() {
  const { authorized } = useRequireAuth(["Administrator"]);
  const [members, setMembers] = useState<ApiMember[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"alle" | Role | "banned" | "virtuelle">(
    "alle",
  );
  const [pendingBan, setPendingBan] = useState<ApiMember | null>(null);
  const [loading, setLoading] = useState(true);
  // Virtual member creation modal
  const [showCreateVirtual, setShowCreateVirtual] = useState(false);
  const [virtualName, setVirtualName] = useState("");
  const [virtualInitials, setVirtualInitials] = useState("");
  const [virtualCreating, setVirtualCreating] = useState(false);
  // Realize modal
  const [realizingMember, setRealizingMember] = useState<ApiMember | null>(
    null,
  );
  const [realizeEmail, setRealizeEmail] = useState("");
  const [realizingBusy, setRealizingBusy] = useState(false);
  const [realizeResult, setRealizeResult] = useState<{
    merged: boolean;
    name?: string;
  } | null>(null);

  useEffect(() => {
    setLoading(true);
    getMembers()
      .then(setMembers)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  async function handleCreateVirtual() {
    if (!virtualName.trim() || !virtualInitials.trim()) return;
    setVirtualCreating(true);
    try {
      const created = await createVirtualMember(
        virtualName.trim(),
        virtualInitials.trim(),
      );
      setMembers((prev) => [...prev, created]);
      setVirtualName("");
      setVirtualInitials("");
      setShowCreateVirtual(false);
    } catch (err: unknown) {
      alert((err as Error).message ?? "Fejl ved oprettelse");
    } finally {
      setVirtualCreating(false);
    }
  }

  async function handleRealize() {
    if (!realizingMember || !realizeEmail.trim()) return;
    setRealizingBusy(true);
    try {
      const result = await realizeMember(
        realizingMember.id,
        realizeEmail.trim(),
      );
      setRealizeResult({ merged: result.merged, name: result.name });
      if (result.merged) {
        // Remove the virtual member from the list
        setMembers((prev) => prev.filter((m) => m.id !== realizingMember.id));
      } else if (result.member) {
        // Update the member in the list with the realized version
        setMembers((prev) =>
          prev.map((m) => (m.id === realizingMember.id ? result.member! : m)),
        );
      }
    } catch (err: unknown) {
      alert((err as Error).message ?? "Fejl ved realisering");
    } finally {
      setRealizingBusy(false);
    }
  }

  async function toggleShowOnAboutPage(id: number) {
    const m = members.find((m) => m.id === id);
    if (!m) return;
    try {
      const updated = await patchMember(id, {
        show_on_about_page: !m.show_on_about_page,
      });
      setMembers((prev) => prev.map((m) => (m.id === id ? updated : m)));
    } catch (err) {
      console.error(err);
    }
  }

  function openRealizeModal(m: ApiMember) {
    setRealizingMember(m);
    setRealizeEmail("");
    setRealizeResult(null);
  }

  function closeRealizeModal() {
    setRealizingMember(null);
    setRealizeEmail("");
    setRealizeResult(null);
    setRealizingBusy(false);
  }

  async function toggleRole(id: number, role: Role) {
    const m = members.find((m) => m.id === id);
    if (!m) return;
    const hasRole = m.roles.includes(role);
    const MUTUAL_EXCLUSIONS: Partial<Record<Role, Role>> = {
      Vagt: "Tilskuer",
      Tilskuer: "Vagt",
    };
    const rolesForApi = (
      hasRole
        ? m.roles.filter((r) => r !== role)
        : [...m.roles.filter((r) => r !== MUTUAL_EXCLUSIONS[role]), role]
    ).filter((r) => r === "Vagt" || r === "Administrator" || r === "Tilskuer");
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

  async function toggleAutoAssignRule(
    id: number,
    key:
      | "rule_allow_two_in_a_row"
      | "rule_allow_weekday_after_sunday"
      | "rule_no_weekends",
  ) {
    const m = members.find((m) => m.id === id);
    if (!m) return;
    const newValue = !m[key];
    setMembers((prev) =>
      prev.map((x) => (x.id === id ? { ...x, [key]: newValue } : x)),
    );
    try {
      const updated = await patchMember(id, { [key]: newValue });
      setMembers((prev) => prev.map((x) => (x.id === id ? updated : x)));
    } catch (err) {
      setMembers((prev) =>
        prev.map((x) => (x.id === id ? { ...x, [key]: !newValue } : x)),
      );
      console.error(err);
    }
  }

  const filtered = members.filter((m) => {
    const matchesSearch =
      m.name.toLowerCase().includes(search.toLowerCase()) ||
      (m.email ?? "").toLowerCase().includes(search.toLowerCase());
    if (!matchesSearch) return false;
    if (filter === "banned") return m.banned;
    if (filter === "virtuelle") return m.is_virtual && !m.banned;
    if (filter === "alle") return !m.banned && !m.is_virtual;
    return m.roles.includes(filter) && !m.banned && !m.is_virtual;
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
    alle: members.filter((m) => !m.banned && !m.is_virtual).length,
    Vagt: members.filter(
      (m) => m.roles.includes("Vagt") && !m.banned && !m.is_virtual,
    ).length,
    Administrator: members.filter(
      (m) => m.roles.includes("Administrator") && !m.banned,
    ).length,
    Tilskuer: members.filter((m) => m.roles.includes("Tilskuer") && !m.banned)
      .length,
    banned: members.filter((m) => m.banned).length,
    virtuelle: members.filter((m) => m.is_virtual && !m.banned).length,
  };

  if (!authorized) return null;
  return (
    <main className="bg-neutral-100 min-h-[calc(100vh-3.5rem)] p-4 sm:p-8 flex flex-col gap-6 sm:gap-8">
      {/* Confirm ban dialog */}
      <Modal
        open={pendingBan !== null}
        onClose={() => setPendingBan(null)}
        maxWidth="max-w-sm"
        panelClassName="p-6 flex flex-col gap-4"
      >
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-full bg-brand-red/10 flex items-center justify-center shrink-0">
            <AlertTriangle className="size-5 text-brand-red" />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <h2 className="font-semibold text-neutral-900">Udeluk medlem?</h2>
          <p className="text-sm text-neutral-500">
            Er du sikker på, at du vil udelukke{" "}
            <span className="font-medium text-neutral-900">
              {pendingBan?.name}
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
            className="bg-brand-red hover:bg-red-600 text-white gap-2"
          >
            <UserX className="size-4" />
            Udeluk
          </Button>
        </div>
      </Modal>

      {/* Create virtual member modal */}
      <Modal
        open={showCreateVirtual}
        onClose={() => setShowCreateVirtual(false)}
        maxWidth="max-w-sm"
        panelClassName="p-6 flex flex-col gap-4"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-brand-teal/10 flex items-center justify-center shrink-0">
            <Ghost className="size-5 text-brand-teal" />
          </div>
          <h2 className="font-semibold text-neutral-900">Opret virtuel vagt</h2>
        </div>
        <p className="text-sm text-neutral-500">
          En virtuel vagt har ingen login, modtager ingen e-mails og bekræfter
          automatisk sine vagter.
        </p>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-neutral-700">Navn</label>
            <Input
              placeholder="f.eks. Vikar Hansen"
              value={virtualName}
              onChange={(e) => setVirtualName(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-neutral-700">
              Initialer
            </label>
            <Input
              placeholder="f.eks. VH"
              value={virtualInitials}
              onChange={(e) => setVirtualInitials(e.target.value.toUpperCase())}
              maxLength={5}
            />
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={() => setShowCreateVirtual(false)}>
            Annullér
          </Button>
          <Button
            onClick={handleCreateVirtual}
            disabled={
              !virtualName.trim() || !virtualInitials.trim() || virtualCreating
            }
            className="bg-brand-teal hover:bg-teal-600 text-white gap-2"
          >
            <Plus className="size-4" />
            {virtualCreating ? "Opretter…" : "Opret"}
          </Button>
        </div>
      </Modal>

      {/* Realize (assign email) modal */}
      <Modal
        open={realizingMember !== null}
        onClose={closeRealizeModal}
        maxWidth="max-w-sm"
        panelClassName="p-6 flex flex-col gap-4"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-brand-orange/10 flex items-center justify-center shrink-0">
            <Mail className="size-5 text-brand-orange" />
          </div>
          <h2 className="font-semibold text-neutral-900">
            Tildel e-mail til {realizingMember?.name}
          </h2>
        </div>
        {realizeResult ? (
          <div className="flex flex-col gap-3">
            {realizeResult.merged ? (
              <p className="text-sm text-neutral-700">
                ✅ Flettet med eksisterende bruger{" "}
                <span className="font-medium">{realizeResult.name}</span>. Alle
                vagter er overført.
              </p>
            ) : (
              <p className="text-sm text-neutral-700">
                ✅ Konverteret til rigtigt medlem. En invitationsmail er sendt
                til <span className="font-medium">{realizeEmail}</span>.
              </p>
            )}
            <div className="flex justify-end">
              <Button variant="outline" onClick={closeRealizeModal}>
                Luk
              </Button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-sm text-neutral-500">
              Angiv en e-mailadresse. Hvis der allerede findes en bruger med den
              e-mail, flettes vagterne med den bruger og den virtuelle profil
              slettes. Ellers sendes en invitationsmail.
            </p>
            <Input
              type="email"
              placeholder="email@eksempel.dk"
              value={realizeEmail}
              onChange={(e) => setRealizeEmail(e.target.value)}
            />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={closeRealizeModal}>
                Annullér
              </Button>
              <Button
                onClick={handleRealize}
                disabled={!realizeEmail.trim() || realizingBusy}
                className="bg-brand-orange hover:bg-orange-600 text-white gap-2"
              >
                <Mail className="size-4" />
                {realizingBusy ? "Behandler…" : "Bekræft"}
              </Button>
            </div>
          </>
        )}
      </Modal>
      <MemberHero>
        <div className="flex flex-col items-center">
          <span className="font-bold text-2xl text-brand-orange">
            {members.filter((m) => !m.banned).length}
          </span>
          <span className="text-white/60 text-xs">Aktive medlemmer</span>
        </div>
        <div className="hidden sm:block bg-white/20 w-px h-10" />
        <div className="flex flex-col items-center">
          <span className="font-bold text-2xl text-brand-teal">
            {counts.Vagt}
          </span>
          <span className="text-white/60 text-xs">Vagter</span>
        </div>
        <div className="hidden sm:block bg-white/20 w-px h-10" />
        <div className="flex flex-col items-center">
          <span className="font-bold text-brand-red text-2xl">
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
          <div className="flex items-center gap-2 ml-auto flex-wrap justify-end">
            <Button
              size="sm"
              onClick={() => setShowCreateVirtual(true)}
              className="bg-brand-teal hover:bg-teal-600 text-white gap-1.5 h-9 text-xs"
            >
              <Ghost className="size-3.5" />
              Opret virtuel vagt
            </Button>
            <div className="relative w-full sm:w-72">
              <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
              <Input
                aria-label="Søg navn eller e-mail"
                placeholder="Søg navn eller e-mail…"
                className="pl-9 h-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Filter chips */}
        <div className="flex items-center gap-2 flex-wrap">
          {(
            [
              "alle",
              "Vagt",
              "Tilskuer",
              "Administrator",
              "virtuelle",
              "banned",
            ] as const
          ).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-xs font-medium px-3 py-1 rounded-full transition-colors border ${
                filter === f
                  ? "bg-neutral-900 text-white border-neutral-900"
                  : "bg-white text-neutral-600 border-neutral-200 hover:border-neutral-400"
              }`}
            >
              {f === "alle"
                ? "Alle aktive"
                : f === "banned"
                  ? "Udelukkede"
                  : f === "virtuelle"
                    ? "Virtuelle"
                    : f}
              <span className="ml-1.5 opacity-60">
                {counts[f as keyof typeof counts]}
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
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-3">
                        <Skeleton className="w-8 h-8 rounded-full shrink-0" />
                        <Skeleton className="h-4 w-28 rounded" />
                      </div>
                    </td>
                    <td className="py-3 pr-4">
                      <Skeleton className="h-3 w-40 rounded" />
                    </td>
                    <td className="py-3 pr-4">
                      <Skeleton className="h-3 w-20 rounded" />
                    </td>
                    <td className="py-3 pr-4">
                      <Skeleton className="h-5 w-16 rounded-full" />
                    </td>
                    <td className="py-3">
                      <Skeleton className="h-7 w-24 rounded" />
                    </td>
                  </tr>
                ))
              ) : (
                <>
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
                          <div
                            className={`w-8 h-8 rounded-full text-white flex items-center justify-center text-[0.6rem] font-bold shrink-0 select-none ${m.is_virtual ? "bg-brand-teal/60 border-2 border-dashed border-brand-teal" : "bg-brand-red"}`}
                          >
                            {m.is_virtual ? (
                              <Ghost className="size-3.5" />
                            ) : (
                              m.initials
                            )}
                          </div>
                          <span className="font-medium text-neutral-900">
                            {m.name}
                          </span>
                          {m.is_virtual && (
                            <Badge className="bg-brand-teal/10 text-brand-teal border-brand-teal/30 border text-[10px]">
                              Virtuel
                            </Badge>
                          )}
                          {m.banned && (
                            <Badge className="bg-brand-red/10 text-brand-red border-0 text-[10px]">
                              Udelukket
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="py-3 pr-4 text-neutral-500">
                        {m.email ?? (
                          <span className="italic text-neutral-300">
                            Ingen e-mail
                          </span>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-neutral-500">
                        {new Date(m.joined_date).toLocaleDateString("da-DK", {
                          month: "long",
                          year: "numeric",
                        })}
                      </td>
                      <td className="py-3 pr-4">
                        {m.banned || m.is_superuser ? (
                          <span className="text-neutral-400 text-xs">
                            {m.is_superuser && !m.banned
                              ? "🔒 Superbruger"
                              : "-"}
                          </span>
                        ) : m.is_virtual ? (
                          <div className="flex gap-1 flex-wrap items-center">
                            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-brand-teal/10 text-brand-teal border-transparent border">
                              Vagt (auto)
                            </span>
                          </div>
                        ) : (
                          <div className="flex gap-1 flex-wrap">
                            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-500 border border-transparent">
                              Medlem
                            </span>
                            {(
                              ["Vagt", "Tilskuer", "Administrator"] as Role[]
                            ).map((r) => (
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
                        {m.is_virtual ? (
                          <div className="flex items-center gap-2 flex-wrap">
                            <button
                              onClick={() => toggleShowOnAboutPage(m.id)}
                              title={
                                m.show_on_about_page
                                  ? "Skjul på Om os-siden"
                                  : "Vis på Om os-siden"
                              }
                              className={`flex items-center gap-1 text-xs px-2 py-1 rounded border transition-colors ${
                                m.show_on_about_page
                                  ? "text-brand-teal border-brand-teal/30 bg-brand-teal/5 hover:bg-brand-teal/10"
                                  : "text-neutral-400 border-neutral-200 hover:border-neutral-400"
                              }`}
                            >
                              {m.show_on_about_page ? (
                                <Eye className="size-3" />
                              ) : (
                                <EyeOff className="size-3" />
                              )}
                              Om os
                            </button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openRealizeModal(m)}
                              className="gap-1.5 text-xs h-8 text-brand-orange border-brand-orange/30 hover:bg-brand-orange/5"
                            >
                              <Mail className="size-3" />
                              Tildel e-mail
                            </Button>
                          </div>
                        ) : m.is_superuser ? (
                          <span className="text-neutral-300 text-xs">
                            Beskyttet
                          </span>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleBanClick(m)}
                            className={`gap-1.5 text-xs h-8 ${
                              m.banned
                                ? "text-brand-teal border-brand-teal/30 hover:bg-brand-teal/5"
                                : "text-brand-red border-brand-red/30 hover:bg-brand-red/5"
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
                        )}
                      </td>
                    </tr>
                  ))}
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
