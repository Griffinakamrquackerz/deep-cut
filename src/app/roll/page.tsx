import type { Metadata } from "next";
import RollChannel from "./RollChannel";

// Public lean-back mode — no account needed, like Settle It.
export const metadata: Metadata = {
  title: "Just Roll It — a channel of deep cuts",
  description:
    "Pick a channel and lean back: Deep Cut rolls trailers for films you haven't met until one grabs you. No decisions required.",
};

export default function RollPage() {
  return <RollChannel />;
}
