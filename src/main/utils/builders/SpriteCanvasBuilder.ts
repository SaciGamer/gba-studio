import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createSpriteCanvasPlan } from './spriteCanvasPlan';
import { composeSpriteCanvas, encodeSpriteBmp, indexedTransparency } from './spriteCanvasPixels';
const execute = promisify(execFile);
export async function materializeSpriteCanvas(resource: any, sourcePath: string, graphicsDir: string, magickPath: string): Promise<void> {
    const dimensions = await execute(magickPath, [sourcePath + '[0]', '-format', '%w %h', 'info:'], { windowsHide: true });
    const [width, height] = dimensions.stdout.trim().split(/\s+/).map(Number);
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0)
        throw new Error(`Cannot read sprite dimensions: ${sourcePath}`);
    const plan = createSpriteCanvasPlan(resource, width, height);
    const decoded = await execute(magickPath, [sourcePath + '[0]', '-alpha', 'on', '-depth', '8', 'RGBA:-'], { encoding: 'buffer', maxBuffer: Math.max(1024 * 1024, width * height * 4 + 1024), windowsHide: true });
    const rgba = new Uint8Array(decoded.stdout);
    const mask = indexedTransparency(fs.readFileSync(sourcePath));
    if (mask) {
        if (mask.length !== width * height)
            throw new Error(`Sprite transparency dimensions do not match: ${sourcePath}`);
        for (let pixel = 0; pixel < mask.length; pixel++)
            if (mask[pixel])
                rgba[pixel * 4 + 3] = 0;
    }
    const canvas = composeSpriteCanvas(rgba, width, height, plan);
    let hash = 2166136261;
    for (const character of String(resource.id ?? resource.filename))
        hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0;
    const label = String(resource.id ?? resource.filename).normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^A-Za-z0-9_]/g, '_').toLowerCase().slice(0, 40);
    const graphicsName = `gbas_canvas_${label}_${hash.toString(16)}`;
    fs.mkdirSync(graphicsDir, { recursive: true });
    fs.writeFileSync(path.join(graphicsDir, graphicsName + '.bmp'), encodeSpriteBmp(canvas, plan.width, plan.height));
    fs.writeFileSync(path.join(graphicsDir, graphicsName + '.json'), JSON.stringify({ type: 'sprite', width: plan.frameWidth, height: plan.frameHeight }, null, 2));
    // Build-only metadata. Original source rectangles and project files stay intact.
    resource.__spriteCanvas = { graphicsName, width: plan.width, height: plan.height, frameWidth: plan.frameWidth, frameHeight: plan.frameHeight, idleFrame: plan.idleFrame, animations: plan.animations };
}
