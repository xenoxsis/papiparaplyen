"use client";

import { useAuth } from "@/lib/auth-context";
import { UserSSEProvider } from "@/lib/UserSSEContext";
import { ReactNode } from "react";

export function UserSSEWrapper({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return (
    <UserSSEProvider userId={user?.id ?? null}>{children}</UserSSEProvider>
  );
}
