import { type PointerEvent as ReactPointerEvent, useRef } from "react";

export const CLOSE_FRACTION = 1 / 3;
export const FLICK_SPEED = 0.5;
const SLOP = 8;

export function shouldClose(dx: number, width: number, velocity: number): boolean {
  if (dx >= 0) return false;
  return -dx > width * CLOSE_FRACTION || velocity <= -FLICK_SPEED;
}

export function useSwipeClose(onClose: () => void) {
  const drag = useRef<{
    id: number;
    x: number;
    y: number;
    dx: number;
    swiping: boolean;
    samples: { t: number; x: number }[];
  } | null>(null);

  function reset(el: HTMLElement) {
    el.style.translate = "";
    el.style.transition = "";
  }

  return {
    onPointerDown(e: ReactPointerEvent<HTMLElement>) {
      if (e.pointerType === "mouse" || !e.isPrimary) return;
      drag.current = {
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        dx: 0,
        swiping: false,
        samples: [{ t: e.timeStamp, x: e.clientX }],
      };
    },
    onPointerMove(e: ReactPointerEvent<HTMLElement>) {
      const d = drag.current;
      if (!d || d.id !== e.pointerId) return;
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      if (!d.swiping) {
        if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return;
        if (Math.abs(dy) > Math.abs(dx) || dx > 0) {
          drag.current = null;
          return;
        }
        d.swiping = true;
        e.currentTarget.setPointerCapture(e.pointerId);
      }
      d.dx = Math.min(0, dx);
      d.samples = [...d.samples.slice(-4), { t: e.timeStamp, x: e.clientX }];
      e.currentTarget.style.transition = "none";
      e.currentTarget.style.translate = `${d.dx}px 0`;
    },
    onPointerUp(e: ReactPointerEvent<HTMLElement>) {
      const d = drag.current;
      drag.current = null;
      if (!d?.swiping || d.id !== e.pointerId) return;
      const first = d.samples[0];
      const last = d.samples[d.samples.length - 1];
      const ms = first && last ? last.t - first.t : 0;
      const velocity = first && last && ms > 0 ? (last.x - first.x) / ms : 0;
      const el = e.currentTarget;
      el.style.transition = "";
      if (shouldClose(d.dx, el.getBoundingClientRect().width, velocity)) {
        el.style.translate = "-100% 0";
        onClose();
      } else {
        reset(el);
      }
    },
    onPointerCancel(e: ReactPointerEvent<HTMLElement>) {
      drag.current = null;
      reset(e.currentTarget);
    },
  };
}
