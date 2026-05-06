"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

/**
 * Redirects to /login if the user is not authenticated.
 * Optionally, pass a required role (e.g. "Administrator") to also enforce RBAC.
 */
export function useRequireAuth(requiredRole?: string) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return; // wait for localStorage to be read
    if (user === null) {
      router.replace("/login");
      return;
    }
    if (requiredRole && !user.roles.includes(requiredRole)) {
      router.replace("/member/profile");
    }
  }, [user, isLoading, requiredRole, router]);

  return user;
}
