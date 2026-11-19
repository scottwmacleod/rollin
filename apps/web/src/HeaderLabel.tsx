import type { ReactNode } from "react";
import { SMALL, useMedia } from "./useMedia";

/** Header buttons on a small screen: icon only, so the character button keeps room for its name. */
export const HEADER_ICON_BUTTON = "max-[600px]:w-11 max-[600px]:justify-center max-[600px]:px-0";

/**
 * What a header button shows: its word and shortcut hint, or on a small screen
 * just an icon, with the word kept for screen readers as the button's name.
 */
export function HeaderLabel({
  label,
  hint,
  icon,
}: {
  label: string;
  hint: string | null;
  icon: ReactNode;
}) {
  const small = useMedia(SMALL);
  if (small) {
    return (
      <>
        {icon}
        <span className="sr-only">{label}</span>
      </>
    );
  }
  return (
    <>
      {label}
      {hint !== null && <span className="text-ink-muted">{hint}</span>}
    </>
  );
}

const ICON = {
  viewBox: "0 0 16 16",
  width: 16,
  height: 16,
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  focusable: false,
} as const;

/** A magnifier: the command palette searches presets, characters and commands. */
export const SearchIcon = () => (
  <svg {...ICON} aria-hidden="true">
    <circle cx="7" cy="7" r="4.5" />
    <path d="M10.5 10.5 14 14" />
  </svg>
);

/** Two sliders, for Settings. */
export const SettingsIcon = () => (
  <svg {...ICON} aria-hidden="true">
    <path d="M2 5h1.75M7.25 5H14M2 11h6.75M12.25 11H14" />
    <circle cx="5.5" cy="5" r="1.75" />
    <circle cx="10.5" cy="11" r="1.75" />
  </svg>
);
