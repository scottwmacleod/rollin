import { useRef, useState } from "react";
import { Button } from "./ui";

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal-ink";

export function ErrorNotice({
  details,
  onDismiss,
  fatal,
}: {
  details: string;
  onDismiss?: () => void;
  fatal?: boolean;
}) {
  const [copied, setCopied] = useState<"idle" | "done" | "failed">("idle");
  const text = useRef<HTMLTextAreaElement>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(details);
      setCopied("done");
    } catch {
      text.current?.focus();
      text.current?.select();
      setCopied("failed");
    }
  }

  return (
    <section
      role="alert"
      aria-labelledby="error-title"
      className="mx-auto flex w-full max-w-2xl flex-col gap-3 rounded-1 border border-line-strong bg-surface p-4 text-ink"
    >
      <h2 id="error-title" className="m-0 text-base font-semibold">
        Something went wrong
      </h2>
      <p className="m-0 text-sm text-ink-body">
        {fatal
          ? "rollin hit a problem it couldn't recover from. Your characters and presets are saved in this browser and should be there when you reload."
          : "rollin hit an unexpected problem. You can keep rolling, but it may not behave as it should."}{" "}
        If you'd like to report it, copy the details below into a new issue on GitHub. They hold no
        formulas, labels or character names.
      </p>
      <label className="flex flex-col gap-1 text-sm text-ink-body">
        Error details
        <textarea
          ref={text}
          readOnly
          rows={6}
          value={details}
          className={`w-full resize-y rounded-1 border border-control-line bg-surface-sunken p-2 font-mono text-xs text-ink ${focusRing}`}
        />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          onClick={() => void copy()}
          className={`inline-flex h-10 items-center justify-center rounded-1 bg-signal px-4 font-mono text-ui-strong lowercase text-on-signal hover:bg-signal-hover ${focusRing}`}
        >
          Copy error details
        </Button>
        {fatal ? (
          <Button
            type="button"
            onClick={() => location.reload()}
            className={`h-10 rounded-1 border border-control-line px-4 font-mono text-ui lowercase text-ink-body hover:bg-surface-hover ${focusRing}`}
          >
            Reload
          </Button>
        ) : (
          <Button
            type="button"
            onClick={onDismiss}
            className={`h-10 rounded-1 border border-control-line px-4 font-mono text-ui lowercase text-ink-body hover:bg-surface-hover ${focusRing}`}
          >
            Dismiss
          </Button>
        )}
        <a
          href="https://github.com/scottwmacleod/rollin/issues/new/choose"
          target="_blank"
          rel="noreferrer"
          className={`text-sm text-ink-body underline underline-offset-2 ${focusRing}`}
        >
          Open GitHub issues (new tab)
        </a>
        <span role="status" className="text-sm text-ink-body">
          {copied === "done" && "Copied."}
          {copied === "failed" && "Couldn't copy. The details are selected, so press Ctrl+C or ⌘C."}
        </span>
      </div>
    </section>
  );
}
