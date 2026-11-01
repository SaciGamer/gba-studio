import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ResourceFile, JsonResourceDefault } from '../types/BuildTypes';
import { backgroundSheetGeometry, BACKGROUND_ANIMATE } from '../../../shared/events/backgroundSheetAnimation';
import { collectBackgroundManipulations } from '../../../shared/events/backgroundCompatibility';
import { indexedTransparency, encodeSpriteBmp } from './spriteCanvasPixels';
import { fitRegularBgBmp } from './regularBgDimensions';
import { withEventContext } from '../events/EventDiagnostics';

const execute = promisify(execFile);
const bitmapScene = (scene: any) => ['logo', 'pointclick', 'pointnclick'].includes(String(scene.sceneType).toLowerCase().replace(/[^a-z]/g, ''));

/** Mark editor-only sheets so preparation emits one complete copy in each required native mode. */
export function prepareBackgroundAnimationSheets(resources: ResourceFile[]): void {
  const sheets = new Set<string>(), staticImages = new Set<string>();
  const visit = (value: any): void => {
    if (!value || typeof value !== 'object' || value._deleted) return;
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (value.command === BACKGROUND_ANIMATE) {
      if (!value.args?.__comment && !value.disabled && value.enabled !== false) sheets.add(value.args?.backgroundId);
      visit(value.children); return;
    }
    for (const [key, child] of Object.entries(value)) {
      if (key === 'backgroundId' || key === 'targetTilesetId') { if (typeof child === 'string') staticImages.add(child); }
      else if (key === 'frameTilesetIds' && Array.isArray(child)) child.forEach(id => staticImages.add(id));
      else visit(child);
    }
  };
  resources.forEach(file => { if (file.jsonContent?._resourceType !== 'background') visit(file.jsonContent); });
  for (const file of resources) if (file.jsonContent?._resourceType === 'background') {
    const image = file.jsonContent as any;
    image.__backgroundAnimationSheetOnly = sheets.has(image.id) && !staticImages.has(image.id);
  }
}

