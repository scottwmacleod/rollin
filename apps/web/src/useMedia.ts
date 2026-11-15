import { useSyncExternalStore } from "react";

/** Follows a CSS media query, so a component can pick an arrangement and keep its state when the query flips. */
export function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", notify);
      return () => list.removeEventListener("change", notify);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** The width at which the sidebar layout starts (Tailwind's `md`). */
export const WIDE = "(min-width: 768px)";
/** The primary pointer is a finger. */
export const TOUCH = "(pointer: coarse)";
