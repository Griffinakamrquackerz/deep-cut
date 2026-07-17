"use client";
import { useEffect } from "react";

export default function PwaSetup() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // PWA features are progressive — the app works fine without them.
      });
    }
  }, []);
  return null;
}
