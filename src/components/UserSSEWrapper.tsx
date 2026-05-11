"use client";

import { useCallback } from "react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import {
  UserSSEProvider,
  useUserSSE,
  UserSSEEvent,
} from "@/lib/UserSSEContext";
import { postRefreshAuth } from "@/lib/api";
import { ReactNode } from "react";

/** Subscribes to SSE and silently refreshes the JWT when roles change. */
function RolesRefresher() {
  const { updateUser } = useAuth();

  useUserSSE(
    useCallback(
      (evt: UserSSEEvent) => {
        if (evt.event !== "roles_changed") return;
        postRefreshAuth()
          .then((freshUser) => {
            updateUser(freshUser);
            toast.info("Dine rettigheder er blevet opdateret.");
          })
          .catch(() => {
            // Silently ignore — the user will see the change after their next login
          });
      },
      [updateUser],
    ),
  );

  return null;
}

export function UserSSEWrapper({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return (
    <UserSSEProvider userId={user?.id ?? null}>
      <RolesRefresher />
      {children}
    </UserSSEProvider>
  );
}
