import TabBar from "@/components/TabBar";
import ProjectorIntro from "@/components/ProjectorIntro";
import MarqueeToaster from "@/components/MarqueeToaster";
import { currentUser } from "@/lib/supabase/server";

export default async function TabsLayout({ children }: { children: React.ReactNode }) {
  // Signed-out visitors (landing page, shared member cards) get no app
  // chrome — every tab would just bounce them to /login anyway.
  const user = await currentUser();
  if (!user) return <>{children}</>;

  return (
    <>
      <ProjectorIntro />
      <MarqueeToaster />
      {/* Extra bottom padding clears the raised Tonight reel in the tab bar. */}
      <main className="px-4 pb-28 pt-4">{children}</main>
      <TabBar />
    </>
  );
}
