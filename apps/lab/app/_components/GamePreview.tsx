"use client";

import { buildGameDocument, GAME_FRAME_SANDBOX, type HostMessage } from "@playloop/runtime";
import { useEffect, useMemo, useRef, useState } from "react";

/**
 * A still frame of the real game, rendered in its sandbox with the given
 * images, after `atSeconds` of idle play. Used by the image editor so creators
 * see their crop exactly where the game draws it.
 */
export function GamePreview({
  code,
  images,
  atSeconds,
  className,
}: {
  code: string;
  images: Record<string, string>;
  atSeconds: number;
  className?: string;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const srcDoc = useMemo(() => buildGameDocument(code), [code]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow) return;
      const msg = event.data as HostMessage;
      if (msg?.type === "ready") setLoaded(true);
      else if (msg?.type === "previewed") setProblem(null);
      else if (msg?.type === "error") setProblem(msg.message);
    };
    window.addEventListener("message", onMessage);
    frameRef.current?.contentWindow?.postMessage({ type: "hello" }, "*");
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    // Debounced: dragging a crop changes images many times a second.
    const timer = setTimeout(() => {
      frameRef.current?.contentWindow?.postMessage({ type: "preview", seed: "image-preview", images, atSeconds }, "*");
    }, 150);
    return () => clearTimeout(timer);
  }, [loaded, images, atSeconds]);

  return (
    <div className={className}>
      <iframe
        ref={frameRef}
        title="Game preview"
        sandbox={GAME_FRAME_SANDBOX}
        srcDoc={srcDoc}
        onLoad={() => frameRef.current?.contentWindow?.postMessage({ type: "hello" }, "*")}
        className="block h-full w-full rounded-xl bg-night [border:var(--border-thick)]"
      />
      {problem ? <p className="mt-1 text-xs font-bold text-gum">Preview: {problem}</p> : null}
    </div>
  );
}
