"use client";
import { Children, useState, type ReactNode } from "react";
import { sfxClick } from "@/lib/sfx";

/**
 * Reveals children in batches behind a "show more" button. Server components
 * can pass fully-rendered items; we only control how many are on screen.
 */
export default function ShowMore({
  children,
  initial = 12,
  step = 24,
  wrapperClassName,
  label = "Roll more",
}: {
  children: ReactNode;
  initial?: number;
  step?: number;
  wrapperClassName?: string;
  label?: string;
}) {
  const [visible, setVisible] = useState(initial);
  const items = Children.toArray(children);
  const hidden = items.length - visible;

  return (
    <>
      <div className={wrapperClassName}>{items.slice(0, visible)}</div>
      {hidden > 0 && (
        <button
          onClick={() => {
            sfxClick();
            setVisible((v) => v + step);
          }}
          className="mt-3 w-full rounded border border-amber px-3 py-2.5 font-mono text-xs uppercase tracking-widest text-amber"
        >
          ★ {label} ({hidden} more) ★
        </button>
      )}
    </>
  );
}
