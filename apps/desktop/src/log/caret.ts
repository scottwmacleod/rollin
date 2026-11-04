/** The formula on one line and a caret line under the offending span, as the
 * CLI prints them (`render_error` in src/main.rs). `span` is a UTF-8 byte
 * range, so it is mapped to characters before counting columns. */
export function caretLines(source: string, span: [number, number]): [string, string] {
  const bytes = new TextEncoder().encode(source);
  const decoder = new TextDecoder();
  const clamp = (n: number) => Math.min(Math.max(n, 0), bytes.length);
  const start = Array.from(decoder.decode(bytes.slice(0, clamp(span[0])))).length;
  const len = Math.max(
    1,
    Array.from(decoder.decode(bytes.slice(clamp(span[0]), clamp(span[1])))).length,
  );
  // Control characters (a newline) show as spaces so the carets stay aligned.
  // eslint-disable-next-line no-control-regex
  const line = Array.from(source, (c) => (/[\u0000-\u001f\u007f]/.test(c) ? " " : c)).join("");
  return [line, " ".repeat(start) + "^".repeat(len)];
}
