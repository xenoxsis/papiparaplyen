"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Trash2, X } from "lucide-react";
import { deleteMyAccount } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onClose: () => void;
}

const CONSEQUENCES = [
  "Dit navn og din e-mailadresse anonymiseres permanent i systemet.",
  "Alle dine beskeder i chatten slettes og kan ikke gendannes.",
  "Dine tidligere vagter forbliver i historikken, men tilknyttes ikke længere din konto.",
  "Du logges ud øjeblikkeligt og kan ikke logge ind igen.",
  "Handlingen kan ikke fortrydes.",
];

export function DeleteAccountModal({ open, onClose }: Props) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [confirmation, setConfirmation] = useState("");
  const [deleting, setDeleting] = useState(false);

  const initials = user?.initials ?? "";
  const isConfirmed =
    confirmation.trim().toUpperCase() === initials.toUpperCase();

  async function handleDelete() {
    if (!isConfirmed || deleting) return;
    setDeleting(true);
    try {
      await deleteMyAccount();
      logout();
      router.push("/");
      toast.success("Din konto er blevet slettet.");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Noget gik galt. Prøv igen.",
      );
      setDeleting(false);
    }
  }

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-neutral-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center shrink-0">
              <Trash2 className="size-4 text-brand-red" />
            </div>
            <div>
              <h2 className="font-semibold text-neutral-900 text-base leading-tight">
                Slet konto
              </h2>
              <p className="text-xs text-neutral-500 mt-0.5">
                Denne handling er permanent og kan ikke fortrydes
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={deleting}
            className="text-neutral-400 hover:text-neutral-600 transition-colors mt-0.5"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 flex flex-col gap-4">
          {/* Warning box */}
          <div className="flex gap-3 p-5 rounded-xl bg-red-50 border border-red-200">
            <AlertTriangle className="size-4 text-brand-red shrink-0 mt-0.5" />
            <div className="flex flex-col gap-1.5">
              <p className="text-sm font-semibold text-red-800">
                Konsekvenser ved sletning
              </p>
              <ul className="flex flex-col gap-1">
                {CONSEQUENCES.map((c) => (
                  <li key={c} className="text-xs text-red-700 flex gap-1.5">
                    <span className="mt-0.5 shrink-0">•</span>
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Confirmation input */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-neutral-700">
              Skriv dine initialer{" "}
              <span className="font-bold text-neutral-900">({initials})</span>{" "}
              for at bekræfte:
            </label>
            <input
              type="text"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              placeholder={initials}
              disabled={deleting}
              className="w-full px-3 py-2 rounded-lg border border-neutral-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-red/30 focus:border-brand-red disabled:opacity-50 font-mono tracking-widest uppercase"
              autoComplete="off"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-neutral-100 flex gap-3">
          <button
            onClick={onClose}
            disabled={deleting}
            className="flex-1 px-4 py-2.5 rounded-lg border border-neutral-200 text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition-colors disabled:opacity-50"
          >
            Annuller
          </button>
          <button
            onClick={handleDelete}
            disabled={!isConfirmed || deleting}
            className="flex-1 px-4 py-2.5 rounded-lg bg-brand-red text-white text-sm font-semibold hover:bg-red-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {deleting ? (
              <>
                <span className="size-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                Sletter…
              </>
            ) : (
              <>
                <Trash2 className="size-4" />
                Slet konto permanent
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
