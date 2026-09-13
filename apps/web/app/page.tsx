import { redirect } from "next/navigation";
import { Landing } from "@/app/_components/landing/Landing";
import { getSession } from "@/lib/session";

export default async function Home() {
  const session = await getSession();
  if (session) redirect("/feed");
  return <Landing />;
}
