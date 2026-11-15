import { Component, type ErrorInfo, type ReactNode, useEffect, useState } from "react";
import { ErrorNotice } from "./ErrorNotice";
import { buildReport, currentContext } from "./errorReport";

/** Catches a crash while rendering and replaces the page with the error notice. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { details: string | null }> {
  state: { details: string | null } = { details: null };

  componentDidCatch(error: unknown, info: ErrorInfo) {
    this.setState({ details: buildReport(error, currentContext(), info.componentStack) });
  }

  // Needed so the first failed render has something to show; the details follow in componentDidCatch.
  static getDerivedStateFromError(error: unknown) {
    return { details: buildReport(error, currentContext()) };
  }

  render() {
    if (this.state.details === null) return this.props.children;
    return (
      <main className="flex min-h-screen items-center p-4">
        <ErrorNotice details={this.state.details} fatal />
      </main>
    );
  }
}

/**
 * Only failures in the app's own scripts count. A browser extension's script, or the
 * offline worker failing to load, is not something the player or an issue can fix.
 */
function ours(error: unknown, filename?: string): boolean {
  const mine = [`${location.origin}/assets/`, `${location.origin}/src/`];
  const within = (text: string) => mine.some((prefix) => text.includes(prefix));
  if (filename !== undefined && filename !== "") return within(filename);
  return error instanceof Error && within(error.stack ?? "");
}

/** Shows a dismissible notice for an error the page survived (a rejected promise, an event handler). */
export function UnexpectedErrors() {
  const [details, setDetails] = useState<string | null>(null);

  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      if (ours(event.error, event.filename)) setDetails(buildReport(event.error, currentContext()));
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      if (ours(event.reason)) setDetails(buildReport(event.reason, currentContext()));
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  if (details === null) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-50 p-4">
      <ErrorNotice details={details} onDismiss={() => setDetails(null)} />
    </div>
  );
}
