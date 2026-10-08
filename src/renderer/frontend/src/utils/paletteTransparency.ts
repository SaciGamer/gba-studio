const transparentImageCache = new Map<string, Promise<HTMLCanvasElement | null>>();

export function clearPaletteTransparentImageCache() {
  transparentImageCache.clear();
}

interface RgbColor {
  red: number;
  green: number;
  blue: number;
}

interface ImagePalette {
  colors: RgbColor[];
  // Present for indexed PNGs, including Adam7-interlaced images. Unlike a color lookup, this
  // preserves the original palette slot even when two slots share a color.
  indexes?: Uint8Array;
}

const isPng = (bytes: Uint8Array) => (
  bytes.length >= 8 && bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71
);

function readImagePalette(bytes: Uint8Array): RgbColor[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  if (isPng(bytes)) {
    for (let offset = 8; offset + 12 <= bytes.length;) {
      const length = view.getUint32(offset, false);
      const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
      const dataOffset = offset + 8;
      if (dataOffset + length + 4 > bytes.length) break;
      if (type === 'PLTE' && length >= 3) {
        const colors: RgbColor[] = [];
        for (let index = dataOffset; index + 2 < dataOffset + length; index += 3) {
          colors.push({ red: bytes[index], green: bytes[index + 1], blue: bytes[index + 2] });
        }
        return colors;
      }
      offset = dataOffset + length + 4;
    }
  }

  if (bytes.length >= 54 && bytes[0] === 0x42 && bytes[1] === 0x4d) {
    const dibSize = view.getUint32(14, true);
    const bitsPerPixel = view.getUint16(28, true);
    const paletteOffset = 14 + dibSize;
    if (bitsPerPixel <= 8 && paletteOffset + 4 <= bytes.length) {
      const colors: RgbColor[] = [];
      const colorCount = Math.min(
        view.getUint32(46, true) || (1 << bitsPerPixel),
        Math.floor((bytes.length - paletteOffset) / 4),
      );
      for (let index = 0; index < colorCount; index += 1) {
        const offset = paletteOffset + index * 4;
        colors.push({ red: bytes[offset + 2], green: bytes[offset + 1], blue: bytes[offset] });
      }
      return colors;
    }
  }

  return [];
}

