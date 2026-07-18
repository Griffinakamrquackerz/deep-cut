import { redirect } from "next/navigation";
import { currentUser } from "@/lib/supabase/server";
import LobbyScreen from "./LobbyScreen";
import { isPremium } from "@/lib/premium";

export default async function LobbyPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return <LobbyScreen myId={user.id} premium={await isPremium(user.id)} />;
}
