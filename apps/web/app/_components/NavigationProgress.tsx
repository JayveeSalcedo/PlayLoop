"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  // When pathname or searchParams change, navigation finished
  useEffect(() => {
    const timer = setTimeout(() => {
      setLoading((isLoading) => {
        if (isLoading) {
          setProgress(100);
          setTimeout(() => {
            setLoading(false);
            setProgress(0);
          }, 250);
        }
        return isLoading;
      });
    }, 0);

    return () => clearTimeout(timer);
  }, [pathname, searchParams]);

  // Intercept click on internal links
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = (e.target as HTMLElement)?.closest("a");
      if (!target) return;

      const href = target.getAttribute("href");
      if (!href) return;

      // Ignore hash links, external links, downloads, new tabs
      if (
        href.startsWith("#") ||
        href.startsWith("http://") ||
        href.startsWith("https://") ||
        href.startsWith("mailto:") ||
        href.startsWith("tel:") ||
        target.target === "_blank" ||
        e.defaultPrevented ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey
      ) {
        return;
      }

      // Check if target href is different from current path
      const currentUrl = window.location.pathname + window.location.search;
      if (href === currentUrl) return;

      setLoading(true);
      setProgress(25);

      // Advance progress smoothly while waiting for server response
      const timer1 = setTimeout(() => setProgress(55), 180);
      const timer2 = setTimeout(() => setProgress(82), 420);

      return () => {
        clearTimeout(timer1);
        clearTimeout(timer2);
      };
    }

    document.addEventListener("click", handleClick, { capture: true });
    return () => document.removeEventListener("click", handleClick, { capture: true });
  }, []);

  if (!loading && progress === 0) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[9999] h-1 bg-transparent pointer-events-none"
      aria-hidden="true"
    >
      <div
        className="h-full bg-gradient-to-r from-lemon via-cyan to-gum transition-all duration-200 ease-out shadow-[0_0_8px_rgba(255,221,60,0.8)]"
        style={{
          width: `${progress}%`,
          opacity: progress === 100 ? 0 : 1,
          transition: progress === 100 ? "width 0.15s ease-out, opacity 0.25s 0.1s ease-in" : "width 0.2s ease-out",
        }}
      />
    </div>
  );
}
