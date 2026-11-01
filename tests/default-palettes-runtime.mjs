import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const root = path.resolve('.');
const { DEFAULT_PALETTES } = await import(pathToFileURL(path.join(root, 'dist/shared/defaultPalettes.js')));
const { encodeSlotPalettePixels } = await import(pathToFileURL(path.join(root, 'dist/main/utils/builders/SlotPalettePixels.js')));
const { toRuntimeScripts } = await import(pathToFileURL(path.join(root, 'dist/main/utils/types/RuntimeScript.js')));
const { ResourceBuilder } = await import(pathToFileURL(path.join(root, 'dist/main/utils/builders/ResourceBuilder.js')));
const { AssetBuilder } = await import(pathToFileURL(path.join(root, 'dist/main/utils/builders/AssetBuilder.js')));
const { encodeSpriteBmp } = await import(pathToFileURL(path.join(root, 'dist/main/utils/builders/spriteCanvasPixels.js')));
const { toRuntimeResource } = await import(pathToFileURL(path.join(root, 'dist/main/utils/types/RuntimeResources.js')));
const id = 'f3c0a5a8-865a-466c-9617-8bc37f630263';
const event = paletteIds => ({ id, version: 1, command: 'EVENT_CHANGE_DEFAULT_PALETTES', args: { paletteIds } });
assert.throws(() => toRuntimeScripts([event([4])]), /16 palette IDs/);
assert.throws(() => toRuntimeScripts([event(Array(17).fill(null))]), /16 palette IDs/);
assert.throws(() => toRuntimeScripts([event([''])]), /16 palette IDs/);
assert.equal(toRuntimeScripts([{ ...event([]), args: {} }]).length, 1);
const pixels = new Uint8Array([255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 0, 0, 0, 0]);
const encoded = encodeSlotPalettePixels(pixels, 4, ['a', 'a'], new Map([['a', ['#000000', '#ff0000']]]), x => x < 2 ? `__slot__:${x}` : null);
assert.deepEqual(encoded.bindings.map(binding => binding.slot), [0, 1]);
assert.notEqual(encoded.bindings[0].marker, encoded.bindings[1].marker, 'identical colors in different slots retain identity');
assert.deepEqual([...encoded.rgba.slice(8)], [...pixels.slice(8)], 'original and transparent pixels are preserved');
assert.throws(() => encodeSlotPalettePixels(pixels, 4, ['a'], new Map(), () => 'missing'), /not assigned/);

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-default-palettes-'));
try {
  fs.mkdirSync(path.join(temp, 'include'));
  fs.mkdirSync(path.join(temp, 'src'));
  fs.mkdirSync(path.join(temp, 'graphics'));
  const builder = new ResourceBuilder(temp, path.join(root, 'tools/butano/template'));
  const header = builder.processResourceObject({ _resourceType: 'scene', id, name: 'Slots', width: 256, height: 256, sceneType: 'Top Down', backgrounds: [], script: [event(['a', null])] }).headerContent.toString();
  assert.match(header, /DefaultPalettesEventData/);
  assert.match(header, /"a", "", ""/);
  const paletteId = 'f4ccdaee-3c83-4e25-9fde-7321b1b354bd';
  const sceneId = '1518cdb3-d379-4f95-9e3c-66006ef810bc';
  const settingsId = '0503ef65-ed05-41a5-b58f-74702ccced5a';
  const assets = path.join(temp, 'assets');
  fs.mkdirSync(path.join(assets, 'tilesets'), { recursive: true });
  const tile = new Uint8Array(8 * 8 * 4);
  for (let offset = 0; offset < tile.length; offset += 4) { tile[offset] = 255; tile[offset + 3] = 255; }
  fs.writeFileSync(path.join(assets, 'tilesets', 'tiles.bmp'), encodeSpriteBmp(tile, 8, 8));
  const scene = { _resourceType: 'scene', id: sceneId, name: 'Shared slots', sceneType: 'Top Down', width: 256, height: 256, gridSize: 8,
    backgrounds: [{ layerId: 0, selectedTilesetId: 'tiles', tileMap: [[0, 0]], tilePaletteIds: [['__slot__:0', '__slot__:1']] }], script: [] };
  const settings = { _resourceType: 'settings', id: settingsId, startSceneId: sceneId, colorPaletteIds: [paletteId, paletteId, ...DEFAULT_PALETTES.map(palette => palette.id)] };
  const palette = { _resourceType: 'palette', id: paletteId, colors: ['#000000', ...Array(15).fill('#ff0000')] };
  const files = [scene, settings, palette].map(jsonContent => ({ jsonContent, resourceType: 'gbasres', resourceName: '', headerContent: Buffer.alloc(0) }));
  const assetBuilder = new AssetBuilder(path.join(root, 'dist'), temp, path.join(root, 'bin/image-magick/magick.exe'));
  await assetBuilder.copyAssets(assets, files, { preserveStructure: false });
  const derived = await assetBuilder.materializeTileLayerEdits(files);
  assert.deepEqual(derived[0].__slotPaletteBindings.map(binding => binding.slot), [0, 1]);
  const projected = [settings, palette, ...derived].map(source => builder.processRuntimeResource(toRuntimeResource(source)));
  await builder.generateResourceRegistryClass(projected, { projectName: 'slots' });
  const registry = fs.readFileSync(path.join(temp, 'src/resource_registry.cpp'), 'utf8');
  for (const palette of DEFAULT_PALETTES) assert.ok(registry.includes(JSON.stringify(palette.id)), `Built-in palette ${palette.id} is available to compilation`);
  assert.match(registry, /get_slot_palette_binding/);
  assert.match(registry, /return 17;/, 'the second identical palette retains slot 1, color 1');
  assert.match(registry, new RegExp(`DEFAULT_PALETTE_IDS\\[16\\].*${paletteId}.*${paletteId}`));
  const source = fs.readFileSync('tools/butano/template/src/graphics_manager.cpp', 'utf8');
  const methods = source.slice(source.indexOf('const BackgroundPalette* GraphicsManager::resolve_slot_palette('), source.indexOf('void GraphicsManager::change_palette_layer('));
  const fixture = `
#include <cassert>
#include <cstdint>
#include <optional>
#include <string>
#include <string_view>
#include <vector>
#define BN_ASSERT(value, ...) assert(value)
#define BN_ERROR(...) assert(false)
namespace bn {
template<int N> using string = std::string;
using string_view = std::string_view;
struct color { int value; int data() const { return value; } };
struct colors_span { const color* ptr; int count; const color* data() const { return ptr; } int size() const { return count; } const color& operator[](int i) const { return ptr[i]; } };
struct palette_item { colors_span colors_ref() const; };
struct regular_bg_item { bn::palette_item palette_item() const { return {}; } };
struct bg_palette_ptr { int index; int id() const { return index; } int colors_count() const { return 2; } void set_color(int i, color c); };
}
struct BackgroundPalette { const char* id; const bn::color* colors; int colors_count; };
struct Backgrounds { const char* name; };
const bn::color original[] = {{0}, {123}};
const bn::color red[] = {{0}, {31}};
const bn::color blue[] = {{0}, {31744}};
const BackgroundPalette definitions[] = {{"a", red, 2}, {"b", blue, 2}};
bn::color live[4][2] = {};
bn::colors_span bn::palette_item::colors_ref() const { return {original, 2}; }
void bn::bg_palette_ptr::set_color(int i, bn::color c) { live[index][i] = c; }
const char* get_default_palette_id(int slot) { return slot == 0 ? "a" : slot == 1 ? "b" : ""; }
const BackgroundPalette* get_background_palette_by_id(const std::string& id) { for(const auto& p : definitions) if(id == p.id) return &p; return nullptr; }
const Backgrounds* get_background_by_id(const std::string&) { static const Backgrounds b = {"bg"}; return &b; }
int graphics_lookups=0;
std::optional<bn::regular_bg_item> get_bg_item_from_name(const char*) { ++graphics_lookups; return bn::regular_bg_item{}; }
int get_slot_palette_binding(const std::string&, int marker) { return marker == 123 ? 1 : -1; }
class GraphicsManager {
public:
const BackgroundPalette* default_palette_overrides[16] = {};
const char* const* layer_palette_overrides[4] = {};
const bn::color* slot_palette_sources[4] = {};
const Backgrounds* slot_palette_backgrounds[4] = {};
int slot_palette_native_ids[4] = {-1,-1,-1,-1};
uint32_t slot_palette_scene_revision = 0, scene_revision = 1;
struct Ids : std::vector<std::string> { int size() const { return int(std::vector<std::string>::size()); } } current_bgs_id;
std::optional<bn::bg_palette_ptr> get_layer_palette(int layer) { return bn::bg_palette_ptr{layer}; }
const BackgroundPalette* resolve_slot_palette(int) const;
const BackgroundPalette* resolve_palette_reference(const char*, int) const;
void change_default_palettes(const char* const*);
void update_default_palettes();
int override_updates = 0;
void change_palette_layer(int, const char* const*, bool) { ++override_updates; }
};
${methods}
int main() {
GraphicsManager gm; gm.current_bgs_id.push_back("bg"); gm.current_bgs_id.push_back("bg"); gm.update_default_palettes();
assert(live[0][1].value == 31 && live[1][1].value == 31);
const int initial_lookups=graphics_lookups;
for(int frame=0;frame<120;++frame)gm.update_default_palettes();
assert(graphics_lookups==initial_lookups); // stable layers do no graphics lookup/logging
const char* overrides[16] = {"b"}; gm.change_default_palettes(overrides);
assert(live[0][1].value == 31744 && live[1][1].value == 31744);
assert(graphics_lookups>initial_lookups); // palette events invalidate the fast path
assert(gm.resolve_palette_reference("a", 1) == &definitions[1]);
assert(gm.resolve_palette_reference("__slot__:0", 1) == &definitions[1]);
assert(gm.resolve_palette_reference(nullptr, 0) == &definitions[1]);
gm.current_bgs_id.push_back("bg"); gm.update_default_palettes(); assert(live[2][1].value == 31744);
const char* layer[16] = {}; gm.layer_palette_overrides[0] = layer;
gm.change_default_palettes(nullptr); assert(gm.override_updates == 1);
assert(live[0][1].value == 31 && live[1][1].value == 31 && live[2][1].value == 31);
assert(gm.resolve_palette_reference("__slot__:1", 0) == &definitions[1]);
++gm.scene_revision; gm.update_default_palettes(); assert(!gm.layer_palette_overrides[0]);
}
`;
  const input = path.join(temp, 'slots.cpp'), executable = path.join(temp, 'slots.exe');
  fs.writeFileSync(input, fixture);
  const compile = spawnSync(process.env.CXX || 'g++', ['-std=c++17', '-Wall', '-Wextra', '-Werror', input, '-o', executable], { encoding: 'utf8', windowsHide: true });
  assert.equal(compile.status, 0, `${compile.error ?? ''}${compile.stdout}${compile.stderr}`);
  const run = spawnSync(executable, [], { encoding: 'utf8', windowsHide: true });
  assert.equal(run.status, 0, `${run.stdout}${run.stderr}`);
  console.log('Default palettes passed: payload, ABI, slot identity, shared updates, new users, overrides and empty-field reset.');
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
