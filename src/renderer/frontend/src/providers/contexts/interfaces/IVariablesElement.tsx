import { IBaseSettings } from './IBaseSettings';

export type EVariableType = 'number' | 'boolean' | 'string';
export type EVariableScope = 'GLOBAL' | 'LOCAL' | 'TEMP';

export type VariableValue = number | boolean | string;

export interface IVariableDefinition {
  id: string;
  name: string;
  symbol: string;
  type: EVariableType;
  scope?: EVariableScope;
  initialValue: VariableValue;
}

export interface IVariablesSettings extends IBaseSettings {
  _resourceType: 'variables';
  _version: string;
  variables: IVariableDefinition[];
}
