/**
 * The formula as UTF-8, because the engine's spans are byte offsets (the same
 * ones the Rust engine reports) while JavaScript strings index UTF-16.
 */
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export class Source {
  readonly text: string;
  private readonly bytes: Uint8Array;

  constructor(text: string) {
    this.text = text;
    this.bytes = encoder.encode(text);
  }

  /** The length in bytes. */
  get length(): number {
    return this.bytes.length;
  }

  /** The text between two byte offsets. */
  slice(start: number, end: number = this.bytes.length): string {
    return decoder.decode(this.bytes.subarray(start, end));
  }
}

/** The UTF-8 length of one code point, matching `TextEncoder` (a lone surrogate is U+FFFD). */
export function utf8Length(codePoint: number): number {
  if (codePoint < 0x80) return 1;
  if (codePoint < 0x800) return 2;
  if (codePoint < 0x10000) return 3;
  return 4;
}
