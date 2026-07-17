import TabBar from "@/components/TabBar";
import ProjectorIntro from "@/components/ProjectorIntro";

export default function TabsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ProjectorIntro />
      {/* Extra bottom padding clears the raised Tonight reel in the tab bar. */}
      <main className="px-4 pb-28 pt-4">{children}</main>
      <TabBar />
    </>
  );
}
