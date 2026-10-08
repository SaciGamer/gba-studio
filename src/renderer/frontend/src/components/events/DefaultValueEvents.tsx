import { IArgs, ISceneSettings } from "@/providers/contexts/interfaces/ISceneElement";
import FadeEvent from "./FadeEvent";
import FadeOptionsEvent from './FadeOptionsEvent';
import { EEvents } from "./interfaces/IEvents";
import { SceneEvent } from "./SceneEvent";
import WaitEvent from "./WaitEvent";
import { EVENT_DEFAULTS } from '../../../../../shared/events/eventCatalog';

export type VariableEventPreset = 'value' | 'false' | 'true';

export default function DefaultValueEvents(command: string | undefined, scenes?: ISceneSettings[], variablePreset: VariableEventPreset = 'value'): IArgs | undefined {
  if (!command) return undefined;

  const catalogDefault = EVENT_DEFAULTS[command];
  if (catalogDefault !== undefined && ![EEvents.CHANGE_SCENE, EEvents.VARIABLE, EEvents.IF, EEvents.WHILE].includes(command as EEvents)) {
    return structuredClone(catalogDefault) as IArgs;
  }

  switch (command) {
    case EEvents.FADE_IN:
      return FadeEvent.defaultValue();
    case EEvents.CHANGE_SCENE:
      return scenes ? SceneEvent.defaultValue(scenes) : undefined;
    case EEvents.FADE_OUT:
      return FadeEvent.defaultValue();
    case EEvents.FADE_OPTIONS:
      return FadeOptionsEvent.defaultValue();
    case EEvents.WAIT:
      return WaitEvent.defaultValue();
    case EEvents.IF:
    case EEvents.WHILE:
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
    case EEvents.SET_ANIMATION_SPEED:
    case EEvents.ACTOR_SET_ANIMATION:
      return { actorId: '', speed: 4 };
    case EEvents.SET_ACTOR_PRIORITY:
      return { actorId: '', priority: 2 };
    // case EEvents.IDLE:
    //   return WaitingEvent.idle() ;
    default:
      return undefined;
  }
    
}
