import Link from "next/link";
import { notFound } from "next/navigation";
import { slotImageDataUrls } from "@/lib/images";
import { getGame } from "@/lib/lab";
import { ImageEditor } from "./ImageEditor";

export const dynamic = "force-dynamic";

export default async function ImagesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const game = await getGame(id);
  if (!game?.meta) notFound();
  const slots = game.meta.imageSlots ?? [];
  const images = await slotImageDataUrls(game.id);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
      <div className="flex flex-wrap gap-4 text-sm font-bold text-soft">
        <Link href="/" className="underline">
          ← All games
        </Link>
        <Link href={`/games/${game.id}/report`} className="underline">
          Checks
        </Link>
        <Link href={`/play/${game.id}`} className="underline">
          Play
        </Link>
      </div>
      <header className="flex flex-col gap-2">
        <span className="chip info self-start">Images</span>
        <h1 className="text-3xl font-extrabold tracking-tight">{game.meta.title}</h1>
        <p className="max-w-prose font-semibold text-soft">
          Each spot has a shape. Pick a photo and frame it inside that shape. What you see in the frame is exactly what shows in
          the game.
        </p>
      </header>
      {slots.length === 0 ? (
        <p className="card p-5 font-semibold">This game doesn&apos;t have any image spots.</p>
      ) : (
        <ImageEditor gameId={game.id} code={game.code} slots={slots} initialImages={images} />
      )}
    </main>
  );
}
