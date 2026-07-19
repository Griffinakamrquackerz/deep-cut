"use client";
import { useEffect, useState } from "react";

/**
 * A one-time velvet-curtain parting on mount, then it removes itself from the
 * DOM so it never blocks interaction. "Now presenting…" for a film page.
 */
export default function CurtainReveal() {
  const [show, setShow] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setShow(false), 1300);
    return () => clearTimeout(t);
  }, []);
  if (!show) return null;
  return (
    <>
      <div className="curtain curtain-l" aria-hidden />
      <div className="curtain curtain-r" aria-hidden />
    </>
  );
}
