import { IScriptsElement } from "@/providers/contexts/interfaces/ISceneElement";
import { Select } from "antd";
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
      <Select 
        defaultValue={`${args?.speed ?? FadeEvent.defaultValue().speed }`} 
        options={optSpeed} style={{ width: "100%" }} 
        onChange={(e) => onValueChange(event?.id!, { ...event?.args, speed: Number(e) })}
      />
    </Content>
	);
}

FadeEvent.defaultValue = (): IFade => ({
  speed: 2,
});

export default FadeEvent;