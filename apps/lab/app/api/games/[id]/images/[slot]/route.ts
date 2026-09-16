import { MAX_IMAGE_BYTES } from "@playloop/runtime";
import { NextResponse } from "next/server";
import { readSlotImage, removeSlotImage, saveSlotImage } from "@/lib/images";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; slot: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id, slot } = await params;
  const image = await readSlotImage(id, slot);
  if (!image) return NextResponse.json({ error: "No image in that slot." }, { status: 404 });
  return new NextResponse(new Uint8Array(image.data), { headers: { "content-type": image.type, "cache-control": "no-store" } });
}

/** Body: the cropped image bytes (PNG, JPEG or WebP), exactly the slot shape's export size. */
export async function PUT(request: Request, { params }: Params) {
  const { id, slot } = await params;
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_IMAGE_BYTES) return NextResponse.json({ error: `Images must be under ${MAX_IMAGE_BYTES / 1000} KB.` }, { status: 413 });
  const data = new Uint8Array(await request.arrayBuffer());
  const result = await saveSlotImage(id, slot, data);
  if (!result.ok) return NextResponse.json({ error: result.detail }, { status: result.status });
  return NextResponse.json({ image: result.image });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id, slot } = await params;
  await removeSlotImage(id, slot);
  return NextResponse.json({ ok: true });
}
