"use client";

export const dynamic = "force-dynamic";

import { Suspense, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

function OAuthHandler() {
  const searchParams = useSearchParams();
  const { loginWithData } = useAuth();
  const router = useRouter();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    const userParam = searchParams.get("user");
    const error = searchParams.get("error");

    if (error || !userParam) {
      router.replace("/login?error=oauth");
      return;
    }

    try {
      const decoded = atob(userParam.replace(/-/g, "+").replace(/_/g, "/"));
      const user = JSON.parse(decoded) as {
        id: number;
        name: string;
        initials: string;
        roles: string[];
      };
      loginWithData(user);
      router.replace("/member/dashboard");
    } catch {
      router.replace("/login?error=oauth");
    }
  }, [searchParams, loginWithData, router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-neutral-500 text-sm">Logger ind…</p>
    </div>
  );
}

export default function OAuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <p className="text-neutral-500 text-sm">Logger ind…</p>
        </div>
      }
    >
      <OAuthHandler />
    </Suspense>
  );
}
