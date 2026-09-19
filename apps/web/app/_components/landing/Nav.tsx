import { InstallPrompt } from "@/app/_components/pwa/InstallPrompt";
import { startGuestSession } from "@/app/login/actions";

const LINKS = [
  { href: "#top", label: "How it works" },
  { href: "#player", label: "Player app" },
  { href: "#creator", label: "Creator studio" },
  { href: "#brand", label: "Brand console" },
  { href: "#loop", label: "Flywheel" },
];

export function Nav() {
  return (
    <header className="landing-nav">
      <div className="landing-logo">
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <path
            d="M6.5 8.5a3.5 3.5 0 1 0 0 7c2.5 0 3.5-2 5.5-3.5s3-3.5 5.5-3.5a3.5 3.5 0 1 1 0 7c-2.5 0-3.5-2-5.5-3.5S9 8.5 6.5 8.5z"
            fill="none"
            stroke="var(--color-ink)"
            strokeWidth="2.6"
            strokeLinecap="round"
          />
        </svg>
        playloop
      </div>
      <nav className="landing-nav-links" aria-label="Sections">
        {LINKS.map((l) => (
          <a key={l.href} href={l.href}>
            {l.label}
          </a>
        ))}
      </nav>
      <div className="ml-auto flex items-center gap-2 shrink-0">
        <form action={startGuestSession}>
          <button type="submit" className="btn go sm">
            Play now
          </button>
        </form>
        <InstallPrompt />
      </div>
    </header>
  );
}
