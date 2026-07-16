import TabBar from "@/components/TabBar";

export default function TabsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <main className="px-4 pb-24 pt-4">{children}</main>
      <TabBar />
    </>
  );
}
