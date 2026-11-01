import { useEffect, useState } from 'react';

export default function useSceneObjectSnapSize() {
  const [size, setSize] = useState<8 | 16>(8);
  useEffect(() => {
    let active = true;
    const apply = (preferences: { sceneObjectSnapSize?: number } | undefined) => setSize(preferences?.sceneObjectSnapSize === 16 ? 16 : 8);
    void window.electronAPI?.loadPreferences?.().then(value => { if (active) apply(value); }).catch(() => undefined);
    const changed = (event: Event) => apply((event as CustomEvent).detail);
    window.addEventListener('gba-studio:game-world-preferences', changed);
    return () => { active = false; window.removeEventListener('gba-studio:game-world-preferences', changed); };
  }, []);
  return size;
}
