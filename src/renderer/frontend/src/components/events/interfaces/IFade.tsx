import { IArgs } from "@/providers/contexts/interfaces/ISceneElement";

export interface IFade extends IArgs {
  speed?: number;
}

export interface IFadeOptions extends IArgs {
  color?: 'black' | 'white';
}
