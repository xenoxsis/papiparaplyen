"use client";

import { useEffect, useRef, useState } from "react";
import {
  Check,
  Download,
  KeyRound,
  Loader2,
  Mail,
  User,
  Upload,
  X,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { useRequireAuth } from "@/lib/useRequireAuth";
import {
  patchMe,
  changePassword,
  getEmailPrefs,
  patchEmailPrefs,
  getBggPrefs,
  patchBggPrefs,
  uploadBggCollection,
  type ApiEmailPrefs,
  type ApiBggPrefs,
} from "@/lib/api";
import { DeleteAccountModal } from "@/app/(site)/member/dashboard/DeleteAccountModal";

// ── Toggle ────────────────────────────────────────────────────────────────────

function Toggle({
  enabled,
  label,
  description,
  onToggle,
}: {
  enabled: boolean;
  label: string;
  description?: string;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium text-neutral-900">{label}</span>
        {description && (
          <span className="text-xs text-neutral-500">{description}</span>
        )}
      </div>
      <button
        role="switch"
        aria-checked={enabled}
        aria-label={label}
        onClick={onToggle}
        className="shrink-0 mt-0.5 cursor-pointer border-none"
        style={{
          position: "relative",
          width: 40,
          height: 24,
          borderRadius: 9999,
          backgroundColor: enabled ? "#171717" : "#e5e5e5",
          transition: "background-color 150ms",
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

// ── Section card ──────────────────────────────────────────────────────────────

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-neutral-100">
        <span className="text-neutral-500">{icon}</span>
        <h2 className="font-semibold text-neutral-900 text-sm">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

// ── Upload step types ─────────────────────────────────────────────────────────

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

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ProfileSettingsPage() {
  useRequireAuth();
  const { user, updateUser } = useAuth();

  // Name
  const [name, setName] = useState(user?.name ?? "");
  const [savingName, setSavingName] = useState(false);

  // Password
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [savingPw, setSavingPw] = useState(false);

  // Email prefs
  const [emailPrefs, setEmailPrefs] = useState<ApiEmailPrefs | null>(null);

  // BGG
  const [bggPrefs, setBggPrefs] = useState<ApiBggPrefs | null>(null);
  const [uploadSteps, setUploadSteps] = useState<UploadSteps>(idleSteps);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isUploading =
    uploadSteps.reading !== "idle" &&
    uploadSteps.processing !== "done" &&
    uploadSteps.processing !== "error";

  // Delete account modal
  const [showDelete, setShowDelete] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (user?.name) setName(user.name);
  }, [user?.name]);

  useEffect(() => {
    getEmailPrefs().then(setEmailPrefs).catch(console.error);
    getBggPrefs().then(setBggPrefs).catch(console.error);
  }, []);

  async function handleSaveName(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSavingName(true);
    try {
      const result = await patchMe(name.trim());
      updateUser({ name: result.name, initials: result.initials });
      toast.success("Navn opdateret");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Noget gik galt");
    } finally {
      setSavingName(false);
    }
  }

  async function handleSavePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPw.length < 6) {
      toast.error("Adgangskode skal være mindst 6 tegn");
      return;
    }
    if (newPw !== confirmPw) {
      toast.error("Adgangskoderne matcher ikke");
      return;
    }
    setSavingPw(true);
    try {
      await changePassword(currentPw, newPw);
      toast.success("Adgangskode ændret");
      setCurrentPw("");
      setNewPw("");
      setConfirmPw("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Noget gik galt");
    } finally {
      setSavingPw(false);
    }
  }

  function toggleEmailPref(key: keyof ApiEmailPrefs) {
    if (!emailPrefs) return;
    const next = { ...emailPrefs, [key]: !emailPrefs[key] };
    setEmailPrefs(next);
    patchEmailPrefs({ [key]: next[key] }).catch(console.error);
  }

  function toggleBggPref(key: keyof ApiBggPrefs) {
    if (!bggPrefs) return;
    const next = { ...bggPrefs, [key]: !bggPrefs[key] };
    setBggPrefs(next);
    patchBggPrefs({ [key]: next[key] }).catch(console.error);
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
      // Refresh BGG prefs to get updated game count
      getBggPrefs()
        .then(setBggPrefs)
        .catch(() => {});
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

  async function handleExport() {
    setExporting(true);
    try {
      const res = await fetch("/api/auth/export", { credentials: "include" });
      if (!res.ok) throw new Error("Export fejlede");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "mine-data.json";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Eksport fejlede. Prøv igen.");
    } finally {
      setExporting(false);
    }
  }

  const inputCls =
    "h-9 rounded-lg border border-neutral-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900 w-full";
  const labelCls = "text-xs font-medium text-neutral-600 mb-1";
  const saveBtnCls =
    "h-9 px-4 rounded-lg bg-neutral-900 text-white text-sm font-medium hover:bg-neutral-700 transition-colors cursor-pointer border-none disabled:opacity-50";

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold text-neutral-900">Indstillinger</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Administrer dit navn, adgangskode og notifikationspræferencer.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {/* ── Navn ── */}
        <Section icon={<User className="size-4" />} title="Navn">
          <form onSubmit={handleSaveName} className="flex flex-col gap-3">
            <div>
              <label className={labelCls}>Fulde navn</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputCls}
                placeholder="Dit navn"
              />
            </div>
            <div>
              <button
                type="submit"
                disabled={savingName || !name.trim()}
                className={saveBtnCls}
              >
                {savingName ? "Gemmer…" : "Gem navn"}
              </button>
            </div>
          </form>
        </Section>

        {/* ── Adgangskode ── */}
        <Section icon={<KeyRound className="size-4" />} title="Adgangskode">
          <form onSubmit={handleSavePassword} className="flex flex-col gap-3">
            <div>
              <label className={labelCls}>Nuværende adgangskode</label>
              <input
                type="password"
                value={currentPw}
                onChange={(e) => setCurrentPw(e.target.value)}
                className={inputCls}
                placeholder="••••••••"
                autoComplete="current-password"
              />
            </div>
            <div>
              <label className={labelCls}>Ny adgangskode</label>
              <input
                type="password"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                className={inputCls}
                placeholder="Mindst 6 tegn"
                autoComplete="new-password"
              />
            </div>
            <div>
              <label className={labelCls}>Gentag ny adgangskode</label>
              <input
                type="password"
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                className={inputCls}
                placeholder="••••••••"
                autoComplete="new-password"
              />
            </div>
            <div>
              <button
                type="submit"
                disabled={savingPw || !currentPw || !newPw || !confirmPw}
                className={saveBtnCls}
              >
                {savingPw ? "Gemmer…" : "Skift adgangskode"}
              </button>
            </div>
          </form>
        </Section>

        {/* ── E-mail notifikationer ── */}
        <Section
          icon={<Mail className="size-4" />}
          title="E-mail notifikationer"
        >
          <div className="flex flex-col gap-4">
            {emailPrefs === null ? (
              <p className="text-sm text-neutral-400">Indlæser…</p>
            ) : (
              <>
                <Toggle
                  enabled={emailPrefs.email_on_mention}
                  label="Omtaler"
                  description="Modtag en e-mail når du @omtales i chatten"
                  onToggle={() => toggleEmailPref("email_on_mention")}
                />
                <div className="border-t border-neutral-100" />
                <Toggle
                  enabled={emailPrefs.email_on_nights}
                  label="Nye klubaftener"
                  description="Modtag en e-mail når der tilføjes nye aftener til programmet"
                  onToggle={() => toggleEmailPref("email_on_nights")}
                />
                <div className="border-t border-neutral-100" />
                <Toggle
                  enabled={emailPrefs.email_on_shift}
                  label="Vagtplan"
                  description="Modtag en e-mail når du tildeles en vagt"
                  onToggle={() => toggleEmailPref("email_on_shift")}
                />
              </>
            )}
          </div>
        </Section>

        {/* ── Brætspil (BGG) ── */}
        <Section
          icon={<Upload className="size-4" />}
          title="Brætspil (BoardGameGeek)"
        >
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
              . Kun spil markeret som <em>ejet</em> importeres. Uploader du igen
              erstattes den gamle liste automatisk.
            </p>
            {bggPrefs !== null && bggPrefs.game_count > 0 && (
              <p className="text-sm font-medium text-neutral-700">
                {bggPrefs.game_count} spil i din samling
              </p>
            )}

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

            {bggPrefs !== null && (
              <div className="flex flex-col gap-4 pt-2 border-t border-neutral-100">
                <Toggle
                  enabled={bggPrefs.bgg_share_collection}
                  label="Del min samling"
                  description="Inkluder mine spil på den offentlige brætspilsliste"
                  onToggle={() => toggleBggPref("bgg_share_collection")}
                />
                <div className="border-t border-neutral-100" />
                <Toggle
                  enabled={bggPrefs.bgg_share_name}
                  label="Vis mit navn som ejer"
                  description="Dit navn vises ved siden af dine spil på listen"
                  onToggle={() => toggleBggPref("bgg_share_name")}
                />
              </div>
            )}
          </div>
        </Section>
      </div>

      {/* ── Data eksport ── */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-5 flex flex-col gap-3">
        <div>
          <h2 className="font-semibold text-neutral-900 text-sm">
            Eksportér mine data
          </h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            Download alle dine personoplysninger som en JSON-fil.
          </p>
        </div>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="flex items-center gap-2 h-9 px-4 rounded-lg border border-neutral-300 text-neutral-700 text-sm font-medium hover:bg-neutral-50 transition-colors cursor-pointer bg-transparent w-fit disabled:opacity-50"
        >
          <Download className="size-4" />
          {exporting ? "Eksporterer…" : "Download mine data"}
        </button>
      </div>

      {/* ── Danger zone ── */}
      <div className="rounded-2xl border border-red-200 bg-red-50 p-5 flex flex-col gap-3">
        <div>
          <h2 className="font-semibold text-red-700 text-sm">Slet konto</h2>
          <p className="text-xs text-red-500 mt-0.5">
            Disse handlinger kan ikke fortrydes.
          </p>
        </div>
        <button
          onClick={() => setShowDelete(true)}
          className="flex items-center gap-2 h-9 px-4 rounded-lg border border-red-300 text-red-700 text-sm font-medium hover:bg-red-100 transition-colors cursor-pointer bg-transparent w-fit"
        >
          <Trash2 className="size-4" />
          Slet min konto
        </button>
      </div>

      <DeleteAccountModal
        open={showDelete}
        onClose={() => setShowDelete(false)}
      />
    </div>
  );
}
