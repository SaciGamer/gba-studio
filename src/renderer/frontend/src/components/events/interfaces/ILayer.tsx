import { IArgs } from "@/providers/contexts/interfaces/ISceneElement";

export interface ILayerOptions {
  visible?: boolean;
  priority?: number;
  tileset?: string;
  palette?: string;
}

export interface ILayerMovement {
  x?: number;
  y?: number;
  speedX?: number;
  speedY?: number;
}

export interface LayerMultiProps extends ILayerMovement, ILayerOptions {
  layerId: number;
  backgroundId?: string | null;
}

export interface MultiLayers extends IArgs {
  layers: LayerMultiProps[]
}

export interface IChangeBackgroundArgs extends IArgs {
  layerId: number;
  backgroundId: string | null;
}

export interface IVisibleBackgroundArgs extends IArgs {
  layerId: number;
  visible: boolean;
}

export interface IChangePaletteBackgroundArgs extends IArgs {
  layerId: number;
  /** null means use the palette selected in Settings for that hardware slot. */
  paletteIds: Array<string | null>;
  /** Restores the background's original palette and disables overrides. */
  restorePaletteLayerDefault?: boolean;
}

export interface IDefaultPalettesArgs extends IArgs {
  /** Each null entry restores that index to its Settings default. */
  paletteIds: Array<string | null>;
}
