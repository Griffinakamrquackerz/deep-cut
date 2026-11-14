// A template re-mounts on every navigation, which makes it the place for the
// one thing that should happen each time you change screens: the splice. The
// frame line slips through the gate and a frame or two flashes by (see
// .frame-slip in house.css). It sits out the front door, which has its own
// opening, and anybody who's asked for less motion.
export default function TabsTemplate({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="frame-slip" aria-hidden />
      {children}
    </>
  );
}
