"use client";

import { Button } from "@/components/ui/button";
import { Modal } from "@/components/Modal";
import type { ApiClubNight, ApiMessage } from "@/lib/api";

interface SwapConfirmModalProps {
  msg: ApiMessage | null;
  nights: ApiClubNight[];
  onClose: () => void;
  onConfirm: () => void;
}

export function SwapConfirmModal({
  msg,
  nights,
  onClose,
  onConfirm,
}: SwapConfirmModalProps) {
  return (
    <Modal
      open={msg !== null}
      onClose={onClose}
      maxWidth="max-w-sm"
      panelClassName="p-6 flex flex-col gap-4"
    >
      <h2 className="font-semibold text-base text-neutral-900">Tag vagten?</h2>
      <p className="text-sm text-neutral-500">
        {nights.find((n) => n.id === msg?.shift_night_id)?.name ?? "Denne vagt"}{" "}
        flyttes til dig.
      </p>
      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={onClose}>
          Fortryd
        </Button>
        <Button
          className="bg-brand-teal hover:bg-teal-700 text-white"
          onClick={onConfirm}
        >
          Bekræft
        </Button>
      </div>
    </Modal>
  );
}
