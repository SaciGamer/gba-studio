import { useSyncExternalStore } from 'react';
import type { IScriptsElement } from '@/providers/contexts/interfaces/ISceneElement';

// Session clipboard: intentionally survives editor/resource unmounts.
let clipboard: IScriptsElement | null = null;
const listeners = new Set<() => void>();
let listening = false;
function publish(value: IScriptsElement | null) {
  clipboard = value;
  listeners.forEach(listener => listener());
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!listening) {
    window.addEventListener('keydown', event => {
      if (event.key === 'Escape' && clipboard) publish(null);
    }, true);
    listening = true;
  }
  return () => { listeners.delete(listener); };
}
export const copyEvent = (event: IScriptsElement) => publish(structuredClone(event));
export const useEventClipboard = () => useSyncExternalStore(subscribe, () => clipboard, () => null);