async function readIndexedPngPixels(bytes: Uint8Array): Promise<Uint8Array | undefined> {
  if (!isPng(bytes)) return undefined;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let indexed = false;
  let interlaced = false;
  const idatChunks: Uint8Array[] = [];

  for (let offset = 8; offset + 12 <= bytes.length;) {
    const length = view.getUint32(offset, false);
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    const dataOffset = offset + 8;
    if (dataOffset + length + 4 > bytes.length) return undefined;
    if (type === 'IHDR' && length >= 13) {
      width = view.getUint32(dataOffset, false);
      height = view.getUint32(dataOffset + 4, false);
      bitDepth = bytes[dataOffset + 8];
      indexed = bytes[dataOffset + 9] === 3;
      interlaced = bytes[dataOffset + 12] !== 0;
    } else if (type === 'IDAT') {
      idatChunks.push(bytes.slice(dataOffset, dataOffset + length));
    }
    offset = dataOffset + length + 4;
  }

  if (!indexed || !width || !height || ![1, 2, 4, 8].includes(bitDepth) || !idatChunks.length) return undefined;

  try {
    const compressedSize = idatChunks.reduce((total, chunk) => total + chunk.length, 0);
    const compressed = new Uint8Array(compressedSize);
    let destination = 0;
    idatChunks.forEach(chunk => {
      compressed.set(chunk, destination);
      destination += chunk.length;
    });
    const decompressed = await new Response(
      new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate')),
    ).arrayBuffer();
    const scanlines = new Uint8Array(decompressed);
    const indexes = new Uint8Array(width * height);
    const passes = interlaced
      ? [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]]
      : [[0, 0, 1, 1]];
    let cursor = 0;
    for (const [startX, startY, stepX, stepY] of passes) {
      const passWidth = Math.max(0, Math.ceil((width - startX) / stepX));
      const passHeight = Math.max(0, Math.ceil((height - startY) / stepY));
      if (!passWidth || !passHeight) continue;
      const rowBytes = Math.ceil(passWidth * bitDepth / 8);
      let previous = new Uint8Array(rowBytes);
      for (let row = 0; row < passHeight; row++) {
        const filter = scanlines[cursor++];
        if (cursor + rowBytes > scanlines.length || filter > 4) return undefined;
        const unfiltered = new Uint8Array(rowBytes);
        for (let column = 0; column < rowBytes; column++) {
          const value = scanlines[cursor++];
          const left = column ? unfiltered[column - 1] : 0;
          const up = previous[column], upLeft = column ? previous[column - 1] : 0;
          const prediction = left + up - upLeft;
          const da = Math.abs(prediction - left), db = Math.abs(prediction - up), dc = Math.abs(prediction - upLeft);
          const paeth = da <= db && da <= dc ? left : db <= dc ? up : upLeft;
          unfiltered[column] = (value + (filter === 0 ? 0 : filter === 1 ? left : filter === 2 ? up : filter === 3 ? Math.floor((left + up) / 2) : paeth)) & 255;
        }
        for (let column = 0; column < passWidth; column++) {
          const bit = column * bitDepth;
          indexes[(startY + row * stepY) * width + startX + column * stepX] =
            (unfiltered[bit >> 3] >> (8 - bitDepth - (bit & 7))) & ((1 << bitDepth) - 1);
        }
        previous = unfiltered;
      }
    }
    return indexes;
  } catch {
    return undefined;
  }
}

function readIndexedBmpPixels(bytes: Uint8Array): Uint8Array | undefined {
  if (bytes.length < 54 || bytes[0] !== 0x42 || bytes[1] !== 0x4d) return undefined;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const pixelOffset = view.getUint32(10, true);
  const width = view.getInt32(18, true);
  const signedHeight = view.getInt32(22, true);
  const bitDepth = view.getUint16(28, true);
  const compression = view.getUint32(30, true);
  if (width <= 0 || !signedHeight || compression !== 0 || ![1, 4, 8].includes(bitDepth)) return undefined;

  const height = Math.abs(signedHeight);
  const rowBytes = Math.floor((width * bitDepth + 31) / 32) * 4;
  if (pixelOffset + height * rowBytes > bytes.length) return undefined;

  const indexes = new Uint8Array(width * height);
  const mask = (1 << bitDepth) - 1;
  for (let row = 0; row < height; row += 1) {
    const sourceRow = signedHeight > 0 ? height - row - 1 : row;
    for (let column = 0; column < width; column += 1) {
      const bitOffset = column * bitDepth;
      const byte = bytes[pixelOffset + sourceRow * rowBytes + Math.floor(bitOffset / 8)];
      indexes[row * width + column] = (byte >> (8 - bitDepth - (bitOffset % 8))) & mask;
    }
  }
  return indexes;
}

async function getImagePalette(src: string): Promise<ImagePalette> {
  try {
    const bytes = src.startsWith('data:')
      ? await (await fetch(src)).arrayBuffer()
      : await window.electronAPI.readImageBytes(src);
    const imageBytes = new Uint8Array(bytes);
    return {
      colors: readImagePalette(imageBytes),
      indexes: await readIndexedPngPixels(imageBytes) ?? readIndexedBmpPixels(imageBytes),
    };
  } catch {
    return { colors: [] };
  }
}

export async function getPaletteIndexZeroColor(src: string): Promise<string | null> {
  try {
    const bytes = src.startsWith('data:')
      ? new Uint8Array(await (await fetch(src)).arrayBuffer())
      : new Uint8Array(await window.electronAPI.readImageBytes(src));
    const color = readImagePalette(bytes)[0];
    return color ? `rgb(${color.red}, ${color.green}, ${color.blue})` : null;
  } catch {
    return null;
  }
}

