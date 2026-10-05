"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { trackPageView } from "@/lib/api";

/**
 * Sends one anonymous page-view beacon per client-side navigation.
 * The external referrer is only sent with the first view of a visit —
 * document.referrer does not change on Next.js client navigations.
 * Disabled on localhost (dev + Cypress).
 */
export default function PageViewTracker() {
  const pathname = usePathname();
  const lastPath = useRef<string | null>(null);
  const sentReferrer = useRef(false);

  useEffect(() => {
    if (!pathname || pathname === lastPath.current) return;
    // Dev servers proxy to the production backend — don't pollute its stats.
    if (window.location.hostname === "localhost") return;
    lastPath.current = pathname;
    const referrer = sentReferrer.current ? undefined : document.referrer;
    sentReferrer.current = true;
    trackPageView(pathname, referrer);
  }, [pathname]);

  return null;
}
