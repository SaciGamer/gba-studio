export interface MusicEditorSettings {
  version: 1;
  view: 'roll' | 'keyboard' | 'tracker';
  tool: 'pencil' | 'eraser' | 'select';
  playMode: 'pattern' | 'song';
  scaleRoot: number;
  scaleMode: number;
  snapToScale: boolean;
  loop: boolean;
  ghostLayer: boolean;
  zoom: number;
}

/** Editor preferences are optional in older packages and never affect exported music. */
export function readMusicEditorSettings(input?: unknown): MusicEditorSettings {
  const value = input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {};
  const integer = (key: string, min: number, max: number, fallback: number) =>
    typeof value[key] === 'number' && Number.isInteger(value[key]) && Number(value[key]) >= min && Number(value[key]) <= max ? Number(value[key]) : fallback;
  return {
    version: 1,
    view: value.view === 'keyboard' || value.view === 'tracker' ? value.view : 'roll',
    tool: value.tool === 'eraser' || value.tool === 'select' ? value.tool : 'pencil',
    playMode: value.playMode === 'pattern' ? 'pattern' : 'song',
    scaleRoot: integer('scaleRoot', 0, 11, 0),
    scaleMode: integer('scaleMode', 0, 2, 0),
    snapToScale: value.snapToScale === true,
    loop: value.loop === true,
    ghostLayer: value.ghostLayer === true,
    zoom: integer('zoom', 12, 72, 20),
  };
}
