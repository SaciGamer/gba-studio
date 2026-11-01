import type { NumericValue } from '../../../../../../shared/numericValues';
import { IArgs } from "@/providers/contexts/interfaces/ISceneElement";

interface CustomField {
  type: string,
  value?: String | number,
  valueA?: CustomField,
  valueB?: CustomField
}

export interface IChangeScene extends IArgs {
  sceneId?: string | null,
  x?: CustomField | NumericValue,
  y?: CustomField | NumericValue,
  xUnit?: 'tiles' | 'pixels',
  yUnit?: 'tiles' | 'pixels',
  direction?: string,
  fadeSpeed?: number,
}
