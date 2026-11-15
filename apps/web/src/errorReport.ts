/**
 * The text behind "Copy error details". It is built to be pasted into a public
 * GitHub issue, so it carries only what helps us reproduce a crash: the app
 * build, the browser, the kind of error and where in our code it happened.
 * It never carries the error's message, which can quote a formula, a preset
 * name or a character name, nor any saved data.
 */

export interface ReportContext {
  /** The build the page came from. */
  version: string;
  userAgent: string;
  /** ISO 8601, UTC. */
  time: string;
}

/** A frame from our own bundle, reduced to `file:line:col` with no host, query or message. */
const FRAME =
  /(?:^|[\s(@])(?:https?:\/\/[^\s/)]+)?\/?(?:[^\s()]*\/)?([\w.-]+\.(?:m?js|tsx?)):(\d+):(\d+)\)?$/;

const MAX_FRAMES = 8;

/** The error's class name only, and only if it looks like one (so a thrown string can't leak through). */
export function errorKind(error: unknown): string {
  if (error instanceof Error && /^[A-Za-z]{1,40}$/.test(error.name)) return error.name;
  return "UnknownError";
}

/** Stack frames as `file:line:col`. The stack's first line holds the message, so only frame lines are read. */
export function framesOf(error: unknown): string[] {
  const stack = error instanceof Error ? error.stack : undefined;
  if (!stack) return [];
  const frames: string[] = [];
  let lines = stack.split("\n");
  // Chrome starts the stack with "Name: message", which may run over several lines.
  if (error instanceof Error && stack.startsWith(error.name)) {
    const first = lines.findIndex((line) => /^\s+at\s/.test(line));
    lines = first === -1 ? [] : lines.slice(first);
  }
  for (const line of lines) {
    if (!/^\s*at\s|@(?:https?:|\/)/.test(line)) continue;
    const match = FRAME.exec(line.trim());
    if (match) frames.push(`${match[1]}:${match[2]}:${match[3]}`);
    if (frames.length === MAX_FRAMES) break;
  }
  return frames;
}

/** Component names from React's component stack; its file locations are dropped. */
export function componentsOf(componentStack: string | null | undefined): string[] {
  if (!componentStack) return [];
  return componentStack
    .split("\n")
    .map((line) => /^\s*(?:at\s+)?([A-Z][\w$.]*)/.exec(line)?.[1])
    .filter((name): name is string => name !== undefined)
    .slice(0, MAX_FRAMES);
}

export function buildReport(
  error: unknown,
  context: ReportContext,
  componentStack?: string | null,
): string {
  const frames = framesOf(error);
  const components = componentsOf(componentStack);
  return [
    "rollin error details",
    `Version: ${context.version}`,
    `Time: ${context.time}`,
    `Browser: ${context.userAgent}`,
    `Error: ${errorKind(error)} (message left out on purpose, in case it names something of yours)`,
    `Where: ${frames.length > 0 ? frames.join(" < ") : "unknown"}`,
    ...(components.length > 0 ? [`Components: ${components.join(" < ")}`] : []),
  ].join("\n");
}

export function currentContext(): ReportContext {
  return {
    version: __APP_VERSION__,
    userAgent: navigator.userAgent,
    time: new Date().toISOString(),
  };
}
