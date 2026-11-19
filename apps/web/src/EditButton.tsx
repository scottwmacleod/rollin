import { Button } from "./ui";

/**
 * The per-row edit control in the sidebars: a small borderless pencil, so a
 * long list of characters, variables or presets isn't a column of bordered
 * buttons. `label` is its accessible name, such as "Edit attack".
 */
export function EditButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="inline-flex min-h-11 w-11 shrink-0 items-center justify-center rounded-1 text-ink-muted hover:bg-surface-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
    >
      <svg
        viewBox="0 0 16 16"
        width="16"
        height="16"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M10.5 2.5 13.5 5.5 5.5 13.5H2.5V10.5Z" />
        <path d="M9 4 12 7" />
      </svg>
    </Button>
  );
}
