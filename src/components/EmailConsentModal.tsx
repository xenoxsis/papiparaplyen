"use client";

import { useEffect, useState } from "react";
import { getEmailPrefs, patchEmailPrefs } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

type Prefs = {
  email_on_mention: boolean;
  email_on_nights: boolean;
  email_on_shift: boolean;
};

const PREF_LABELS: { key: keyof Prefs; label: string; description: string }[] =
  [
    {
      key: "email_on_mention",
      label: "Omtaler i chat",
      description: "Modtag en e-mail når nogen nævner dig i en kanal.",
    },
    {
      key: "email_on_nights",
      label: "Nye klubaftener",
      description:
        "Modtag en e-mail når der oprettes nye klubaftener i kalenderen.",
    },
    {
      key: "email_on_shift",
      label: "Vagttildelinger",
      description:
        "Modtag en e-mail når du tildeles eller fjernes fra en vagt.",
    },
  ];

export default function EmailConsentModal() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [prefs, setPrefs] = useState<Prefs>({
    email_on_mention: false,
    email_on_nights: false,
    email_on_shift: false,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    getEmailPrefs()
      .then((data) => {
        if (data.needs_consent) {
          setPrefs({
            email_on_mention: data.email_on_mention,
            email_on_nights: data.email_on_nights,
            email_on_shift: data.email_on_shift,
          });
          setOpen(true);
        }
      })
      .catch(() => {
        // silently ignore — non-critical
      });
  }, [user]);

  async function handleConfirm() {
    setSaving(true);
    try {
      await patchEmailPrefs({ ...prefs, consent_confirmed: true });
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 flex flex-col gap-5">
        <div>
          <h2 className="text-lg font-bold text-neutral-900">
            E-mailnotifikationer
          </h2>
          <p className="text-sm text-neutral-600 mt-1">
            Vælg hvilke e-mails du ønsker at modtage fra Esbjerg Brætspil. Du
            kan til enhver tid ændre dine valg under din profil.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          {PREF_LABELS.map(({ key, label, description }) => (
            <label
              key={key}
              className="flex items-start gap-3 cursor-pointer group"
            >
              <div className="mt-0.5">
                <input
                  type="checkbox"
                  checked={prefs[key]}
                  onChange={(e) =>
                    setPrefs((p) => ({ ...p, [key]: e.target.checked }))
                  }
                  className="w-4 h-4 rounded border-neutral-300 accent-red-500"
                />
              </div>
              <div>
                <span className="text-sm font-medium text-neutral-900 group-hover:text-red-600 transition-colors">
                  {label}
                </span>
                <p className="text-xs text-neutral-500">{description}</p>
              </div>
            </label>
          ))}
        </div>

        <p className="text-xs text-neutral-400">
          Ved at klikke &ldquo;Bekræft&rdquo; giver du samtykke til behandling
          af din e-mailadresse til ovenstående formål jf.{" "}
          <a href="/privacy" className="underline hover:text-neutral-600">
            privatlivspolitikken
          </a>
          . Du kan til enhver tid trække dit samtykke tilbage.
        </p>

        <button
          onClick={handleConfirm}
          disabled={saving}
          className="w-full bg-red-500 hover:bg-red-600 disabled:opacity-60 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors"
        >
          {saving ? "Gemmer…" : "Bekræft valg"}
        </button>
      </div>
    </div>
  );
}
