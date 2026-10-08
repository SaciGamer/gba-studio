import { inflateSync } from 'node:zlib';
import type { SpriteCanvasPlan } from './spriteCanvasPlan';
/** Decode palette indices before RGBA conversion so duplicate palette colors stay distinct. */
export function indexedTransparency(data: Buffer): Uint8Array | null {
    if (data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
        let width = 0, height = 0, depth = 0, color = 0, interlace = 0;
        const chunks: Buffer[] = [];
        for (let offset = 8; offset + 12 <= data.length;) {
            const size = data.readUInt32BE(offset), kind = data.toString('ascii', offset + 4, offset + 8), start = offset + 8;
            if (start + size + 4 > data.length)
                throw new Error('Truncated sprite PNG');
            if (kind === 'IHDR') {
                width = data.readUInt32BE(start);
                height = data.readUInt32BE(start + 4);
                depth = data[start + 8];
                color = data[start + 9];
                interlace = data[start + 12];
            }
            if (kind === 'IDAT')
                chunks.push(data.subarray(start, start + size));
            offset = start + size + 4;
        }
        if (color !== 3)
            return null;
        if (![1, 2, 4, 8].includes(depth) || !width || !height)
            throw new Error('Invalid indexed sprite PNG');
        const packed = inflateSync(Buffer.concat(chunks)), mask = new Uint8Array(width * height);
        let cursor = 0;
        const passes = interlace ? [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]] : [[0, 0, 1, 1]];
        const paeth = (a: number, b: number, c: number) => { const p = a + b - c, da = Math.abs(p - a), db = Math.abs(p - b), dc = Math.abs(p - c); return da <= db && da <= dc ? a : db <= dc ? b : c; };
        for (const [sx, sy, dx, dy] of passes) {
            const w = Math.max(0, Math.ceil((width - sx) / dx)), h = Math.max(0, Math.ceil((height - sy) / dy));
            if (!w || !h)
                continue;
            const bytes = Math.ceil(w * depth / 8);
            let previous = new Uint8Array(bytes);
            for (let y = 0; y < h; y++) {
                const filter = packed[cursor++], row = new Uint8Array(bytes);
                if (cursor + bytes > packed.length || filter > 4)
                    throw new Error('Invalid indexed sprite PNG scanline');
                for (let x = 0; x < bytes; x++) {
                    const a = x ? row[x - 1] : 0, b = previous[x], c = x ? previous[x - 1] : 0;
                    row[x] = (packed[cursor++] + (filter === 0 ? 0 : filter === 1 ? a : filter === 2 ? b : filter === 3 ? Math.floor((a + b) / 2) : paeth(a, b, c))) & 255;
                }
                for (let x = 0; x < w; x++) {
                    const bit = x * depth, index = (row[bit >> 3] >> (8 - depth - (bit & 7))) & ((1 << depth) - 1);
                    mask[(sy + y * dy) * width + sx + x * dx] = index === 0 ? 1 : 0;
                }
                previous = row;
            }
        }
        return mask;
    }
    if (data.toString('ascii', 0, 2) === 'BM' && data.length >= 54) {
        const width = data.readInt32LE(18), signedHeight = data.readInt32LE(22), height = Math.abs(signedHeight), depth = data.readUInt16LE(28);
        if (depth > 8)
            return null;
        if (![1, 4, 8].includes(depth) || data.readUInt32LE(30) !== 0 || width <= 0 || height <= 0)
            throw new Error('Unsupported indexed sprite BMP');
        const offset = data.readUInt32LE(10), stride = Math.floor((width * depth + 31) / 32) * 4;
        if (offset + stride * height > data.length)
            throw new Error('Truncated sprite BMP');
        const mask = new Uint8Array(width * height);
        for (let y = 0; y < height; y++)
            for (let x = 0; x < width; x++) {
                const bit = x * depth, at = offset + (signedHeight < 0 ? y : height - 1 - y) * stride + (bit >> 3), index = (data[at] >> (8 - depth - (bit & 7))) & ((1 << depth) - 1);
                mask[y * width + x] = index === 0 ? 1 : 0;
            }
        return mask;
    }
    return null;
}
export function composeSpriteCanvas(source: Uint8Array, sourceWidth: number, sourceHeight: number, plan: SpriteCanvasPlan): Uint8Array {
    if (source.length !== sourceWidth * sourceHeight * 4)
        throw new Error('Sprite RGBA dimensions do not match the decoded source');
    const output = new Uint8Array(plan.width * plan.height * 4);
    plan.frames.forEach((frame, index) => {
        const ox = plan.orientation === 'horizontal' ? index * plan.frameWidth : 0, oy = plan.orientation === 'vertical' ? index * plan.frameHeight : 0;
        for (const piece of frame.pieces)
            for (let y = 0; y < piece.height; y++)
                for (let x = 0; x < piece.width; x++) {
                    const tx = piece.x + x, ty = piece.y + y;
                    if (tx < 0 || ty < 0 || tx >= frame.width || ty >= frame.height)
                        continue;
                    const sx = piece.sourceX + (piece.flipX ? piece.width - 1 - x : x), sy = piece.sourceY + (piece.flipY ? piece.height - 1 - y : y), from = (sy * sourceWidth + sx) * 4, to = ((oy + ty) * plan.width + ox + tx) * 4;
                    if (sx < 0 || sy < 0 || sx >= sourceWidth || sy >= sourceHeight) continue;
                    const alpha = source[from + 3] / 255;
                    if (!alpha)
                        continue;
                    const oldAlpha = output[to + 3] / 255, outAlpha = alpha + oldAlpha * (1 - alpha);
                    for (let c = 0; c < 3; c++)
                        output[to + c] = Math.round((source[from + c] * alpha + output[to + c] * oldAlpha * (1 - alpha)) / outAlpha);
                    output[to + 3] = Math.round(outAlpha * 255);
                }
    });
    return output;
}
/** GBA palette entry zero is reserved exclusively for transparent pixels. */
export function encodeSpriteBmp(pixels: Uint8Array, width: number, height: number): Buffer {
    const colors: number[] = [], map = new Map<number, number>(), indices = new Uint8Array(width * height);
    const q = (c: number) => Math.round(Math.round(c * 31 / 255) * 255 / 31);
    for (let index = 0; index < indices.length; index++) {
        const p = index * 4;
        if (!pixels[p + 3])
            continue;
        const color = (q(pixels[p]) << 16) | (q(pixels[p + 1]) << 8) | q(pixels[p + 2]);
        let slot = map.get(color);
        if (slot === undefined) {
            slot = colors.length + 1;
            if (slot > 255)
                throw new Error('Generated sprite uses more than 255 visible GBA colors; reduce the source palette');
            colors.push(color);
            map.set(color, slot);
        }
        indices[index] = slot;
    }
    const count = colors.length < 16 ? 16 : 256;
    let transparent = 0xff00ff;
    for (let color = 0; map.has(transparent); color++)
        transparent = (q((color & 31) * 255 / 31) << 16) | (q(((color >> 5) & 31) * 255 / 31) << 8) | q(((color >> 10) & 31) * 255 / 31);
    const palette = [transparent, ...colors];
    const stride = Math.ceil(width / 4) * 4, offset = 54 + count * 4, data = Buffer.alloc(offset + stride * height);
    data.write('BM');
    data.writeUInt32LE(data.length, 2);
    data.writeUInt32LE(offset, 10);
    data.writeUInt32LE(40, 14);
    data.writeInt32LE(width, 18);
    data.writeInt32LE(height, 22);
    data.writeUInt16LE(1, 26);
    data.writeUInt16LE(8, 28);
    data.writeUInt32LE(stride * height, 34);
    data.writeUInt32LE(count, 46);
    palette.forEach((color, index) => { data[offset - count * 4 + index * 4] = color & 255; data[offset - count * 4 + index * 4 + 1] = (color >> 8) & 255; data[offset - count * 4 + index * 4 + 2] = (color >> 16) & 255; });
    for (let y = 0; y < height; y++)
        Buffer.from(indices.subarray(y * width, (y + 1) * width)).copy(data, offset + (height - 1 - y) * stride);
    return data;
}
