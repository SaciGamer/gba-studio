export const DIALOGUE_MAX_BYTES = 255;

const encoder = new TextEncoder();

export function utf8ByteLength(value: string): number {
  return encoder.encode(value).length;
}

export function truncateUtf8(value: string, maxBytes = DIALOGUE_MAX_BYTES): string {
  let result = '';
  let bytes = 0;

  for (const character of value) {
    const characterBytes = encoder.encode(character).length;
    if (bytes + characterBytes > maxBytes) break;
    result += character;
    bytes += characterBytes;
  }

  return result;
}
