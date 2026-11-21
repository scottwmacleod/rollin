# Motion and the flat look

Recorded on 2026-11-21 from the code comments they replace. Values live in `apps/web/src/index.css`; tokens come from sm-core.

**Flat.** The sm_ look is flat: 2px corners or none, and no shadows. Floating layers are told apart by a `line-strong` border instead (`flat.test.ts`). Scroll areas hint at more content with a 16px mask fade, only at an edge with content past it. `useScrollEdges` writes those attributes straight to the element so scrolling never re-renders. Per-row edit controls are small borderless pencils, so a long list isn't a column of bordered buttons. On a small screen header buttons show only an icon, so the character button keeps room for its name.

**Motion.** Transform and opacity only. Press feedback shrinks Roll, keypad keys and preset chips a touch while held (100ms ease-out, no bounce). A roll made on this page fades in and rises 4px over 150ms, marked before paint so it starts with the entry's first frame. Popups use CSS transitions, which reverse from where they are, so a close midway through an open never jumps (#329). The slide-over comes in from the left in 200ms and goes out in 150ms; it follows a finger 1:1 when swiped and leaves vertical moves to the browser (`touch-action: pan-y`), so scrolling inside it still works (#330). Menus and the palette scale up from 0.97 and fade, in 150ms and out in 120ms; menus grow from the button that opened them.

**Taps.** Keys act at once: no double-tap zoom and no grey tap flash.

**No layout shift.** Geist and Geist Mono load one Latin variable file each, and the build preloads the Geist file. Other scripts fall back to the system font through sm-core's fallback faces, whose metrics keep layout shift at zero. While storage is read, the character list holds one row's height so the panels below don't jump. In a roll line the dice wrap among themselves before the total leaves the line.
