import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque } from "next/font/google";
import { Suspense } from "react";
import { ServiceWorkerRegister } from "./_components/pwa/ServiceWorkerRegister";
import { NavigationProgress } from "./_components/NavigationProgress";
import "./globals.css";

export const metadata: Metadata = {
  title: "playloop",
  description: "Play. Create. Earn.",
  appleWebApp: { title: "playloop" },
};

export const viewport: Viewport = {
  themeColor: "#5b3bff",
};

// --font-display (packages/ui/src/theme.css) names this family, but nothing
// ever loaded it — every page has been silently falling back to system-ui.
// Loaded as a CSS variable, consumed by the --font-display token itself
// (see globals.css), rather than applied directly here, so this stays the
// single place the font is fetched.
const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["600", "800"],
  variable: "--font-bricolage",
  display: "swap",
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={bricolage.variable}>
      {/*
       * suppressHydrationWarning on <body> specifically: several common
       * browser extensions (ColorZilla's cz-shortcut-listen is the one
       * reproduced here; Grammarly and others do similar things) add
       * attributes to <body> before React hydrates, which otherwise trips
       * a hydration-mismatch warning that has nothing to do with our
       * markup. This only suppresses the warning for <body> itself, not
       * its children, so a real mismatch elsewhere still gets reported.
       * https://nextjs.org/docs/messages/react-hydration-error
       */}
      <body suppressHydrationWarning>
        <ServiceWorkerRegister />
        <Suspense fallback={null}>
          <NavigationProgress />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
