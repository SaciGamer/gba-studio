import imgPlaceholder from '@/img/placeholder.png';
import { useSceneContext, useSettingsUtilsContext } from "@/providers/contexts/AppContexts";
import { IArgs, ISceneSettings, IScriptsElement } from "@/providers/contexts/interfaces/ISceneElement";
import { Select } from "antd";
import { Content } from "antd/es/layout/layout";
import { IFade } from './interfaces/IFade';

interface FadeEventsProps {
  event: IScriptsElement | undefined;
  onValueChange: (eventId: string, eventArgs: IArgs) => void;
}

export function FadeEvent({ event, onValueChange }: FadeEventsProps) {
  const {scenes, setScenes} = useSceneContext();
  const {backgrounds, setBackgrounds} = useSceneContext();
  const {settingUtils, setSettingUtils} = useSettingsUtilsContext();

  const optSpeed = [
    { value: "1", label: "Speed 1 (Faster)" },
    { value: "2", label: "Speed 2" },
    { value: "3", label: "Speed 3" },
    { value: "4", label: "Speed 4" },
    { value: "5", label: "Speed 5" },
    { value: "6", label: "Speed 6 (Slower)" }
  ];

  const getImagePath = (scene: ISceneSettings): string => {
    const getFileNameByBackgroundId = (scene: ISceneSettings): string | undefined => {
      const sceneBackgroundId = scene.backgrounds?.find(b => b.backgroundId)?.backgroundId;
      return backgrounds.find(b => !b._deleted && b.id === sceneBackgroundId)?.filename;
    }

    if (!scene.backgrounds) return imgPlaceholder;

    const response = getFileNameByBackgroundId(scene);
    if (scene.sceneType != "Logo" && scene.sceneType != "Point Click" && scene.backgrounds?.length > 1) {
      return response ? settingUtils.localImagePath + '/' + response : imgPlaceholder;
    }

    return response ? settingUtils.localImagePathHD + '/' + response : imgPlaceholder;
  };

	return (
    <Content>
      <Select 
        defaultValue={`${event?.args?.speed ?? FadeEvent.defaultValue().speed }`} 
        options={optSpeed} style={{ width: "100%" }} 
        onChange={(e) => onValueChange(event?.id!, { speed: Number(e) })}
      />
    </Content>
	);
}

FadeEvent.defaultValue = (): IFade => ({
  speed: 2,
});

export default FadeEvent;