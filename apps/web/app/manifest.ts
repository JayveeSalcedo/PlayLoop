import type { MetadataRoute } from "next";

/**
 * Next.js serves this at /manifest.webmanifest and links it into every
 * page's <head> automatically — no manual <link rel="manifest"> needed.
 * start_url is "/" (not "/feed") so it goes through the same signed-in/out
 * branch page.tsx already has: a returning installed user lands on /feed,
 * an installed-but-signed-out visitor sees the landing page, same as a
 * plain browser visit.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "playloop",
    short_name: "playloop",
    description: "Play. Create. Earn.",
    start_url: "/",
    display: "standalone",
    background_color: "#f0ecff",
    theme_color: "#5b3bff",
    icons: [
      { src: "/icon-192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
