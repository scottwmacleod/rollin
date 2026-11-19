import { type RefObject, useEffect } from "react";

/**
 * Marks a scroll container with `data-edge-top` and `data-edge-bottom` while
 * there is content past that edge, so CSS (`.scroll-fade`) can fade only the
 * edges that need a hint. It writes the attributes straight to the element, so
 * scrolling never re-renders anything. Pass `mounted` when the element comes
 * and goes, so the listeners follow it.
 */
export function useScrollEdges(ref: RefObject<HTMLElement | null>, mounted = true) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const past = el.scrollHeight - el.scrollTop - el.clientHeight;
      el.toggleAttribute("data-edge-top", el.scrollTop > 1);
      el.toggleAttribute("data-edge-bottom", past > 1);
    };
    const resize = new ResizeObserver(update);
    const watch = () => {
      resize.disconnect();
      resize.observe(el);
      for (const child of el.children) resize.observe(child);
      update();
    };
    const mutation = new MutationObserver(watch);
    mutation.observe(el, { childList: true });
    el.addEventListener("scroll", update, { passive: true });
    watch();
    return () => {
      el.removeEventListener("scroll", update);
      resize.disconnect();
      mutation.disconnect();
    };
  }, [ref, mounted]);
}
