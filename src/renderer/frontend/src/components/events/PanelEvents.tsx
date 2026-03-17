import { IScriptsElement } from "@/providers/contexts/interfaces/ISceneElement";
import ChangeSceneEvent from "./ChangeSceneEvent";
import FadeEvent from "./FadeEvent";
import { EEvents } from "./interfaces/IEvents";
import WaitEvent from "./WaitEvent";

interface PanelEventsProps {
  event: IScriptsElement | null;
  customTitle: (newTitle: string) => void;
  onValueChange: (eventId: string, eventArgs: any) => void;
}

export default function PanelEvents({ event, customTitle, onValueChange }: PanelEventsProps) {
  if (!event) return null;

  switch (event.command) {
    case EEvents.FADE_IN:
      return <FadeEvent event={event} onValueChange={onValueChange}/>;
    case EEvents.CHANGE_SCENE:
      return <ChangeSceneEvent event={event} customTitle={customTitle} onValueChange={onValueChange}/>;
    case EEvents.FADE_OUT:
      return <FadeEvent event={event} onValueChange={onValueChange} />;
    case EEvents.WAIT:
      return <WaitEvent event={event} customTitle={customTitle} onValueChange={onValueChange} />;
    // case EEvents.IDLE:
    //   return WaitingEvent.idle();
    default:
      return null;
  }

}