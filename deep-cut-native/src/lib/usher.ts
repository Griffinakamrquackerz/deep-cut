import { useEffect, useRef } from "react";
import type { View } from "react-native";

// A tiny measurement registry so the Usher flashlight can spotlight real
// on-screen controls (the deal button, the dial, the doors) without threading
// refs through the whole Tonight tree. Targets register a measurer keyed by id;
// the tour asks for a fresh window-rect when it lands on that beat. A missing
// target just resolves null and the beat is skipped — exactly like the web tour.

export interface UsherRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const registry = new Map<string, () => Promise<UsherRect | null>>();

export function registerUsherTarget(id: string, measurer: () => Promise<UsherRect | null>) {
  registry.set(id, measurer);
  return () => {
    if (registry.get(id) === measurer) registry.delete(id);
  };
}

export async function measureUsher(id: string): Promise<UsherRect | null> {
  const m = registry.get(id);
  return m ? m() : null;
}

/** Ref for a View that should be spotlightable by the Usher under `id`. */
export function useUsherTarget(id: string) {
  const ref = useRef<View>(null);
  useEffect(() => {
    const measurer = () =>
      new Promise<UsherRect | null>((resolve) => {
        const node = ref.current;
        if (!node) return resolve(null);
        node.measureInWindow((x, y, width, height) => {
          if (width === 0 && height === 0) return resolve(null);
          resolve({ x, y, width, height });
        });
      });
    return registerUsherTarget(id, measurer);
  }, [id]);
  return ref;
}
