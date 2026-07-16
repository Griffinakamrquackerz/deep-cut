import { redirect } from "next/navigation";
import { currentUser } from "@/lib/supabase/server";
import LobbyScreen from "./LobbyScreen";

export default async function LobbyPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return <LobbyScreen myId={user.id} />;
}
