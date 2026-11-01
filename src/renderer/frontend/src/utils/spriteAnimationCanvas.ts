export type AnimationStripOrientation = 'horizontal' | 'vertical';
const shapes = [[8, 8], [16, 8], [8, 16], [16, 16], [32, 8], [8, 32], [32, 16], [16, 32], [32, 32], [64, 32], [32, 64], [64, 64]];
export function getAnimationCanvasFrameSize(width: number, height: number, animations: Array<{
    canvasFrames?: Array<{
        width: number;
        height: number;
    }>;
}>): {
    width: number;
    height: number;
} | null {
    for (const animation of animations)
        for (const frame of animation.canvasFrames ?? []) {
            width = Math.max(width, frame.width);
            height = Math.max(height, frame.height);
        }
    const shape = shapes.filter(([w, h]) => w >= width && h >= height).sort((a, b) => a[0] * a[1] - b[0] * b[1])[0];
    return shape ? { width: shape[0], height: shape[1] } : null;
}
export async function composeAnimationCanvas(sources: string[], frameWidth: number, frameHeight: number, orientation: AnimationStripOrientation): Promise<{
    source: string;
    width: number;
    height: number;
} | null> {
    if (!sources.length)
        return null;
    const images = await Promise.all(sources.map(source => new Promise<HTMLImageElement | null>(resolve => { if (!source)
        return resolve(null); const image = new Image(); image.onload = () => resolve(image); image.onerror = () => resolve(null); image.src = source; })));
    const canvas = document.createElement('canvas');
    canvas.width = frameWidth * (orientation === 'horizontal' ? sources.length : 1);
    canvas.height = frameHeight * (orientation === 'vertical' ? sources.length : 1);
    const context = canvas.getContext('2d');
    if (!context)
        return null;
    context.imageSmoothingEnabled = false;
    images.forEach((image, index) => { if (image)
        context.drawImage(image, orientation === 'horizontal' ? index * frameWidth : 0, orientation === 'vertical' ? index * frameHeight : 0); });
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    // The generated BMP stores GBA 5-bit colors. Quantize only the derived strip.
    for (let index = 0; index < pixels.data.length; index += 4)
        for (let color = 0; color < 3; color++)
            pixels.data[index + color] = Math.round(Math.round(pixels.data[index + color] * 31 / 255) * 255 / 31);
    for (let index = 3; index < pixels.data.length; index += 4) if (pixels.data[index]) pixels.data[index] = 255;
    context.putImageData(pixels, 0, 0);
    return { source: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height };
}
