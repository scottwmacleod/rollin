import { useSyncExternalStore } from "react";

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

export const WIDE = "(min-width: 768px)";
export const TOUCH = "(pointer: coarse)";
export const SMALL = "(max-width: 599px)";
export const ROOMY = "(min-width: 640px)";
