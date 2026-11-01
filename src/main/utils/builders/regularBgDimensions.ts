/** Round build graphics only; the scene's playable dimensions stay unchanged. */
export function regularBgDimensions(width: number, height: number) {
    if (![width, height].every(value => Number.isInteger(value) && value > 0 && value <= 16384)) {
        throw new Error(`Regular background dimensions must be positive integers up to 16384: ${width}x${height}`);
    }
    return { width: Math.ceil(width / 256) * 256, height: Math.ceil(height / 256) * 256 };
}

/** Preserve palette indices exactly. Pad to the right/bottom with index 0. */
export function fitRegularBgBmp(data: Buffer, logicalWidth?: number, logicalHeight?: number) {
    if (data.length < 54 || data.toString('ascii', 0, 2) !== 'BM') throw new Error('Invalid regular background BMP');
    const sourceWidth = data.readInt32LE(18), signedHeight = data.readInt32LE(22);
    const sourceHeight = Math.abs(signedHeight), bits = data.readUInt16LE(28), offset = data.readUInt32LE(10);
    if (![1, 4, 8].includes(bits) || data.readUInt32LE(30) !== 0 || sourceWidth <= 0 || sourceHeight <= 0) {
        throw new Error('Regular background padding requires an uncompressed indexed BMP');
    }
    const width = logicalWidth ?? sourceWidth, height = logicalHeight ?? sourceHeight;
    const dimensions = regularBgDimensions(width, height);
    const sourceStride = Math.ceil(sourceWidth * bits / 32) * 4;
    if (offset < 54 || offset + sourceStride * sourceHeight > data.length) throw new Error('Truncated regular background BMP');
    const stride = Math.ceil(dimensions.width * bits / 32) * 4;
    const output = Buffer.alloc(offset + stride * dimensions.height);
    data.copy(output, 0, 0, offset);
    output.writeUInt32LE(output.length, 2);
    output.writeInt32LE(dimensions.width, 18);
    output.writeInt32LE(dimensions.height, 22);
    output.writeUInt32LE(stride * dimensions.height, 34);
    for (let y = 0; y < Math.min(height, sourceHeight); ++y) {
        const sourceRow = offset + (signedHeight < 0 ? y : sourceHeight - 1 - y) * sourceStride;
        const targetRow = offset + (dimensions.height - 1 - y) * stride;
        for (let x = 0; x < Math.min(width, sourceWidth); ++x) {
            const shift = 8 - bits - ((x * bits) % 8);
            const index = (data[sourceRow + Math.floor(x * bits / 8)] >> shift) & ((1 << bits) - 1);
            output[targetRow + Math.floor(x * bits / 8)] |= index << shift;
        }
    }
    return { ...dimensions, data: output };
}
