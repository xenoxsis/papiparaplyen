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
  Menu,
  Settings,
  Shield,
  ShieldCheck,
  User,
  X,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useNotifications } from "@/lib/useNotifications";
import NotificationBell from "@/components/NotificationBell";

const navLinks = [
  { href: "/", label: "Hjem", icon: Home },
  { href: "/about", label: "Om os", icon: Info },
  { href: "/events", label: "Events", icon: Calendar },
];

export default function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout, pendingShiftCount } = useAuth();
  const { notifications, unreadCount, markRead, markAllRead } =
    useNotifications(user?.id ?? null);
  const [open, setOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
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
    setMenuOpen(false);
    logout();
    router.push("/");
  }

  return (
    <nav className="bg-white border-b border-neutral-200 w-full relative z-40">
      <div className="max-w-285 mx-auto px-4 sm:px-8 py-4 flex flex-row items-center gap-6">
        <Link href="/" className="flex items-center gap-2 mr-4 shrink-0">
          <div className="w-8 h-8 rounded-full bg-neutral-900 flex items-center justify-center p-1">
            <Dices className="size-5 text-white" />
          </div>
          <span className="font-bold text-sm tracking-wide text-neutral-900 hidden sm:block">
            PAP I PARAPLYEN
          </span>
        </Link>

        {/* Desktop nav links */}
        {navLinks.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`hidden sm:flex items-center gap-1.5 font-medium text-sm pb-0.5 border-b-2 transition-colors ${
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

        {/* Mobile hamburger button */}
        <button
          className="sm:hidden flex items-center justify-center p-2 rounded-lg text-neutral-700 hover:bg-neutral-100 transition-colors"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="Toggle menu"
        >
          {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>

        {user && (
          <NotificationBell
            notifications={notifications}
            unreadCount={unreadCount}
            onMarkRead={markRead}
            onMarkAllRead={markAllRead}
          />
        )}

        {user ? (
          /* Logged in — avatar (desktop: clickable dropdown, mobile: display only) */
          <div ref={ref} className="relative">
            {/* Desktop: button with dropdown */}
            <button
              onClick={() => setOpen((v) => !v)}
              className="hidden sm:flex w-9 h-9 rounded-full bg-brand-red text-white items-center justify-center text-[0.65rem] font-bold select-none cursor-pointer hover:ring-2 hover:ring-brand-red/40 transition-all"
            >
              {user.initials}
            </button>
            {/* Mobile: non-interactive avatar */}
            <div className="sm:hidden w-9 h-9 rounded-full bg-brand-red text-white flex items-center justify-center text-[0.65rem] font-bold select-none">
              {user.initials}
            </div>

            {open && (
              <div className="hidden sm:block absolute right-0 top-full mt-2 w-52 bg-white border border-neutral-200 rounded-xl shadow-lg overflow-hidden z-50">
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
                        <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-brand-red" />
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
                        href="/member/vagter"
                        onClick={() => setOpen(false)}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-neutral-700 hover:bg-neutral-100 transition-colors"
                      >
                        <Shield className="size-4 text-neutral-500" />
                        Vagt Info
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
                    (user.roles.includes("Vagt") ||
                      user.roles.includes("Tilskuer")) && (
                      <Link
                        href="/member/schedule"
                        onClick={() => setOpen(false)}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-neutral-700 hover:bg-neutral-100 transition-colors"
                      >
                        <ShieldCheck className="size-4 text-neutral-500" />
                        Vagtplan
                      </Link>
                    )}
                  {!user.roles.includes("Administrator") &&
                    user.roles.includes("Vagt") && (
                      <Link
                        href="/member/vagter"
                        onClick={() => setOpen(false)}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-neutral-700 hover:bg-neutral-100 transition-colors"
                      >
                        <Shield className="size-4 text-neutral-500" />
                        Vagt Info
                      </Link>
                    )}
                </div>
                <div className="p-1 border-t border-neutral-100">
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-brand-red hover:bg-brand-red/5 transition-colors"
                  >
                    <LogOut className="size-4" />
                    Log ud
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Logged out — Login button (desktop only; mobile menu has its own) */
          <Link
            href="/login"
            className="hidden sm:flex items-center gap-1.5 bg-brand-red text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-red-600 transition-colors"
          >
            <LogIn className="size-4" />
            Login
          </Link>
        )}
      </div>

      {/* Mobile dropdown menu */}
      {menuOpen && (
        <div className="sm:hidden border-t border-neutral-200 bg-white px-4 py-3 flex flex-col gap-1">
          {navLinks.map(({ href, label, icon: Icon }) => {
            const isActive = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setMenuOpen(false)}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-neutral-100 text-neutral-900"
                    : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
                }`}
              >
                <Icon className="size-4" />
                {label}
              </Link>
            );
          })}
          {!user && (
            <Link
              href="/login"
              onClick={() => setMenuOpen(false)}
              className="flex items-center gap-2 mt-1 bg-brand-red text-white text-sm font-medium px-3 py-2.5 rounded-lg hover:bg-red-600 transition-colors"
            >
              <LogIn className="size-4" />
              Login
            </Link>
          )}
          {user && (
            <div className="flex flex-col gap-1 mt-1 border-t border-neutral-100 pt-2">
              <Link
                href="/member/profile"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm text-neutral-700 hover:bg-neutral-100 transition-colors"
              >
                <User className="size-4 text-neutral-500" />
                Medlemsområde
              </Link>
              {(user.roles.includes("Administrator") ||
                user.roles.includes("Vagt") ||
                user.roles.includes("Tilskuer")) && (
                <Link
                  href="/member/schedule"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm text-neutral-700 hover:bg-neutral-100 transition-colors"
                >
                  <ShieldCheck className="size-4 text-neutral-500" />
                  Vagtplan
                </Link>
              )}
              {(user.roles.includes("Administrator") ||
                user.roles.includes("Vagt")) && (
                <Link
                  href="/member/vagter"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm text-neutral-700 hover:bg-neutral-100 transition-colors"
                >
                  <Shield className="size-4 text-neutral-500" />
                  Vagt Info
                </Link>
              )}
              {user.roles.includes("Administrator") && (
                <Link
                  href="/member/admin"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm text-neutral-700 hover:bg-neutral-100 transition-colors"
                >
                  <Settings className="size-4 text-neutral-500" />
                  Brugeradmin
                </Link>
              )}
              <button
                onClick={handleLogout}
                className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm text-brand-red hover:bg-brand-red/5 transition-colors"
              >
                <LogOut className="size-4" />
                Log ud
              </button>
            </div>
          )}
        </div>
      )}
    </nav>
  );
}
