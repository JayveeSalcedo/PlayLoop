import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "playloop",
  description: "Play. Create. Earn.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
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
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
