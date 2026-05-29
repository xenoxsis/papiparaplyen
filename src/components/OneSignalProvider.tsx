"use client";

import { useEffect } from "react";
import OneSignal from "react-onesignal";

/**
 * Initialises the OneSignal Web Push SDK once on mount.
 * Renders nothing — purely a side-effect component.
 *
 * Place inside <AuthProvider> in app/layout.tsx so auth-context
 * can call OneSignal.login / logout independently.
 */
export function OneSignalProvider() {
  useEffect(() => {
    const appId = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;
    if (!appId) return; // not configured

    // OneSignal apps are locked to a specific origin — skip on localhost
    // to avoid console errors during local development.
    if (
      typeof window !== "undefined" &&
      window.location.hostname === "localhost"
    )
      return;

    OneSignal.init({
      appId,
      notifyButton: { enable: false }, // hide built-in bell — we have our own
      serviceWorkerPath: "/OneSignalSDKWorker.js",
      promptOptions: {
        slidedown: {
          enabled: true,
          autoPrompt: false,
          actionMessage: "Vil du modtage notifikationer fra Esbjerg Brætspil?",
          acceptButtonText: "Ja tak",
          cancelButtonText: "Nej tak",
        },
      },
    }).catch((err) => console.warn("[OneSignal] init failed:", err));
  }, []);

  return null;
}
