import { IScriptsElement } from "@/providers/contexts/interfaces/ISceneElement";
import { Select } from "antd";
import NumericEventInput from '../NumericEventInput';
import { Content } from "antd/es/layout/layout";
import { IFade } from './interfaces/IFade';

interface FadeEventsProps {
  event: IScriptsElement | undefined;
  onValueChange: (eventId: string, eventArgs: IFade) => void;
}

export function FadeEvent({ event, onValueChange }: FadeEventsProps) {
  const args = event?.args as IFade;

  const optSpeed = [
    { value: "1", label: "Speed 1 (Faster)" },
    { value: "2", label: "Speed 2" },
    { value: "3", label: "Speed 3" },
    { value: "4", label: "Speed 4" },
    { value: "5", label: "Speed 5" },
    { value: "6", label: "Speed 6 (Slower)" }
  ];

  // const getImagePath = (scene: ISceneSettings): string => {
  //   const getFileNameByBackgroundId = (scene: ISceneSettings): string | undefined => {
  //     const sceneBackgroundId = scene.backgrounds?.find(b => b.backgroundId)?.backgroundId;
  //     return backgrounds.find(b => !b._deleted && b.id === sceneBackgroundId)?.filename;
  //   }

  //   if (!scene.backgrounds) return imgPlaceholder;

  //   const response = getFileNameByBackgroundId(scene);
  //   if (scene.sceneType != "Logo" && scene.sceneType != "Point Click" && scene.backgrounds?.length > 1) {
  //     return response ? settingUtils.localImagePath + '/' + response : imgPlaceholder;
  //   }

  //   return response ? settingUtils.localImagePathHD + '/' + response : imgPlaceholder;
  // };

	return (
    <Content>
      <NumericEventInput value={args?.speed ?? FadeEvent.defaultValue().speed} min={1} max={6}
        onChange={speed => onValueChange(event?.id!, { ...event?.args, speed })}
        renderNumber={(speed, onChange) => <Select value={String(speed)} options={optSpeed} style={{ flex: 1, minWidth: 0 }} onChange={value => onChange(Number(value))} />}
      />
    </Content>
	);
}

FadeEvent.defaultValue = (): IFade => ({
  speed: 2,
});

export default FadeEvent;
