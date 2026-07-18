import type { Metadata } from "next";
import SettleFlow from "./SettleFlow";

export const metadata: Metadata = {
  title: "Settle It — Deep Cut",
  description: "Two of you, one phone, one movie. Nobody compromises out loud.",
};

// Standalone couch-standoff mode: no auth, no backend, one shared phone.
// Deliberately outside the (tabs) group — it's its own little ceremony.
export default function SettlePage() {
  return <SettleFlow />;
}
