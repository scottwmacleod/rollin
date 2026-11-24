import { Button } from "./ui";

export function EditButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="min-h-11 w-11 shrink-0 text-muted-foreground"
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
