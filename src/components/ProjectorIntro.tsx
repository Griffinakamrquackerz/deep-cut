"use client";
import { useEffect, useState } from "react";

// One-time projector flicker when the app shell first mounts.
export default function ProjectorIntro() {
  const [show, setShow] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setShow(false), 1100);
    return () => clearTimeout(t);
  }, []);
  if (!show) return null;
  return <div className="projector-intro" aria-hidden />;
}
