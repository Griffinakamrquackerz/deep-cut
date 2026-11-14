import type { Metadata } from "next";
import BlendGame from "./BlendGame";

export const metadata: Metadata = {
  title: "This Meets That — Deep Cut",
  description: "Splice two or three films together. See what plays.",
};

// Public like the other two games — no account needed to play.
export default function BlendPage() {
  return <BlendGame />;
}
