"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

/**
 * Redirects to /login if the user is not authenticated.
 * Pass `anyOf` to require at least one of those roles; redirects to
 * /member/profile if the user has none of them.
 *
 * Returns `{ user, authorized }` where `authorized` is false while loading
 * or if the user lacks the required role — the page should render nothing
 * until `authorized` is true.
 */
export function useRequireAuth(anyOf?: string[]) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    if (user === null) {
      router.replace("/login");
      return;
    }
    if (anyOf && !anyOf.some((r) => user.roles.includes(r))) {
      router.replace("/member/dashboard");
    }
  }, [user, isLoading, router, anyOf?.join()]);

  const authorized =
    !isLoading &&
    user !== null &&
    (!anyOf || anyOf.some((r) => user.roles.includes(r)));

  return { user: authorized ? user : null, authorized, isLoading };
}
