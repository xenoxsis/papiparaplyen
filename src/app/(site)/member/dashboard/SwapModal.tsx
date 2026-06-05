"use client";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/Modal";
import type { ApiClubNight } from "@/lib/api";

interface SwapModalProps {
  open: boolean;
  onClose: () => void;
  shift: ApiClubNight | null;
  message: string;
  setMessage: (v: string) => void;
  onSubmit: () => void;
}

export function SwapModal({
  open,
  onClose,
  shift,
  message,
  setMessage,
  onSubmit,
}: SwapModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      panelClassName="p-6 flex flex-col gap-4"
    >
      <h2 className="font-semibold text-base text-neutral-900 dark:text-neutral-100">
        Anmod om vagtbytte
      </h2>
      {shift && (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          {shift.name} —{" "}
          {new Date(shift.date).toLocaleDateString("da-DK", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </p>
      )}
      <textarea
        className="w-full h-28 border border-neutral-200 dark:border-neutral-700 bg-transparent text-neutral-900 dark:text-neutral-100 rounded-lg px-3 py-2 text-sm outline-none font-[inherit] resize-none placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:border-neutral-400"
        placeholder="Skriv en besked til de andre vagter (valgfrit)…"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        autoFocus
      />
      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={onClose}>
          Annuller
        </Button>
        <Button
          className="bg-brand-red hover:bg-red-600 text-white"
          onClick={onSubmit}
        >
          Send anmodning
        </Button>
      </div>
    </Modal>
  );
}
