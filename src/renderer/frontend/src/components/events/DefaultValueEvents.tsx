import { IArgs, ISceneSettings } from "@/providers/contexts/interfaces/ISceneElement";
import FadeEvent from "./FadeEvent";
import { EEvents } from "./interfaces/IEvents";
import { SceneEvent } from "./SceneEvent";
import WaitEvent from "./WaitEvent";

export type VariableEventPreset = 'value' | 'false' | 'true';

export default function DefaultValueEvents(command: string | undefined, scenes?: ISceneSettings[], variablePreset: VariableEventPreset = 'value'): IArgs | undefined {
  if (!command) return undefined;

  switch (command) {
    case EEvents.FADE_IN:
      return FadeEvent.defaultValue();
    case EEvents.CHANGE_SCENE:
      return scenes ? SceneEvent.defaultValue(scenes) : undefined;
    case EEvents.FADE_OUT:
      return FadeEvent.defaultValue();
    case EEvents.WAIT:
      return WaitEvent.defaultValue();
    case EEvents.IF:
      return {
        left: { kind: 'literal', type: 'number', value: 0 },
        operator: '==',
        right: { kind: 'literal', type: 'number', value: 0 },
      };
    case EEvents.VARIABLE:
      if (variablePreset === 'false' || variablePreset === 'true') {
        return {
          variableId: '',
          variableSymbol: '',
          value: { kind: 'literal', type: 'boolean', value: variablePreset === 'true' },
        };
      }
      return {
        variableId: '',
        variableSymbol: '',
        value: { kind: 'literal', type: 'number', value: 0 },
      };
    case EEvents.VARIABLE_RESET_ALL:
      return { scope: 'ALL' };
    // case EEvents.IDLE:
    //   return WaitingEvent.idle() ;
    default:
      return undefined;
  }
    
}