"use client";

import { useEffect, useReducer } from "react";
import {
  getEmailPrefs,
  patchEmailPrefs,
  patchMe,
  changePassword,
  type ApiEmailPrefs,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";

interface EditProfileModalProps {
  open: boolean;
  onClose: () => void;
}

// ── Edit-modal state ──────────────────────────────────────────────────────────
type EditState = {
  tab: "name" | "password" | "emails";
  name: string;
  currentPw: string;
  newPw: string;
  confirmPw: string;
  saving: boolean;
  emailPrefs: ApiEmailPrefs | null;
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

export function EditProfileModal({ open, onClose }: EditProfileModalProps) {
  const { user, updateUser } = useAuth();
  const [edit, dispatch] = useReducer(editReducer, initialEditState);

  useEffect(() => {
    if (!open) return;
    dispatch({ type: "RESET", name: user?.name ?? "" });
    getEmailPrefs()
      .then((prefs) =>
        dispatch({ type: "SET", payload: { emailPrefs: prefs } }),
      )
      .catch(console.error);
  }, [open, user?.name]);

  async function handleSaveName() {
    if (!edit.name.trim()) return;
    dispatch({ type: "SET", payload: { saving: true } });
    try {
      const result = await patchMe(edit.name.trim());
      updateUser({ name: result.name, initials: result.initials });
      toast.success("Navn opdateret");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Noget gik galt");
    } finally {
      dispatch({ type: "SET", payload: { saving: false } });
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
    dispatch({ type: "SET", payload: { saving: true } });
    try {
      await changePassword(edit.currentPw, edit.newPw);
      toast.success("Adgangskode ændret");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Noget gik galt");
    } finally {
      dispatch({ type: "SET", payload: { saving: false } });
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        className="bg-white rounded-2xl shadow-xl w-full max-w-sm flex flex-col overflow-hidden"
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
          {(["name", "password", "emails"] as const).map((tab) => {
            const labels = {
              name: "Navn",
              password: "Adgangskode",
              emails: "E-mails",
            };
            return (
              <button
                key={tab}
                onClick={() => dispatch({ type: "SET", payload: { tab } })}
                className={`flex-1 py-2.5 text-sm font-medium transition-colors cursor-pointer border-none bg-transparent ${
                  edit.tab === tab
                    ? "text-neutral-900 border-b-2 border-neutral-900"
                    : "text-neutral-500 hover:text-neutral-700"
                }`}
              >
                {labels[tab]}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="p-5 flex flex-col gap-4">
          {edit.tab === "emails" ? (
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
                  <div
                    key={key}
                    className="flex items-center justify-between gap-3"
                  >
                    <span className="text-sm text-neutral-700">
                      {labels[key]}
                    </span>
                    <button
                      role="switch"
                      aria-checked={enabled}
                      aria-label={labels[key]}
                      onClick={() => {
                        const next = !enabled;
                        dispatch({
                          type: "SET",
                          payload: {
                            emailPrefs: edit.emailPrefs
                              ? { ...edit.emailPrefs, [key]: next }
                              : edit.emailPrefs,
                          },
                        });
                        patchEmailPrefs({ [key]: next }).catch(console.error);
                      }}
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
              })}
            </div>
          ) : edit.tab === "name" ? (
            <>
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="edit-name"
                  className="text-xs font-medium text-neutral-700"
                >
                  Fulde navn
                </label>
                <input
                  id="edit-name"
                  type="text"
                  value={edit.name}
                  onChange={(e) =>
                    dispatch({ type: "SET", payload: { name: e.target.value } })
                  }
                  className="h-9 rounded-lg border border-neutral-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900"
                  placeholder="Dit navn"
                  onKeyDown={(e) => e.key === "Enter" && handleSaveName()}
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
          ) : (
            <>
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="edit-current-pw"
                  className="text-xs font-medium text-neutral-700"
                >
                  Nuværende adgangskode
                </label>
                <input
                  id="edit-current-pw"
                  type="password"
                  value={edit.currentPw}
                  onChange={(e) =>
                    dispatch({
                      type: "SET",
                      payload: { currentPw: e.target.value },
                    })
                  }
                  className="h-9 rounded-lg border border-neutral-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900"
                  placeholder="••••••••"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="edit-new-pw"
                  className="text-xs font-medium text-neutral-700"
                >
                  Ny adgangskode
                </label>
                <input
                  id="edit-new-pw"
                  type="password"
                  value={edit.newPw}
                  onChange={(e) =>
                    dispatch({
                      type: "SET",
                      payload: { newPw: e.target.value },
                    })
                  }
                  className="h-9 rounded-lg border border-neutral-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900"
                  placeholder="Mindst 6 tegn"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="edit-confirm-pw"
                  className="text-xs font-medium text-neutral-700"
                >
                  Gentag ny adgangskode
                </label>
                <input
                  id="edit-confirm-pw"
                  type="password"
                  value={edit.confirmPw}
                  onChange={(e) =>
                    dispatch({
                      type: "SET",
                      payload: { confirmPw: e.target.value },
                    })
                  }
                  className="h-9 rounded-lg border border-neutral-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900"
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
        </div>
      </div>
    </div>
  );
}
