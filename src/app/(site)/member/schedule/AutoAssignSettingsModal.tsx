"use client";

import { useState } from "react";
import { Settings, Ghost } from "lucide-react";
import { toast } from "sonner";
import { Modal } from "@/components/Modal";
import { Button } from "@/components/ui/button";
import { patchMember, type ApiMember } from "@/lib/api";

type RuleKey =
  | "rule_allow_two_in_a_row"
  | "rule_allow_weekday_after_sunday"
  | "rule_no_weekends";

interface AutoAssignSettingsModalProps {
  open: boolean;
  onClose: () => void;
  vagter: ApiMember[];
  setVagter: React.Dispatch<React.SetStateAction<ApiMember[]>>;
}

export function AutoAssignSettingsModal({
  open,
  onClose,
  vagter,
  setVagter,
}: AutoAssignSettingsModalProps) {
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  async function toggle(member: ApiMember, key: RuleKey) {
    const newValue = !member[key];
    const busyKey = `${member.id}:${key}`;
    setBusy((b) => ({ ...b, [busyKey]: true }));
    // Optimistic update
    setVagter((prev) =>
      prev.map((m) => (m.id === member.id ? { ...m, [key]: newValue } : m)),
    );
    try {
      const updated = await patchMember(member.id, { [key]: newValue });
      setVagter((prev) => prev.map((m) => (m.id === member.id ? updated : m)));
    } catch (err) {
      // Roll back
      setVagter((prev) =>
        prev.map((m) =>
          m.id === member.id ? { ...m, [key]: !newValue } : m,
        ),
      );
      toast.error((err as Error).message ?? "Kunne ikke gemme ændring");
    } finally {
      setBusy((b) => {
        const next = { ...b };
        delete next[busyKey];
        return next;
      });
    }
  }

  const sorted = [...vagter].sort((a, b) => a.name.localeCompare(b.name, "da"));

  return (
    <Modal
      open={open}
      onClose={onClose}
      maxWidth="max-w-2xl"
      panelClassName="p-6 flex flex-col gap-4 max-h-[85vh]"
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center shrink-0">
          <Settings className="size-5 text-purple-700" />
        </div>
        <div>
          <h2 className="font-semibold text-neutral-900">
            Auto-tildel indstillinger
          </h2>
          <p className="text-xs text-neutral-500">
            Vælg regler per vagt. Ændringer gemmes automatisk.
          </p>
        </div>
      </div>

      <div className="overflow-y-auto -mx-6 px-6">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-white">
            <tr className="text-left text-xs font-medium text-neutral-500">
              <th className="py-2 pr-2">Vagt</th>
              <th className="py-2 px-2 text-center">
                Tillad to vagter
                <br />i træk
              </th>
              <th className="py-2 px-2 text-center">
                Tillad hverdag
                <br />
                efter søndag
              </th>
              <th className="py-2 pl-2 text-center">
                Ingen
                <br />
                weekendvagter
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="py-6 text-center text-neutral-400 italic"
                >
                  Ingen vagter
                </td>
              </tr>
            )}
            {sorted.map((m) => (
              <tr
                key={m.id}
                className="border-t border-neutral-100 hover:bg-neutral-50"
              >
                <td className="py-2 pr-2">
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-7 h-7 rounded-full text-white flex items-center justify-center text-[0.6rem] font-bold shrink-0 ${
                        m.is_virtual
                          ? "bg-brand-teal/40 border-2 border-dashed border-brand-teal"
                          : "bg-brand-red"
                      }`}
                    >
                      {m.is_virtual ? (
                        <Ghost className="size-3 text-brand-teal" />
                      ) : (
                        m.initials
                      )}
                    </div>
                    <span className="font-medium text-neutral-800 truncate">
                      {m.name}
                    </span>
                  </div>
                </td>
                <RuleCell
                  member={m}
                  ruleKey="rule_allow_two_in_a_row"
                  busy={busy[`${m.id}:rule_allow_two_in_a_row`]}
                  onToggle={toggle}
                />
                <RuleCell
                  member={m}
                  ruleKey="rule_allow_weekday_after_sunday"
                  busy={busy[`${m.id}:rule_allow_weekday_after_sunday`]}
                  onToggle={toggle}
                />
                <RuleCell
                  member={m}
                  ruleKey="rule_no_weekends"
                  busy={busy[`${m.id}:rule_no_weekends`]}
                  onToggle={toggle}
                />
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end pt-2 border-t border-neutral-100">
        <Button variant="outline" onClick={onClose}>
          Luk
        </Button>
      </div>
    </Modal>
  );
}

function RuleCell({
  member,
  ruleKey,
  busy,
  onToggle,
}: {
  member: ApiMember;
  ruleKey: RuleKey;
  busy: boolean | undefined;
  onToggle: (m: ApiMember, k: RuleKey) => void;
}) {
  return (
    <td className="py-2 px-2 text-center">
      <input
        type="checkbox"
        className="size-4 cursor-pointer accent-purple-600 disabled:cursor-wait"
        checked={!!member[ruleKey]}
        disabled={busy}
        onChange={() => onToggle(member, ruleKey)}
        aria-label={`${member.name}: ${ruleKey}`}
      />
    </td>
  );
}
