import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getFriends } from "@/lib/friends";

/** Returns the current user's friend list for the challenge share picker. */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json([], { status: 401 });

  const friends = await getFriends(session.sub);
  return NextResponse.json(friends);
}
