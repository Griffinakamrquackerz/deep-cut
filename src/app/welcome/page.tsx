import { redirect } from "next/navigation";
import { currentUser } from "@/lib/supabase/server";
import OnboardingFlow from "./OnboardingFlow";

export default async function WelcomePage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return <OnboardingFlow />;
}
