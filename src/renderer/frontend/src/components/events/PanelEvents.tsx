import { IArgs, IScriptsElement } from "@/providers/contexts/interfaces/ISceneElement";
import SceneEvent from "./SceneEvent";
import FadeEvent from "./FadeEvent";
import FadeOptionsEvent from './FadeOptionsEvent';
import { EEvents } from "./interfaces/IEvents";
import WaitEvent from "./WaitEvent";
import { ChangeLayerEvent, MoveLayerEvent } from "./LayerEvent";
import { ChangePaletteBackgroundEvent, VisibleBackgroundEvent } from "./BackgroundEvents";
import IfEvent from "./IfEvent";
import VariableEvent from "./VariableEvent";
import AnimationSpeedEvent from "./AnimationSpeedEvent";
import CallScriptEvent from './CallScriptEvent';
import ActorStateEvent from './ActorStateEvent';
import CameraEvent from './CameraEvent';
import RuntimeEventPanel from './RuntimeEventPanel';
import VariableTextEvent from './VariableTextEvent';

interface PanelEventsProps {
  event: IScriptsElement | null;
  customTitle: (newTitle: string) => void;
  onValueChange: (eventId: string, eventArgs: IArgs) => void;
}

export default function PanelEvents({ event, customTitle, onValueChange }: PanelEventsProps) {
  if (!event) return null;

  switch (event.command) {
    case EEvents.FADE_IN:
      return <FadeEvent event={event} onValueChange={onValueChange}/>;
    case EEvents.CHANGE_SCENE:
      return <SceneEvent event={event} customTitle={customTitle} onValueChange={onValueChange}/>;
    case EEvents.FADE_OUT:
      return <FadeEvent event={event} onValueChange={onValueChange} />;
    case EEvents.FADE_OPTIONS:
      return <FadeOptionsEvent event={event} onValueChange={onValueChange} />;
    case EEvents.WAIT:
      return <WaitEvent event={event} customTitle={customTitle} onValueChange={onValueChange} />;
    case EEvents.CHANGE_LAYER:
      return <ChangeLayerEvent event={event} onValueChange={onValueChange}/>
    case EEvents.VISIBLE_BACKGROUND:
      return <VisibleBackgroundEvent event={event} onValueChange={onValueChange}/>
    case EEvents.BACKGROUND_SCROLL:
      return <RuntimeEventPanel event={event} onValueChange={onValueChange}/>
    case EEvents.BACKGROUND_SET_PARALLAX:
      return <RuntimeEventPanel event={event} onValueChange={onValueChange}/>
    case EEvents.CHANGE_PALETTE_BACKGROUND:
      return <ChangePaletteBackgroundEvent event={event} onValueChange={onValueChange}/>
     case EEvents.MOVE_LAYER:
      return <MoveLayerEvent event={event} onValueChange={onValueChange}/>
    case EEvents.IF:
    case EEvents.WHILE:
      return <IfEvent event={event} onValueChange={onValueChange} />;
    case EEvents.VARIABLE:
    case EEvents.VARIABLE_RESET_ALL:
      return <VariableEvent event={event} onValueChange={onValueChange} />;
    case EEvents.DISPLAY_VARIABLE_TEXT:
      return <VariableTextEvent event={event} onValueChange={onValueChange} />;
    case EEvents.UI_SET_TEXT:
    case EEvents.UI_SET_VALUE:
    case EEvents.UI_ANIMATE:
    case EEvents.UI_DESTROY:
    case EEvents.UI_HIDE:
    case EEvents.UI_SHOW:
    case EEvents.UI_ANIMATION_STOP:
      return <RuntimeEventPanel event={event} onValueChange={onValueChange} />;
    case EEvents.SET_ANIMATION_SPEED:
      return <AnimationSpeedEvent event={event} onValueChange={onValueChange} />;
    case EEvents.ACTOR_SET_STATE:
      return <ActorStateEvent event={event} onValueChange={onValueChange} />;
    case EEvents.ACTOR_SET_ANIMATION:
      return <AnimationSpeedEvent event={event} onValueChange={onValueChange} />;
    case EEvents.SET_ACTOR_PRIORITY:
    case EEvents.SPRITE_EFFECT:
      return <RuntimeEventPanel event={event} onValueChange={onValueChange} />;
    case EEvents.CALL_SCRIPT:
      return <CallScriptEvent event={event} onValueChange={onValueChange} />;
    case EEvents.PAN_CAMERA:
    case EEvents.CAMERA_MOVE_TO:
      return <CameraEvent event={event} onValueChange={onValueChange} />;
    case EEvents.CAMERA_FOLLOW:
    case EEvents.CAMERA_SHAKE:
      return <RuntimeEventPanel event={event} onValueChange={onValueChange} />;
    case EEvents.MUSIC_RESUME:
    case EEvents.MUSIC_PAUSE:
    case EEvents.MUSIC_FADE:
      return <RuntimeEventPanel event={event} onValueChange={onValueChange} />;
      case EEvents.SOUND_STOP:
      case EEvents.RUMBLE:
      case EEvents.BLEND_ALPHA:
        return <RuntimeEventPanel event={event} onValueChange={onValueChange} />;
    case EEvents.SHOOTER_START:
    case EEvents.SHOOTER_SPAWN_WAVE:
    case EEvents.SHOOTER_LOAD_STAGE:
    case EEvents.SHOOTER_SET_BACKGROUND_MODE:
    case EEvents.SHOOTER_PAUSE:
    case EEvents.SHOOTER_STOP:
    case EEvents.SHOOTER_CLEAR_ENEMIES:
    case EEvents.SHOOTER_SPAWN_BOSS:
    case EEvents.SHOOTER_SET_BOSS_PHASE:
    case EEvents.SHOOTER_WAIT_SIGNAL:
    case EEvents.SHOOTER_GRANT:
    case EEvents.SHOOTER_SET_STAT:
    case EEvents.SHOOTER_ADD_STAT:
    case EEvents.SHOOTER_SET_PLAYER_ENABLED:
      return <RuntimeEventPanel event={event} onValueChange={onValueChange} />;
    // case EEvents.IDLE:
    //   return WaitingEvent.idle();
    default:
      return <RuntimeEventPanel event={event} customTitle={customTitle} onValueChange={onValueChange} />;
  }

}
