"use client";

import { useEffect } from "react";

/**
 * Registers public/sw.js once, app-wide. Rendered from the root layout so
 * it runs regardless of which page loads first (landing or straight into
 * the signed-in app) — this is what installState.ts's beforeinstallprompt
 * capture actually depends on for Android, not just a nice-to-have.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Best-effort — only the install CTA/native browser affordance
        // depends on this; nothing else in the app does.
      });
    }
  }, []);

  return null;
}
