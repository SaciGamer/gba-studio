import { IArgs } from "@/providers/contexts/interfaces/ISceneElement";

export interface IWait extends IArgs {
  time: number;
  frames: number;
  units: string;
}