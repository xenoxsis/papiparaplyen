"use client";

import Link from "next/link";
import { Calendar, User, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";

/**
 * Hero call-to-action buttons. The primary button adapts to auth state:
 * logged-out visitors are invited to join ("Bliv medlem"), while logged-in
 * members get a shortcut to their member area instead.
 */
export function HeroCta() {
  const { user, isLoading } = useAuth();

  return (
    <div className="flex flex-row gap-4 mt-2 justify-center sm:justify-start">
      {isLoading ? (
        // Hold a button-shaped placeholder until auth resolves so the primary
        // CTA never flashes the wrong label (e.g. "Bliv medlem" to a member).
        <div
          aria-hidden
          className="h-10 w-40 rounded-md bg-white/10 animate-pulse"
        />
      ) : (
        <Button asChild className="bg-red-500 hover:bg-red-600 text-white gap-2">
          {user ? (
            <Link href="/member/dashboard">
              <User className="size-4" />
              Medlemsområde
            </Link>
          ) : (
            <Link href="/login">
              <UserPlus className="size-4" />
              Bliv medlem
            </Link>
          )}
        </Button>
      )}
      <Button
        asChild
        variant="outline"
        className="bg-transparent text-white hover:bg-white/10 hover:text-white gap-2"
      >
        <Link href="/events">
          <Calendar className="size-4 text-white" />
          <span className="text-white">Se kommende aftener</span>
        </Link>
      </Button>
    </div>
  );
}
