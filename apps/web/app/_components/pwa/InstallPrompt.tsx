"use client";

import { useEffect, useState } from "react";

/** Not in lib.dom.d.ts — Chrome/Edge/Android only. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

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
 * "Add to home screen" CTA. Chrome/Edge/Android fire `beforeinstallprompt`,
 * which this captures and replays on click via the real native install
 * dialog — there's no custom UI to build there beyond a button. iOS Safari
 * never fires that event and can't be prompted programmatically at all, so
 * it gets a short instruction popover instead (Share -> Add to Home Screen).
 * Renders nothing once already installed (standalone display mode), and
 * nothing on a browser that's neither of the above (desktop Firefox, etc.)
 * until/unless it ever supports the prompt.
 */
export function InstallPrompt({ className = "btn sm" }: { className?: string }) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIOSHelp, setShowIOSHelp] = useState(false);
  // {hidden, ios} together, set once per mount from feature detection that
  // can only run client-side (matchMedia/userAgent don't exist during SSR)
  // — not a response to an external event, so this is a one-time read, not
  // a subscription like the listeners below.
  const [{ hidden, ios }, setCapability] = useState({ hidden: true, ios: false });

  useEffect(() => {
    if (isStandalone()) return; // stays hidden
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time client capability read, not an event response
    setCapability({ hidden: false, ios: isIOS() });

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setDeferred(null);
      setCapability((c) => ({ ...c, hidden: true }));
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (hidden) return null;
  // Neither a captured Chrome-style prompt nor iOS: nothing this browser can do.
  if (!deferred && !ios) return null;

  async function install() {
    if (!deferred) {
      setShowIOSHelp(true);
      return;
    }
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
    setCapability((c) => ({ ...c, hidden: true }));
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
