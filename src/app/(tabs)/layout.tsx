import TabBar from "@/components/TabBar";
import UsherTour from "@/components/UsherTour";
import ProjectorIntro from "@/components/ProjectorIntro";
import MarqueeToaster from "@/components/MarqueeToaster";
import PushGate from "@/components/PushGate";
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
      {/* Silent half only: re-subscribes anyone who already said yes. The bar
          that asks lives on the Inbox, where the reason for it is on screen. */}
      <PushGate />
      {/* Extra bottom padding clears the raised Tonight reel in the tab bar. */}
      <main className="px-4 pb-28 pt-4">{children}</main>
      <TabBar />
      {/* The tour walks you into Mixtapes, Community, You and Settings, so it
          has to outlive the page it started on. */}
      <UsherTour />
    </>
  );
}
