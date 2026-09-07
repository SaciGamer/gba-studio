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