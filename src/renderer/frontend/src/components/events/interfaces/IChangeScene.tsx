import { IArgs } from "@/providers/contexts/interfaces/ISceneElement";

interface CustomField {
  type: string,
  value?: String | number,
  valueA?: CustomField,
  valueB?: CustomField
}

export interface IChangeScene extends IArgs {
  sceneId?: string | null,
  x?: CustomField,
  y?: CustomField,
  direction?: string,
  fadeSpeed?: number,
}