const colorKey = (color: RgbColor) => `${color.red},${color.green},${color.blue}`;
const sameColor = (left: RgbColor, right: RgbColor) => colorKey(left) === colorKey(right);

function parseColor(color: string): RgbColor | null {
  const match = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(color);
  return match ? {
    red: parseInt(match[1], 16),
    green: parseInt(match[2], 16),
    blue: parseInt(match[3], 16),
  } : null;
}

// Butano stores palette channels as 5-bit GBA values. Round-trip through the
// same 5-bit representation before painting the desktop preview, otherwise a
// color can look slightly different from the ROM despite using the same slot.
export function quantizeGbaColor(color: RgbColor): RgbColor {
  const channel = (value: number) => Math.round(Math.round(value * 31 / 255) * 255 / 31);
  return { red: channel(color.red), green: channel(color.green), blue: channel(color.blue) };
}

export function loadPaletteTransparentImage(src: string, replacementColors?: string[]): Promise<HTMLCanvasElement | null> {
  const cacheKey = `${src}:${replacementColors?.join(',') ?? ''}`;
  const cached = transparentImageCache.get(cacheKey);
  if (cached) return cached;

  const pending = new Promise<HTMLCanvasElement | null>(resolve => {
    const image = new Image();
    image.onload = async () => {
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) return resolve(null);

      context.imageSmoothingEnabled = false;
      context.drawImage(image, 0, 0);
      const imagePalette = await getImagePalette(src);
      try {
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
        const replacements = replacementColors?.map(parseColor)
          .filter((color): color is RgbColor => color !== null)
          .map(quantizeGbaColor) ?? [];
        const sourceColors = imagePalette.colors.length ? imagePalette.colors : [];

        // PNG/BMP indexed palettes preserve the exact index used by every pixel. For
        // non-indexed images, retain the prior best-effort preview by assigning the
        // first distinct *opaque* colors to the available palette slots. Transparent
        // pixels must not become a color entry: after a previous preview their RGB
        // channels may no longer retain the original index-0 color.
        if (!sourceColors.length && replacements.length) {
          for (let index = 0; index < pixels.data.length && sourceColors.length < replacements.length; index += 4) {
            if (pixels.data[index + 3] === 0) continue;
            const color = { red: pixels.data[index], green: pixels.data[index + 1], blue: pixels.data[index + 2] };
            if (!sourceColors.some(source => sameColor(source, color))) sourceColors.push(color);
          }
        }

        const paletteIndexes = new Map(sourceColors.map((color, index) => [colorKey(color), index]));
        for (let index = 0; index < pixels.data.length; index += 4) {
          const pixelColor = { red: pixels.data[index], green: pixels.data[index + 1], blue: pixels.data[index + 2] };
          const pixelNumber = index / 4;
          const paletteIndex = imagePalette.indexes?.[pixelNumber] ?? paletteIndexes.get(colorKey(pixelColor));
          if (paletteIndex !== undefined && replacements[paletteIndex]) {
            pixels.data[index] = replacements[paletteIndex].red;
            pixels.data[index + 1] = replacements[paletteIndex].green;
            pixels.data[index + 2] = replacements[paletteIndex].blue;
          }
          // Palette application comes first. The source lookup preserves the real
          // palette index, so index 0 remains transparent even when its selected
          // palette color differs from the original image's color.
          if (imagePalette.colors.length > 0 && paletteIndex === 0) {
            pixels.data[index + 3] = 0;
          }
        }
        context.putImageData(pixels, 0, 0);
      } catch {
        // If a source cannot be read, keep its original pixels visible.
      }
      resolve(canvas);
    };
    image.onerror = () => resolve(null);
    image.src = src;
  });

  transparentImageCache.set(cacheKey, pending);
  return pending;
}
