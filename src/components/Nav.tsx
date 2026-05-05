"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Calendar,
  Dices,
  Home,
  Info,
  LogIn,
  LogOut,
  Settings,
  ShieldCheck,
  User,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";

const navLinks = [
  { href: "/", label: "Hjem", icon: Home },
  { href: "/about", label: "Om os", icon: Info },
  { href: "/events", label: "Events", icon: Calendar },
];

export default function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout, pendingShiftCount } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleLogout() {
    setOpen(false);
    logout();
    router.push("/");
  }

  return (
    <nav className="bg-white border-b border-neutral-200 w-full">
      <div className="max-w-285 mx-auto px-8 py-4 flex flex-row items-center gap-6">
        <Link href="/" className="flex items-center gap-2 mr-4 shrink-0">
          <div className="w-8 h-8 rounded-full bg-neutral-900 flex items-center justify-center p-1">
            <Dices className="size-5 text-white" />
          </div>
          <span className="font-bold text-sm tracking-wide text-neutral-900 hidden sm:block">
            PAP I PARAPLYEN
          </span>
        </Link>

        {navLinks.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-1.5 font-medium text-sm pb-0.5 border-b-2 transition-colors ${
                isActive
                  ? "text-neutral-900 border-neutral-900"
                  : "text-neutral-500 border-transparent hover:text-neutral-900"
              }`}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          );
        })}

        {/* Spacer */}
        <div className="flex-1" />

        {user ? (
          /* Logged in — avatar + dropdown */
          <div ref={ref} className="relative">
            <button
              onClick={() => setOpen((v) => !v)}
              className="w-9 h-9 rounded-full bg-[#e63946] text-white flex items-center justify-center text-[0.65rem] font-bold select-none cursor-pointer hover:ring-2 hover:ring-[#e63946]/40 transition-all"
            >
              {user.initials}
            </button>

            {open && (
              <div className="absolute right-0 top-full mt-2 w-52 bg-white border border-neutral-200 rounded-xl shadow-lg overflow-hidden z-50">
                <div className="px-4 py-3 border-b border-neutral-100">
                  <p className="font-semibold text-sm text-neutral-900">
                    {user.name}
                  </p>
                </div>
                <div className="p-1">
                  <Link
                    href="/member/profile"
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-neutral-700 hover:bg-neutral-100 transition-colors"
                  >
                    <div className="relative">
                      <User className="size-4 text-neutral-500" />
                      {pendingShiftCount > 0 && (
                        <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-[#e63946]" />
                      )}
                    </div>
                    Medlemsområde
                  </Link>
                  {user.roles.includes("Administrator") && (
                    <>
                      <Link
                        href="/member/schedule"
                        onClick={() => setOpen(false)}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-neutral-700 hover:bg-neutral-100 transition-colors"
                      >
                        <ShieldCheck className="size-4 text-neutral-500" />
                        Vagtplan
                      </Link>
                      <Link
                        href="/member/admin"
                        onClick={() => setOpen(false)}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-neutral-700 hover:bg-neutral-100 transition-colors"
                      >
                        <Settings className="size-4 text-neutral-500" />
                        Brugeradmin
                      </Link>
                    </>
                  )}
                  {!user.roles.includes("Administrator") &&
                    user.roles.includes("Vagt") && (
                      <Link
                        href="/member/schedule"
                        onClick={() => setOpen(false)}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-neutral-700 hover:bg-neutral-100 transition-colors"
                      >
                        <ShieldCheck className="size-4 text-neutral-500" />
                        Vagtplan
                      </Link>
                    )}
                </div>
                <div className="p-1 border-t border-neutral-100">
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-[#e63946] hover:bg-[#e63946]/5 transition-colors"
                  >
                    <LogOut className="size-4" />
                    Log ud
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Logged out — Login button */
          <Link
            href="/login"
            className="flex items-center gap-1.5 bg-[#e63946] text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-red-600 transition-colors"
          >
            <LogIn className="size-4" />
            Login
          </Link>
        )}
      </div>
    </nav>
  );
}
