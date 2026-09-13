"use client";

/**
 * `beforeinstallprompt` fires at most once per browser session for the
 * origin, and only ever reaches whichever listener is attached at that
 * exact moment. Capturing it into one component's local state (the
 * original approach) only works for that one mounted instance — sign-in
 * is a client-side navigation with no full page reload, so by the time
 * the signed-in app's own InstallPrompt (in TopBar) mounts, the event has
 * already fired and gone to the landing page's now-unmounted copy instead.
 *
 * Module-level state sidesteps this: this file's top-level code runs once
 * per page load and keeps running across client-side route changes (the
 * module isn't re-evaluated on navigation), so whichever InstallPrompt
 * happens to be mounted when the event fires — or mounts afterward and
 * asks — sees the same captured event.
 */

/** Not in lib.dom.d.ts — Chrome/Edge/Android only. */
export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    installed = true;
    notify();
  });
}

export function getDeferredPrompt(): BeforeInstallPromptEvent | null {
  return deferredPrompt;
}

export function wasInstalledThisSession(): boolean {
  return installed;
}

export function clearDeferredPrompt(): void {
  deferredPrompt = null;
}

/** Returns an unsubscribe function, matching useSyncExternalStore's contract. */
export function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}
