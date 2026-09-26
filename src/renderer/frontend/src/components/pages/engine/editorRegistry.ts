export interface EditorDefinition {
  id: number;
  labelKey: string;
  supportsZoom: boolean;
  supportsSearch: boolean;
}

export const EDITORS: EditorDefinition[] = [
  { id: 1, labelKey: 'editor.world', supportsZoom: true, supportsSearch: true },
  { id: 3, labelKey: 'editor.sprites', supportsZoom: true, supportsSearch: true },
  { id: 4, labelKey: 'editor.images', supportsZoom: true, supportsSearch: true },
  { id: 5, labelKey: 'editor.music', supportsZoom: false, supportsSearch: true },
  { id: 6, labelKey: 'editor.sounds', supportsZoom: false, supportsSearch: true },
  { id: 7, labelKey: 'editor.palettes', supportsZoom: true, supportsSearch: true },
  { id: 8, labelKey: 'editor.dialogues', supportsZoom: false, supportsSearch: true },
  { id: 9, labelKey: 'editor.settings', supportsZoom: false, supportsSearch: true },
];

export const getEditor = (id: number) => EDITORS.find(editor => editor.id === id) ?? EDITORS[0];
