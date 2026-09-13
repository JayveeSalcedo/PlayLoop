"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { clearDeferredPrompt, getDeferredPrompt, subscribe } from "./installState";

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari's own flag — not in the standard Navigator type.
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

/**
 * "Add to home screen" CTA. Reads the captured `beforeinstallprompt` event
 * from installState.ts's module-level store (see that file's comment) via
 * useSyncExternalStore, rather than listening for the event itself — the
 * event fires at most once per session, and this component gets mounted
 * and unmounted repeatedly (landing page, then again in TopBar once
 * signed in) as the visitor navigates, so only a shared store outside any
 * one instance's lifecycle can catch it reliably regardless of which
 * instance happens to be mounted when it fires. Chrome/Edge/Android
 * replay it via the real native install dialog on click — there's no
 * custom UI to build there. iOS Safari never fires that event and can't
 * be prompted programmatically at all, so it gets a short instruction
 * popover instead (Share -> Add to Home Screen). Renders nothing once
 * already installed (standalone display mode), and nothing on a browser
 * that's neither of the above (desktop Firefox, etc.).
 */
export function InstallPrompt({ className = "btn sm" }: { className?: string }) {
  const deferred = useSyncExternalStore(subscribe, getDeferredPrompt, () => null);
  const [showIOSHelp, setShowIOSHelp] = useState(false);
  // Feature detection that can only run client-side (matchMedia/userAgent
  // don't exist during SSR) — starts hidden so the server-rendered and
  // first client render match, then reveals once after mount.
  const [{ mounted, standalone, ios }, setCapability] = useState({ mounted: false, standalone: false, ios: false });

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time client capability read, not an event response
    setCapability({ mounted: true, standalone: isStandalone(), ios: isIOS() });
  }, []);

  if (!mounted || standalone) return null;
  // Neither a captured Chrome-style prompt nor iOS: nothing this browser can do.
  if (!deferred && !ios) return null;

  async function install() {
    if (!deferred) {
      setShowIOSHelp(true);
      return;
    }
    await deferred.prompt();
    await deferred.userChoice;
    clearDeferredPrompt();
  }

  return (
    <div className="relative">
      <button type="button" className={className} onClick={install}>
        Add to home screen
      </button>
      {showIOSHelp ? (
        <div
          className="absolute right-0 z-50 mt-2 w-56 rounded-2xl bg-card p-3 text-xs font-bold text-soft [border:var(--border-thick)] [box-shadow:var(--shadow-hard-sm)]"
          role="dialog"
        >
          Tap the Share icon, then <b className="text-ink">Add to Home Screen</b>.
          <button type="button" className="btn sm mt-2 block" onClick={() => setShowIOSHelp(false)}>
            Got it
          </button>
        </div>
      ) : null}
    </div>
  );
}
