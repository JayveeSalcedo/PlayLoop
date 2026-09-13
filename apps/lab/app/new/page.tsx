import Link from "next/link";
import { NewGameForm } from "./NewGameForm";

export default function NewGamePage() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-5 px-4 py-8">
      <Link href="/" className="text-sm font-bold text-soft underline">
        ← All games
      </Link>
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-extrabold tracking-tight">Add a game</h1>
        <p className="max-w-prose font-semibold text-soft">
          Paste code that follows the PlayLoop game contract (see <code>packages/runtime/README.md</code>). The server loads it
          in the sandbox first; if it breaks the contract you&apos;ll see why. In phase 4 the AI writes this for you.
        </p>
      </header>
      <NewGameForm />
    </main>
  );
}
