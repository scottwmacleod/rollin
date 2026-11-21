export interface ReportContext {
  version: string;
  userAgent: string;
  time: string;
}

const FRAME =
  /(?:^|[\s(@])(?:https?:\/\/[^\s/)]+)?\/?(?:[^\s()]*\/)?([\w.-]+\.(?:m?js|tsx?)):(\d+):(\d+)\)?$/;

const MAX_FRAMES = 8;

export function errorKind(error: unknown): string {
  if (error instanceof Error && /^[A-Za-z]{1,40}$/.test(error.name)) return error.name;
  return "UnknownError";
}

export function framesOf(error: unknown): string[] {
  const stack = error instanceof Error ? error.stack : undefined;
  if (!stack) return [];
  const frames: string[] = [];
  let lines = stack.split("\n");
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
