import { IBaseSettings } from './IBaseSettings';
import { IScriptGraph, IScriptsElement } from './ISceneElement';

export interface IScriptDefinition {
  id: string;
  name: string;
  description?: string;
  events: IScriptsElement[];
  eventGraphs?: Record<string, IScriptGraph>;
}

export interface IScriptsSettings extends IBaseSettings {
  _resourceType: 'scripts';
  _version: string;
  scripts: IScriptDefinition[];
}
