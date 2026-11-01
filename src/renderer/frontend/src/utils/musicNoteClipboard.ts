import { useSyncExternalStore } from 'react';

export interface MusicNoteClipboard {
  baseNote: number;
  notes: Array<{ rowOffset: number; noteDelta: number; instrument: number; length: number }>;
}
const kind = 'gba-studio/music-notes';
const maxTextLength = 2 * 1024 * 1024;
let clipboard: MusicNoteClipboard | null = null;
let pendingWrite: Promise<unknown> = Promise.resolve();
const listeners = new Set<() => void>();
const publish = (value: MusicNoteClipboard | null) => { clipboard = value; listeners.forEach(listener => listener()); };
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const useMusicNoteClipboard = () => useSyncExternalStore(subscribe, () => clipboard, () => null);

export function parseMusicNoteClipboard(text: string): MusicNoteClipboard | null {
  if (typeof text !== 'string' || text.length > maxTextLength) return null;
  try {
    const value = JSON.parse(text);
    if (value?.kind !== kind || value.version !== 1 || !Number.isInteger(value.baseNote) || value.baseNote < 1 || value.baseNote > 96
      || !Array.isArray(value.notes) || !value.notes.length || value.notes.length > 4096) return null;
    const valid = value.notes.every((note: MusicNoteClipboard['notes'][number]) => note && Number.isInteger(note.rowOffset) && note.rowOffset >= 0
      && Number.isInteger(note.length) && note.length >= 1 && note.rowOffset + note.length <= 65536
      && Number.isInteger(note.noteDelta) && value.baseNote + note.noteDelta >= 1 && value.baseNote + note.noteDelta <= 96
      && Number.isInteger(note.instrument) && note.instrument >= 1 && note.instrument <= 255);
    return valid ? { baseNote: value.baseNote, notes: value.notes.map((note: MusicNoteClipboard['notes'][number]) => ({
      rowOffset: note.rowOffset, noteDelta: note.noteDelta, instrument: note.instrument, length: note.length,
    })) } : null;
  } catch { return null; }
}

export function copyMusicNotes(value: MusicNoteClipboard): void {
  const text = JSON.stringify({ kind, version: 1, ...value });
  const copied = parseMusicNoteClipboard(text);
  if (!copied) return;
  publish(copied);
  pendingWrite = (async () => {
    if (window.electronAPI?.writeMusicNoteClipboard) await window.electronAPI.writeMusicNoteClipboard(text);
    else if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
  })().catch(() => { /* The session clipboard still supports switching beats. */ });
}

export async function readMusicNotes(): Promise<MusicNoteClipboard | null> {
  await pendingWrite;
  try {
    const text = window.electronAPI?.readMusicNoteClipboard ? await window.electronAPI.readMusicNoteClipboard()
      : navigator.clipboard?.readText ? await navigator.clipboard.readText() : undefined;
    if (text !== undefined) publish(parseMusicNoteClipboard(text));
  } catch { /* Fall back to the session clipboard when system access is unavailable. */ }
  return clipboard;
}
