import Link from "next/link";
import { providerLabel, tokensUsedToday } from "@/lib/jobs";
import { CreateForm } from "./CreateForm";

export const dynamic = "force-dynamic";

export default async function CreatePage() {
  const used = await tokensUsedToday();
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8">
      <Link href="/" className="text-sm font-bold text-soft underline">
        ← All games
      </Link>
      <header className="flex flex-col gap-2">
        <span className="chip info self-start">AI · {providerLabel()}</span>
        <h1 className="text-3xl font-extrabold tracking-tight">Make a game from any idea</h1>
        <p className="max-w-prose font-semibold text-soft">
          Describe it the way you&apos;d tell a friend. The AI writes the game, bots test it, and anything they find goes back to
          the AI to fix, up to twice.
        </p>
        <p className="text-xs font-bold text-soft">
          {used.toLocaleString("en-US")} AI tokens used today. On Groq&apos;s free tier a game takes about a minute and roughly
          15-25K tokens.
        </p>
      </header>
      <CreateForm />
    </main>
  );
}
