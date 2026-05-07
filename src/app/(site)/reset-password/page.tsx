"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Lock, Dices } from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { resetPassword } from "@/lib/api";

function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) setError("Ugyldigt nulstillingslink.");
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (newPassword.length < 6) {
      setError("Adgangskoden skal være mindst 6 tegn.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Adgangskoderne matcher ikke.");
      return;
    }
    setLoading(true);
    try {
      await resetPassword(token, newPassword);
      setDone(true);
      setTimeout(() => router.push("/login"), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Noget gik galt.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="bg-white w-full min-h-[calc(100vh-3.5rem)] flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full bg-white border border-neutral-200 rounded-2xl p-8 flex flex-col gap-6 shadow-xl">
        {/* Header */}
        <div className="flex flex-col items-center gap-4">
          <div className="w-28 h-28 flex items-center justify-center">
            <Image
              src="/papiparaplyen-logo.png"
              alt="Pap i Paraplyen logo"
              width={112}
              height={112}
              className="object-contain w-full h-full"
            />
          </div>
          <div className="text-center flex flex-col items-center gap-2">
            <h1 className="font-bold text-neutral-900 text-2xl">
              {done ? "Adgangskode nulstillet" : "Ny adgangskode"}
            </h1>
            <p className="text-neutral-500 text-sm">
              {done
                ? "Du omdirigeres til login om et øjeblik…"
                : "Vælg en ny adgangskode til din konto."}
            </p>
          </div>
        </div>

        {!done && (
          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            <div className="flex flex-col gap-2">
              <label
                className="font-medium text-sm text-neutral-900"
                htmlFor="new-password"
              >
                Ny adgangskode
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-neutral-500 pointer-events-none" />
                <Input
                  id="new-password"
                  type="password"
                  placeholder="Mindst 6 tegn"
                  autoComplete="new-password"
                  className="pl-9"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <label
                className="font-medium text-sm text-neutral-900"
                htmlFor="confirm-password"
              >
                Gentag adgangskode
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-neutral-500 pointer-events-none" />
                <Input
                  id="confirm-password"
                  type="password"
                  placeholder="Gentag adgangskode"
                  autoComplete="new-password"
                  className="pl-9"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>
            </div>
            {error && (
              <p className="text-sm text-[#e63946] text-center">{error}</p>
            )}
            <Button
              type="submit"
              disabled={loading || !token}
              className="w-full bg-red-500 hover:bg-red-600 text-white gap-2"
            >
              {loading ? "Gemmer…" : "Gem ny adgangskode"}
            </Button>
          </form>
        )}

        {/* Footer */}
        <div className="flex items-center justify-center gap-3 text-neutral-500 text-sm">
          <Dices className="size-4 text-green-600" />
          <span>Velkommen til klubben</span>
          <Dices className="size-4 text-orange-400" />
        </div>
      </div>
    </section>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
