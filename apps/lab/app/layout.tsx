import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque } from "next/font/google";
import "./globals.css";

export const metadata: Metadata = {
  title: "PlayLoop Lab",
  description: "Isolated test bench for AI-written PlayLoop games. No real points.",
};

export const viewport: Viewport = {
  themeColor: "#1b1446",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["400", "600", "800"],
  variable: "--font-bricolage",
  display: "swap",
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={bricolage.variable}>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
