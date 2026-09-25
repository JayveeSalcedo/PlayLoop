import { Logo } from "@/app/_components/brand/Logo";
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
        <Logo height={40} />
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
