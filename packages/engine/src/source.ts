const encoder = new TextEncoder();
const decoder = new TextDecoder();

export class Source {
  readonly text: string;
  private readonly bytes: Uint8Array;

  constructor(text: string) {
    this.text = text;
    this.bytes = encoder.encode(text);
  }

  get length(): number {
    return this.bytes.length;
  }

  slice(start: number, end: number = this.bytes.length): string {
    return decoder.decode(this.bytes.subarray(start, end));
  }
}

export function utf8Length(codePoint: number): number {
  if (codePoint < 0x80) return 1;
  if (codePoint < 0x800) return 2;
  if (codePoint < 0x10000) return 3;
  return 4;
}
