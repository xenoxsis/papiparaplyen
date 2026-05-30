"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Loader2, Trash2, Upload, X } from "lucide-react";
import {
  getEmailPrefs,
  patchEmailPrefs,
  patchMe,
  changePassword,
  getBggPrefs,
  patchBggPrefs,
  uploadBggCollection,
  type ApiEmailPrefs,
  type ApiBggPrefs,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";

interface EditProfileModalProps {
  open: boolean;
  onClose: () => void;
  onDeleteRequest: () => void;
}

// ── State ──────────────────────────────────────────────────────────────────────

type Tab = "name" | "password" | "emails" | "bgg";

type EditState = {
  tab: Tab;
  name: string;
  currentPw: string;
  newPw: string;
  confirmPw: string;
  saving: boolean;
  emailPrefs: ApiEmailPrefs | null;
  bggPrefs: ApiBggPrefs | null;
};

type EditAction =
  | { type: "SET"; payload: Partial<EditState> }
  | { type: "RESET"; name: string };

const initialEditState: EditState = {
  tab: "name",
  name: "",
  currentPw: "",
  newPw: "",
  confirmPw: "",
  saving: false,
  emailPrefs: null,
  bggPrefs: null,
};

function editReducer(state: EditState, action: EditAction): EditState {
  switch (action.type) {
    case "SET":
      return { ...state, ...action.payload };
    case "RESET":
      return { ...initialEditState, name: action.name };
    default:
      return state;
  }
}

// ── Toggle switch ─────────────────────────────────────────────────────

function Toggle({
  enabled,
  label,
  onToggle,
}: {
  enabled: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-neutral-700">{label}</span>
      <button
        role="switch"
        aria-checked={enabled}
        aria-label={label}
        onClick={onToggle}
        style={{
          position: "relative",
          width: 40,
          height: 24,
          borderRadius: 9999,
          border: "none",
          cursor: "pointer",
          backgroundColor: enabled ? "#171717" : "#e5e5e5",
          transition: "background-color 150ms",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            position: "absolute",
            top: "50%",
            left: enabled ? 20 : 4,
            transform: "translateY(-50%)",
            width: 16,
            height: 16,
            borderRadius: 9999,
            backgroundColor: "white",
            boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
            transition: "left 150ms",
          }}
        />
      </button>
    </div>
  );
}

// ── Upload step state ─────────────────────────────────────────────────────────

type StepStatus = "idle" | "spinning" | "done" | "error";
type UploadSteps = {
  reading: StepStatus;
  uploading: StepStatus;
  processing: StepStatus;
};
const idleSteps: UploadSteps = {
  reading: "idle",
  uploading: "idle",
  processing: "idle",
};

// ── Modal ─────────────────────────────────────────────────────
export function EditProfileModal({
  open,
  onClose,
  onDeleteRequest,
}: EditProfileModalProps) {
  const { user, updateUser } = useAuth();
  const [edit, dispatch] = useReducer(editReducer, initialEditState);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadSteps, setUploadSteps] = useState<UploadSteps>(idleSteps);
  const isUploading =
    uploadSteps.reading !== "idle" &&
    uploadSteps.processing !== "done" &&
    uploadSteps.processing !== "error";
  const bggPrefsFetched = useRef(false);

  const set = (payload: Partial<EditState>) =>
    dispatch({ type: "SET", payload });

  useEffect(() => {
    if (!open) return;
    dispatch({ type: "RESET", name: user?.name ?? "" });
    bggPrefsFetched.current = false;
    getEmailPrefs()
      .then((prefs) => set({ emailPrefs: prefs }))
      .catch(console.error);
  }, [open, user?.name]);

  // Lazy-load BGG prefs only when the BGG tab is first opened
  useEffect(() => {
    if (edit.tab !== "bgg" || bggPrefsFetched.current) return;
    bggPrefsFetched.current = true;
    getBggPrefs()
      .then((prefs) => set({ bggPrefs: prefs }))
      .catch(console.error);
  }, [edit.tab]);

  async function handleSaveName() {
    if (!edit.name.trim()) return;
    set({ saving: true });
    try {
      const result = await patchMe(edit.name.trim());
      updateUser({ name: result.name, initials: result.initials });
      toast.success("Navn opdateret");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Noget gik galt");
    } finally {
      set({ saving: false });
    }
  }

  async function handleSavePassword() {
    if (edit.newPw.length < 6) {
      toast.error("Adgangskode skal være mindst 6 tegn");
      return;
    }
    if (edit.newPw !== edit.confirmPw) {
      toast.error("Adgangskoderne matcher ikke");
      return;
    }
    set({ saving: true });
    try {
      await changePassword(edit.currentPw, edit.newPw);
      toast.success("Adgangskode ændret");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Noget gik galt");
    } finally {
      set({ saving: false });
    }
  }

  async function handleBggUpload(file: File) {
    setUploadSteps({
      reading: "spinning",
      uploading: "idle",
      processing: "idle",
    });
    let csvText: string;
    try {
      csvText = await file.text();
      setUploadSteps({
        reading: "done",
        uploading: "spinning",
        processing: "idle",
      });
    } catch {
      setUploadSteps({
        reading: "error",
        uploading: "idle",
        processing: "idle",
      });
      toast.error("Kunne ikke læse filen.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    try {
      setUploadSteps({
        reading: "done",
        uploading: "done",
        processing: "spinning",
      });
      const result = await uploadBggCollection(csvText);
      setUploadSteps({
        reading: "done",
        uploading: "done",
        processing: "done",
      });
      const removedPart =
        result.removed > 0 ? `, ${result.removed} fjernet` : "";
      toast.success(
        `Samling opdateret — ${result.imported} spil importeret${removedPart}`,
      );
      setTimeout(() => setUploadSteps(idleSteps), 2500);
    } catch (err) {
      setUploadSteps((s) => ({
        ...s,
        uploading: "error",
        processing: "error",
      }));
      toast.error(
        err instanceof Error ? err.message : "Upload fejlede. Prøv igen.",
      );
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function toggleBggPref(key: keyof ApiBggPrefs) {
    if (!edit.bggPrefs) return;
    const next = !edit.bggPrefs[key];
    set({ bggPrefs: { ...edit.bggPrefs, [key]: next } });
    patchBggPrefs({ [key]: next }).catch(console.error);
  }

  if (!open) return null;

  const tabs: { key: Tab; label: string }[] = [
    { key: "name", label: "Navn" },
    { key: "password", label: "Adgangskode" },
    { key: "emails", label: "E-mails" },
    { key: "bgg", label: "Brætspil" },
  ];

  const inputCls =
    "h-9 rounded-lg border border-neutral-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900 w-full";
  const labelCls = "text-xs font-medium text-neutral-700";

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="bg-white dark:bg-neutral-900 rounded-2xl shadow-xl w-full max-w-sm flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-100">
          <h2 className="font-semibold text-neutral-900">Rediger profil</h2>
          <button
            onClick={onClose}
            aria-label="Luk"
            className="text-neutral-400 hover:text-neutral-600 transition-colors cursor-pointer bg-transparent border-none p-1"
          >
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-neutral-100">
          {tabs.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => set({ tab: key })}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors cursor-pointer border-none bg-transparent ${
                edit.tab === key
                  ? "text-neutral-900 border-b-2 border-neutral-900"
                  : "text-neutral-500 hover:text-neutral-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-5 flex flex-col gap-4">
          {/* ── Name ── */}
          {edit.tab === "name" && (
            <>
              <div className="flex flex-col gap-1.5">
                <label className={labelCls}>Fulde navn</label>
                <input
                  type="text"
                  value={edit.name}
                  onChange={(e) => set({ name: e.target.value })}
                  className={inputCls}
                  placeholder="Dit navn"
                  onKeyDown={(e) => e.key === "Enter" && handleSaveName()}
                  autoFocus
                />
              </div>
              <button
                onClick={handleSaveName}
                disabled={edit.saving || !edit.name.trim()}
                className="h-9 rounded-lg bg-neutral-900 text-white text-sm font-medium hover:bg-neutral-700 transition-colors cursor-pointer border-none disabled:opacity-50"
              >
                {edit.saving ? "Gemmer…" : "Gem navn"}
              </button>
            </>
          )}

          {/* ── Password ── */}
          {edit.tab === "password" && (
            <>
              <div className="flex flex-col gap-1.5">
                <label className={labelCls}>Nuværende adgangskode</label>
                <input
                  type="password"
                  value={edit.currentPw}
                  onChange={(e) => set({ currentPw: e.target.value })}
                  className={inputCls}
                  placeholder="••••••••"
                  autoFocus
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className={labelCls}>Ny adgangskode</label>
                <input
                  type="password"
                  value={edit.newPw}
                  onChange={(e) => set({ newPw: e.target.value })}
                  className={inputCls}
                  placeholder="Mindst 6 tegn"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className={labelCls}>Gentag ny adgangskode</label>
                <input
                  type="password"
                  value={edit.confirmPw}
                  onChange={(e) => set({ confirmPw: e.target.value })}
                  className={inputCls}
                  placeholder="••••••••"
                  onKeyDown={(e) => e.key === "Enter" && handleSavePassword()}
                />
              </div>
              <button
                onClick={handleSavePassword}
                disabled={
                  edit.saving ||
                  !edit.currentPw ||
                  !edit.newPw ||
                  !edit.confirmPw
                }
                className="h-9 rounded-lg bg-neutral-900 text-white text-sm font-medium hover:bg-neutral-700 transition-colors cursor-pointer border-none disabled:opacity-50"
              >
                {edit.saving ? "Gemmer…" : "Skift adgangskode"}
              </button>
            </>
          )}

          {/* ── Emails ── */}
          {edit.tab === "emails" && (
            <div className="flex flex-col gap-4">
              {(
                [
                  "email_on_mention",
                  "email_on_nights",
                  "email_on_shift",
                ] as const
              ).map((key) => {
                const labels: Record<typeof key, string> = {
                  email_on_mention: "E-mail når du @omtales",
                  email_on_nights: "E-mail ved nye klubaftener",
                  email_on_shift: "E-mail når du tildeles en vagt",
                };
                const enabled = edit.emailPrefs?.[key] ?? true;
                return (
                  <Toggle
                    key={key}
                    enabled={enabled}
                    label={labels[key]}
                    onToggle={() => {
                      const next = !enabled;
                      set({
                        emailPrefs: edit.emailPrefs
                          ? { ...edit.emailPrefs, [key]: next }
                          : edit.emailPrefs,
                      });
                      patchEmailPrefs({ [key]: next }).catch(console.error);
                    }}
                  />
                );
              })}
            </div>
          )}

          {/* ── BGG ── */}
          {edit.tab === "bgg" && (
            <div className="flex flex-col gap-4">
              <p className="text-xs text-neutral-500 leading-relaxed">
                Upload din eksporterede BGG-samling for at vise dine spil på den
                offentlige brætspilsliste. Hent CSV-filen fra{" "}
                <a
                  href="https://boardgamegeek.com/collection"
                  target="_blank"
                  rel="noreferrer"
                  className="underline hover:text-neutral-700"
                >
                  boardgamegeek.com
                </a>
                . Kun spil markeret som <em>ejet</em> importeres. Uploader du
                igen erstattes den gamle liste automatisk.
              </p>

              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleBggUpload(file);
                }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="flex items-center justify-center gap-2 h-9 rounded-lg border border-neutral-300 text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition-colors cursor-pointer disabled:opacity-50 bg-white"
              >
                <Upload className="size-4" />
                {isUploading ? "Uploader…" : "Vælg samlings-CSV"}
              </button>

              {/* Upload progress checklist */}
              {uploadSteps.reading !== "idle" && (
                <div className="flex flex-col gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3">
                  {(
                    [
                      { key: "reading", label: "Læser fil" },
                      { key: "uploading", label: "Sender til server" },
                      { key: "processing", label: "Behandler samling" },
                    ] as { key: keyof UploadSteps; label: string }[]
                  ).map(({ key, label }) => {
                    const status = uploadSteps[key];
                    return (
                      <div key={key} className="flex items-center gap-2.5">
                        <span className="shrink-0 w-5 h-5 flex items-center justify-center">
                          {status === "spinning" && (
                            <Loader2 className="size-4 text-neutral-500 animate-spin" />
                          )}
                          {status === "done" && (
                            <Check className="size-4 text-green-600" />
                          )}
                          {status === "error" && (
                            <X className="size-4 text-red-500" />
                          )}
                          {status === "idle" && (
                            <span className="w-4 h-4 rounded-full border-2 border-neutral-300" />
                          )}
                        </span>
                        <span
                          className={`text-sm ${
                            status === "spinning"
                              ? "text-neutral-800 font-medium"
                              : status === "done"
                                ? "text-neutral-500 line-through"
                                : status === "error"
                                  ? "text-red-500"
                                  : "text-neutral-400"
                          }`}
                        >
                          {label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              {edit.bggPrefs !== null && (
                <div className="flex flex-col gap-3 pt-1 border-t border-neutral-100">
                  <Toggle
                    enabled={edit.bggPrefs.bgg_share_collection}
                    label="Inkluder mine spil på den offentlige liste"
                    onToggle={() => toggleBggPref("bgg_share_collection")}
                  />
                  <Toggle
                    enabled={edit.bggPrefs.bgg_share_name}
                    label="Vis mit navn som ejer"
                    onToggle={() => toggleBggPref("bgg_share_name")}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Danger zone */}
        <div className="px-5 py-4 border-t border-neutral-100">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDeleteRequest();
            }}
            className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-brand-red transition-colors cursor-pointer"
          >
            <Trash2 className="size-3.5" />
            Slet konto
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
