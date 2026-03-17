
interface CustomField {
  type: string,
  value?: String | number,
  valueA?: CustomField,
  valueB?: CustomField
}

export interface IChangeScene {
  sceneId?: string | null,
  x?: CustomField,
  y?: CustomField,
  direction?: string,
  fadeSpeed?: number,
}