import type * as React from "react";

import { cn } from "./utils";

function moveFocus(tree: HTMLElement, event: React.KeyboardEvent) {
  const items = [...tree.querySelectorAll<HTMLElement>('[role="treeitem"]')];
  const at = items.indexOf(document.activeElement as HTMLElement);
  if (at === -1) return;
  const next =
    event.key === "ArrowDown"
      ? Math.min(at + 1, items.length - 1)
      : event.key === "ArrowUp"
        ? Math.max(at - 1, 0)
        : event.key === "Home"
          ? 0
          : event.key === "End"
            ? items.length - 1
            : null;
  if (next === null) return;
  event.preventDefault();
  items[next]?.focus();
}

function Tree({
  className,
  onKeyDown,
  ...props
}: React.ComponentProps<"div"> & { "aria-label": string }) {
  return (
    <div
      role="tree"
      className={className}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (!event.defaultPrevented) moveFocus(event.currentTarget, event);
      }}
      {...props}
    />
  );
}

function TreeItem({
  className,
  tabbable,
  onActive,
  ...props
}: React.ComponentProps<"div"> & { tabbable: boolean; onActive: () => void }) {
  return (
    <div
      role="treeitem"
      aria-selected={false}
      tabIndex={tabbable ? 0 : -1}
      onFocus={onActive}
      className={cn(
        "rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        className,
      )}
      {...props}
    />
  );
}

export { Tree, TreeItem };
