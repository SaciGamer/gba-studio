import { IArgs, ISceneSettings } from "@/providers/contexts/interfaces/ISceneElement";
import FadeEvent from "./FadeEvent";
import { EEvents } from "./interfaces/IEvents";
import { SceneEvent } from "./SceneEvent";
import WaitEvent from "./WaitEvent";

export default function DefaultValueEvents(command: string | undefined, scenes?: ISceneSettings[]): IArgs | undefined {
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
    // case EEvents.IDLE:
    //   return WaitingEvent.idle() ;
    default:
      return undefined;
  }
    
}