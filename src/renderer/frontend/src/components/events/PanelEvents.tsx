import { IArgs, IScriptsElement } from "@/providers/contexts/interfaces/ISceneElement";
import SceneEvent from "./SceneEvent";
import FadeEvent from "./FadeEvent";
import { EEvents } from "./interfaces/IEvents";
import WaitEvent from "./WaitEvent";
import { ChangeLayerEvent, MoveLayerEvent } from "./LayerEvent";

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
    case EEvents.WAIT:
      return <WaitEvent event={event} customTitle={customTitle} onValueChange={onValueChange} />;
    case EEvents.CHANGE_LAYER:
      return <ChangeLayerEvent event={event} onValueChange={onValueChange}/>
     case EEvents.MOVE_LAYER:
      return <MoveLayerEvent event={event} onValueChange={onValueChange}/>
    // case EEvents.IDLE:
    //   return WaitingEvent.idle();
    default:
      return null;
  }

}