/** Prepare one complete sheet per native graphics mode, never one asset per frame. */
export async function materializeBackgroundAnimations(resources: ResourceFile[], assetsDir: string, graphicsDir: string, magick: string): Promise<JsonResourceDefault[]> {
  const definitions = new Map<string, any>(), events = new Map<string, any>(), modes = new Map<string, Set<'regular' | 'bitmap'>>();
  for (const file of resources) if (file.jsonContent?._resourceType === 'scripts')
    for (const definition of (file.jsonContent as any).scripts ?? []) if (!definition._deleted) definitions.set(definition.id, definition);
  const collect = (value: any): void => {
    if (!value || typeof value !== 'object' || value._deleted) return;
    if (Array.isArray(value)) { value.forEach(collect); return; }
    if (value.command && (value.args?.__comment || value.disabled || value.enabled === false)) return;
    if (value.command === BACKGROUND_ANIMATE) events.set(value.id, value);
    for (const [key, child] of Object.entries(value)) if (key !== 'args') collect(child);
  };
  resources.forEach(file => collect(file.jsonContent));
  for (const file of resources) {
    const scene = file.jsonContent as any;
    if (scene?._resourceType !== 'scene' || scene._deleted) continue;
    for (const event of collectBackgroundManipulations(scene, definitions)) if (event.command === BACKGROUND_ANIMATE) {
      if (!modes.has(event.id)) modes.set(event.id, new Set());
      modes.get(event.id)!.add(bitmapScene(scene) ? 'bitmap' : 'regular');
    }
  }
  const backgrounds = new Map(resources.filter(file => file.jsonContent?._resourceType === 'background').map(file => [file.jsonContent!.id, file.jsonContent as any]));
  const generated = new Map<string, JsonResourceDefault>(), expected = new Set<string>();
  fs.mkdirSync(graphicsDir, { recursive: true });
  for (const event of events.values()) {
    try {
      const args = event.args ?? {}, image = backgrounds.get(args.backgroundId);
      if (!image) throw new Error('Background animation: select an existing source image');
      const root = path.resolve(assetsDir, image.hd ? 'backgrounds-hd' : 'backgrounds'), source = path.resolve(root, String(image.filename));
      if (!source.startsWith(root + path.sep) || !fs.existsSync(source)) throw new Error(`Background animation source is unavailable: ${image.filename}`);
      const dimensions = (await execute(magick, ['identify', '-format', '%w %h', source], { windowsHide: true })).stdout.trim().split(/\s+/).map(Number);
      const geometry = backgroundSheetGeometry(args, { ...image, imageWidth: dimensions[0], imageHeight: dimensions[1] });
      const bytes = fs.readFileSync(source), mask = image.hd ? null : indexedTransparency(bytes);
      const hash = crypto.createHash('sha256').update('background-animation-whole-sheet-v1').update(bytes).update(JSON.stringify([geometry.paddedImageWidth, geometry.paddedImageHeight])).digest('hex').slice(0, 16);
      event.args = { ...args, regularBackgroundId: '', bitmapBackgroundId: '', sourceStartFrame: geometry.frameIndices[0], frameDelta: geometry.reverse ? -1 : 1,
        resolvedFrameCount: geometry.frameCount, stepX: geometry.direction === 'horizontal' ? geometry.step : 0, stepY: geometry.direction === 'vertical' ? geometry.step : 0 };
      for (const mode of modes.get(event.id) ?? new Set<'regular' | 'bitmap'>([image.hd ? 'bitmap' : 'regular'])) {
        const name = `bg_anim_${hash}_${mode === 'regular' ? 'r' : 'b'}`;
        expected.add(name);
        event.args[mode === 'regular' ? 'regularBackgroundId' : 'bitmapBackgroundId'] = name;
        const destination = path.join(graphicsDir, name + '.bmp');
        if (!fs.existsSync(destination) || !fs.existsSync(path.join(graphicsDir, name + '.json'))) {
          if (mode === 'bitmap') {
            await execute(magick, [source, '-background', 'black', '-alpha', 'remove', '-alpha', 'off', '-type', 'TrueColor', '-gravity', 'NorthWest', '-extent', `${geometry.paddedImageWidth}x${geometry.paddedImageHeight}`, '-compress', 'None', `BMP3:${destination}`], { windowsHide: true });
            if (mask) {
              const bitmap = fs.readFileSync(destination), offset = bitmap.readUInt32LE(10);
              if (bitmap.readUInt16LE(28) !== 24) throw new Error('Expected a 24-bit direct bitmap sheet');
              const stride = Math.ceil(geometry.paddedImageWidth * 3 / 4) * 4;
              for (let row = 0; row < dimensions[1]; ++row) for (let col = 0; col < dimensions[0]; ++col) if (mask[row * dimensions[0] + col]) {
                const pixel = offset + (geometry.paddedImageHeight - 1 - row) * stride + col * 3;
                bitmap.fill(0, pixel, pixel + 3);
              }
              fs.writeFileSync(destination, bitmap);
            }
          } else {
            // Use the same indexed BMP padding as ordinary backgrounds.
            const width = geometry.paddedImageWidth, height = geometry.paddedImageHeight;
            if (width > 16384 || height > 16384) throw new Error('Regular animation sheets must fit the 16384-pixel background dimension limit; use a bitmap scene for larger sheets');
            const indexedBmp = bytes.toString('ascii', 0, 2) === 'BM' && [1, 4, 8].includes(bytes.readUInt16LE(28)) && bytes.readUInt32LE(30) === 0;
            let bmp: Buffer = bytes;
            if (!indexedBmp) {
              const output = await execute(magick, [source, '-colors', '255', '-depth', '8', 'rgba:-'], { encoding: 'buffer', maxBuffer: dimensions[0] * dimensions[1] * 4 + 1024, windowsHide: true });
              const rgba = new Uint8Array(output.stdout);
              if (rgba.length !== dimensions[0] * dimensions[1] * 4) throw new Error('Invalid background animation sheet');
              if (mask) for (let pixel = 0; pixel < mask.length; ++pixel) if (mask[pixel]) rgba[pixel * 4 + 3] = 0;
              bmp = encodeSpriteBmp(rgba, dimensions[0], dimensions[1]);
            }
            fs.writeFileSync(destination, fitRegularBgBmp(bmp, width, height).data);
          }
          fs.writeFileSync(path.join(graphicsDir, name + '.json'), JSON.stringify({ type: mode === 'regular' ? 'regular_bg' : 'direct_bitmap', compression: 'none' }));
        }
        generated.set(name, { _resourceType: 'background', id: name, name, filename: name + '.bmp', hd: mode === 'bitmap',
          imageWidth: mode === 'regular' ? Math.ceil(geometry.paddedImageWidth / 256) * 256 : geometry.paddedImageWidth,
          imageHeight: mode === 'regular' ? Math.ceil(geometry.paddedImageHeight / 256) * 256 : geometry.paddedImageHeight } as any);
      }
    } catch (error) { throw withEventContext(event, error); }
  }
  // Remove only this generator's stale outputs, including the old sliced assets.
  for (const entry of fs.readdirSync(graphicsDir)) {
    const match = /^(bg_anim_[a-f0-9]{16}_[rb](?:_\d+)?)\.(bmp|json)$/.exec(entry);
    if (match && !expected.has(match[1])) fs.unlinkSync(path.join(graphicsDir, entry));
  }
  const buildDir = path.resolve(graphicsDir, '..', 'build');
  if (fs.existsSync(buildDir)) for (const entry of fs.readdirSync(buildDir)) {
    const name = /^(?:bn_(?:regular_bg|direct_bitmap)_items_)?(bg_anim_[a-f0-9]{16}_[rb](?:_\d+)?)(?:\.h|_bn_gfx\..+)$/.exec(entry)?.[1];
    if (name && !expected.has(name)) fs.unlinkSync(path.join(buildDir, entry));
  }
  return [...generated.values()];
}
