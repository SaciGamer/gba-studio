import { IBaseSettings } from './IBaseSettings';
import { IPaletteDefinition } from './ISettingElement';

export interface IPalettesSettings extends IBaseSettings {
  _resourceType: 'palettes';
  _version: string;
  palettes: IPaletteDefinition[];
}
