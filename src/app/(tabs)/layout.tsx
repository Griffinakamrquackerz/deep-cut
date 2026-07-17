import TabBar from "@/components/TabBar";
import MuteToggle from "@/components/MuteToggle";
import ProjectorIntro from "@/components/ProjectorIntro";

export default function TabsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ProjectorIntro />
      <main className="px-4 pb-24 pt-4">{children}</main>
      <MuteToggle />
      <TabBar />
    </>
  );
}
