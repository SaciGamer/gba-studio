export interface SlotPaletteBinding { marker: number; slot: number; color: number }

const packed = (r: number, g: number, b: number) => Math.round(r * 31 / 255) | (Math.round(g * 31 / 255) << 5) | (Math.round(b * 31 / 255) << 10);

/** Preserve slot identity through Grit's palette optimization, even for identical colors. */
export function encodeSlotPalettePixels(rgba: Uint8Array, width: number, slots: Array<string | null>, palettes: Map<string, string[]>, paletteAt: (x: number, y: number) => string | null | undefined) {
  const output = new Uint8Array(rgba);
  const occupied = new Set<number>();
  for (let offset = 0; offset < rgba.length; offset += 4) if (rgba[offset + 3]) occupied.add(packed(rgba[offset], rgba[offset + 1], rgba[offset + 2]));
  const bindings: SlotPaletteBinding[] = [];
  const markers = new Map<string, number>();
  let candidate = 1;
  for (let offset = 0; offset < rgba.length; offset += 4) {
    if (!rgba[offset + 3]) continue;
    const pixel = offset / 4;
    const id = paletteAt(pixel % width, Math.floor(pixel / width));
    if (!id || id === '__original__') continue;
    const slot = /^__slot__:(?:[0-9]|1[0-5])$/.test(id) ? Number(id.slice(9)) : slots.indexOf(id);
    if (slot < 0) throw new Error(`Tile palette '${id}' is not assigned to a default Settings slot`);
    const colors = palettes.get(slots[slot] ?? id);
    if (!colors?.length) throw new Error(`Default palette '${id}' is missing`);
    let color = 1, distance = Infinity;
    // Color zero remains transparent; opaque source pixels use colors 1..15.
    for (let index = 1; index < Math.min(16, colors.length); ++index) {
      const rgb = /^#?([\da-f]{6})$/i.exec(colors[index]);
      if (!rgb) continue;
      const value = parseInt(rgb[1], 16);
      const d = (rgba[offset] - (value >> 16)) ** 2 + (rgba[offset + 1] - ((value >> 8) & 255)) ** 2 + (rgba[offset + 2] - (value & 255)) ** 2;
      if (d < distance) { distance = d; color = index; }
    }
    const key = `${slot}:${color}`;
    let marker = markers.get(key);
    if (marker === undefined) {
      while (occupied.has(candidate)) ++candidate;
      if (candidate > 32767) throw new Error('No palette identity colors available');
      marker = candidate++;
      occupied.add(marker); markers.set(key, marker); bindings.push({ marker, slot, color });
    }
    output[offset] = Math.round((marker & 31) * 255 / 31);
    output[offset + 1] = Math.round(((marker >> 5) & 31) * 255 / 31);
    output[offset + 2] = Math.round(((marker >> 10) & 31) * 255 / 31);
  }
  return { rgba: output, bindings };
}
