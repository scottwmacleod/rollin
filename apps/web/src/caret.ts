/**
 * The formula on one line and a caret line under the offending span, as the
 * desktop app shows them. `span` is a UTF-8 byte range, so it is mapped to
 * characters before counting columns.
 */
export function caretLines(source: string, span: { start: number; end: number }): [string, string] {
  const bytes = new TextEncoder().encode(source);
  const decoder = new TextDecoder();
  const clamp = (n: number) => Math.min(Math.max(n, 0), bytes.length);
  const start = Array.from(decoder.decode(bytes.slice(0, clamp(span.start)))).length;
  const len = Math.max(
    1,
    Array.from(decoder.decode(bytes.slice(clamp(span.start), clamp(span.end)))).length,
  );
  // Control characters show as spaces so the carets stay aligned.
  const line = Array.from(source, (c) => (c < " " || c === "\u007f" ? " " : c)).join("");
  return [line, " ".repeat(start) + "^".repeat(len)];
}
