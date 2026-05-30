"use client";

import { useState, useCallback, useRef } from "react";
import Cropper from "react-easy-crop";
import type { Area } from "react-easy-crop";
import { X, ZoomIn, ZoomOut, Check, Loader2 } from "lucide-react";
import { createPortal } from "react-dom";

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Given an image and a crop rectangle (in pixel coordinates), returns a JPEG
 * Blob of the cropped circle at the target output size.
 */
async function cropImageToBlob(
  imageSrc: string,
  pixelCrop: Area,
  outputSize = 256,
): Promise<Blob> {
  const image = await loadImage(imageSrc);
  const canvas = document.createElement("canvas");
  canvas.width = outputSize;
  canvas.height = outputSize;
  const ctx = canvas.getContext("2d")!;

  // Draw cropped region scaled to outputSize
  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    outputSize,
    outputSize,
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Canvas toBlob failed"));
      },
      "image/jpeg",
      0.9, // quality – backend will re-compress to 80% anyway
    );
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

interface AvatarCropModalProps {
  /** Object URL of the selected image file — caller must revoke after onClose */
  imageSrc: string;
  /** Called with the cropped JPEG blob ready for upload */
  onConfirm: (blob: Blob) => Promise<void>;
  onClose: () => void;
}

export function AvatarCropModal({
  imageSrc,
  onConfirm,
  onClose,
}: AvatarCropModalProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [saving, setSaving] = useState(false);
  const croppedAreaPixels = useRef<Area | null>(null);

  const onCropComplete = useCallback((_: Area, pixels: Area) => {
    croppedAreaPixels.current = pixels;
  }, []);

  async function handleConfirm() {
    if (!croppedAreaPixels.current) return;
    setSaving(true);
    try {
      const blob = await cropImageToBlob(imageSrc, croppedAreaPixels.current);
      await onConfirm(blob);
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Beskær profilbillede"
        className="bg-white dark:bg-neutral-900 rounded-2xl shadow-xl w-full max-w-sm flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-100 dark:border-neutral-700">
          <h2 className="font-semibold text-neutral-900 dark:text-neutral-100">
            Beskær profilbillede
          </h2>
          <button
            onClick={onClose}
            aria-label="Luk"
            disabled={saving}
            className="text-neutral-400 hover:text-neutral-600 transition-colors cursor-pointer bg-transparent border-none p-1 disabled:opacity-50"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Crop area */}
        <div
          className="relative w-full"
          style={{ height: 320, background: "#111" }}
        >
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="round"
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        </div>

        {/* Zoom slider */}
        <div className="flex items-center gap-3 px-5 py-3 border-t border-neutral-100 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800">
          <button
            onClick={() => setZoom((z) => Math.max(1, z - 0.1))}
            aria-label="Zoom ud"
            className="text-neutral-500 hover:text-neutral-800 transition-colors bg-transparent border-none cursor-pointer p-0"
          >
            <ZoomOut className="size-4" />
          </button>
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="flex-1 accent-neutral-900"
            aria-label="Zoom"
          />
          <button
            onClick={() => setZoom((z) => Math.min(3, z + 0.1))}
            aria-label="Zoom ind"
            className="text-neutral-500 hover:text-neutral-800 transition-colors bg-transparent border-none cursor-pointer p-0"
          >
            <ZoomIn className="size-4" />
          </button>
        </div>

        {/* Actions */}
        <div className="flex gap-2 px-5 py-4 border-t border-neutral-100 dark:border-neutral-700">
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 h-9 rounded-lg border border-neutral-200 dark:border-neutral-700 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors cursor-pointer bg-white dark:bg-transparent disabled:opacity-50"
          >
            Annuller
          </button>
          <button
            onClick={handleConfirm}
            disabled={saving}
            className="flex-1 h-9 rounded-lg bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 text-sm font-medium hover:bg-neutral-700 dark:hover:bg-neutral-300 transition-colors cursor-pointer border-none disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Gemmer…
              </>
            ) : (
              <>
                <Check className="size-4" />
                Gem billede
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
