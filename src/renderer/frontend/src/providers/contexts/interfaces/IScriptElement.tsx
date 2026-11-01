import { IBaseSettings } from './IBaseSettings';
import { IScriptGraph, IScriptsElement } from './ISceneElement';
import type { ScriptParameter } from '../../../../../../shared/scriptParameters';

export interface IScriptDefinition {
  id: string;
  name: string;
  _deleted?: boolean;
  description?: string;
  parameters?: ScriptParameter[];
  events: IScriptsElement[];
  eventGraphs?: Record<string, IScriptGraph>;
}

export interface IScriptsSettings extends IBaseSettings {
  _resourceType: 'scripts';
  _version: string;
  scripts: IScriptDefinition[];
}
