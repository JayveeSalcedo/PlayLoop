import Image from "next/image";
import logo from "@/public/logo.png";

/**
 * The playloop wordmark. One component so every surface (landing nav, app
 * top bar, login) renders the same art at the same aspect ratio — pass the
 * rendered `height` in px and the width follows from the source file.
 *
 * The art already spells "playloop", so it carries the alt text and callers
 * should not repeat the name in adjacent copy.
 */
export function Logo({ height, className }: { height: number; className?: string }) {
  return (
    <Image
      src={logo}
      alt="playloop"
      height={height}
      width={Math.round((height * logo.width) / logo.height)}
      priority
      className={className}
    />
  );
}
