"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  LogIn,
  Mail,
  Lock,
  Eye,
  EyeOff,
  UserPlus,
  Dices,
  User,
} from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth-context";
import { postRegister } from "@/lib/api";

export default function LoginPage() {
  const [tab, setTab] = useState<"login" | "register">("login");

  // Login state
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");

  // Register state
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regPassword2, setRegPassword2] = useState("");
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [regError, setRegError] = useState("");
  const [regLoading, setRegLoading] = useState(false);

  const { login } = useAuth();
  const router = useRouter();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginError("");
    const ok = await login(email, password);
    if (ok) {
      router.push("/member/profile");
    } else {
      setLoginError("Forkert e-mail eller adgangskode.");
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setRegError("");
    if (regPassword !== regPassword2) {
      setRegError("Adgangskoderne matcher ikke.");
      return;
    }
    if (regPassword.length < 6) {
      setRegError("Adgangskoden skal være mindst 6 tegn.");
      return;
    }
    setRegLoading(true);
    try {
      await postRegister(regName.trim(), regEmail.trim(), regPassword);
      const ok = await login(regEmail.trim(), regPassword);
      if (ok) {
        router.push("/member/profile");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Noget gik galt.";
      setRegError(
        msg === "Email already in use" ? "E-mailen er allerede i brug." : msg,
      );
    } finally {
      setRegLoading(false);
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
              {tab === "login" ? "Medlemslogin" : "Bliv medlem"}
            </h1>
            <p className="text-neutral-500 text-sm">
              {tab === "login"
                ? "Log ind for at snakke med os alle."
                : "Opret din profil og kom med i klubben."}
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex rounded-lg border border-neutral-200 overflow-hidden">
          <button
            onClick={() => setTab("login")}
            className={`flex-1 py-2 text-sm font-medium transition-colors cursor-pointer ${tab === "login" ? "bg-neutral-900 text-white" : "bg-white text-neutral-500 hover:bg-neutral-50"}`}
          >
            Log ind
          </button>
          <button
            onClick={() => setTab("register")}
            className={`flex-1 py-2 text-sm font-medium transition-colors cursor-pointer ${tab === "register" ? "bg-neutral-900 text-white" : "bg-white text-neutral-500 hover:bg-neutral-50"}`}
          >
            Bliv medlem
          </button>
        </div>

        {tab === "login" ? (
          <form className="flex flex-col gap-4" onSubmit={handleLogin}>
            <div className="flex flex-col gap-2">
              <label
                className="font-medium text-sm text-neutral-900"
                htmlFor="email"
              >
                E-mail
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-neutral-500 pointer-events-none" />
                <Input
                  id="email"
                  type="email"
                  placeholder="din@email.dk"
                  autoComplete="email"
                  className="pl-9"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <label
                className="font-medium text-sm text-neutral-900"
                htmlFor="password"
              >
                Adgangskode
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-neutral-500 pointer-events-none" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="pl-9 pr-9"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-neutral-500 flex items-center justify-center"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={
                    showPassword ? "Skjul adgangskode" : "Vis adgangskode"
                  }
                >
                  {showPassword ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </button>
              </div>
            </div>
            {loginError && (
              <p className="text-sm text-[#e63946] text-center">{loginError}</p>
            )}
            <Button
              type="submit"
              className="w-full bg-red-500 hover:bg-red-600 text-white gap-2"
            >
              <LogIn className="size-4" />
              Log ind
            </Button>
          </form>
        ) : (
          <form className="flex flex-col gap-4" onSubmit={handleRegister}>
            <div className="flex flex-col gap-2">
              <label
                className="font-medium text-sm text-neutral-900"
                htmlFor="reg-name"
              >
                Fulde navn
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-neutral-500 pointer-events-none" />
                <Input
                  id="reg-name"
                  type="text"
                  placeholder="Fornavn Efternavn"
                  autoComplete="name"
                  className="pl-9"
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <label
                className="font-medium text-sm text-neutral-900"
                htmlFor="reg-email"
              >
                E-mail
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-neutral-500 pointer-events-none" />
                <Input
                  id="reg-email"
                  type="email"
                  placeholder="din@email.dk"
                  autoComplete="email"
                  className="pl-9"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <label
                className="font-medium text-sm text-neutral-900"
                htmlFor="reg-password"
              >
                Adgangskode
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-neutral-500 pointer-events-none" />
                <Input
                  id="reg-password"
                  type={showRegPassword ? "text" : "password"}
                  placeholder="Mindst 6 tegn"
                  autoComplete="new-password"
                  className="pl-9 pr-9"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-neutral-500 flex items-center justify-center"
                  onClick={() => setShowRegPassword((v) => !v)}
                  aria-label={
                    showRegPassword ? "Skjul adgangskode" : "Vis adgangskode"
                  }
                >
                  {showRegPassword ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </button>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <label
                className="font-medium text-sm text-neutral-900"
                htmlFor="reg-password2"
              >
                Gentag adgangskode
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-neutral-500 pointer-events-none" />
                <Input
                  id="reg-password2"
                  type={showRegPassword ? "text" : "password"}
                  placeholder="Gentag adgangskode"
                  autoComplete="new-password"
                  className="pl-9"
                  value={regPassword2}
                  onChange={(e) => setRegPassword2(e.target.value)}
                  required
                />
              </div>
            </div>
            {regError && (
              <p className="text-sm text-[#e63946] text-center">{regError}</p>
            )}
            <Button
              type="submit"
              disabled={regLoading}
              className="w-full bg-red-500 hover:bg-red-600 text-white gap-2"
            >
              <UserPlus className="size-4" />
              {regLoading ? "Opretter konto…" : "Opret konto"}
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
