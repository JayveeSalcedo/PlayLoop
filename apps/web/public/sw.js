// Minimal service worker — exists only to satisfy Chrome's installability
// criteria. Android Chrome requires a registered service worker with a
// fetch handler before it will fire beforeinstallprompt at all; desktop
// Chrome is more lenient and doesn't need this (which is why the install
// CTA worked there already but not on Android). Deliberately does no
// caching — every request just passes straight through to the network —
// so there's no offline behavior or stale-content risk to reason about.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  // Let navigation requests (page loads) pass through to the network
  // without interception — returning Response.error() on failure would
  // show an opaque network-error page instead of the browser's own.
  if (event.request.mode === "navigate") return;

  event.respondWith(
    fetch(event.request).catch(() => {
      return Response.error();
    })
  );
});
