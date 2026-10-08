import imgPlaceholder from '@/img/placeholder.png';
import { joinLocalAssetPath } from '@/utils/localAssetUrl';
import useAppContexts from "@/providers/contexts/AppContexts";
import { ISceneSettings, IScriptsElement } from "@/providers/contexts/interfaces/ISceneElement";
import { CaretDownFilled, CaretLeftFilled, CaretRightFilled, CaretUpFilled } from "@ant-design/icons";
import { Flex, Form, Radio, Select, Space } from "antd";
import StepInputNumber, { InputNumber } from '../StepInputNumber';
import NumericEventInput from '../NumericEventInput';
import { normalizeNumericValue, formatNumericValue } from '../../../../../shared/numericValues';
import { Content } from 'antd/es/layout/layout';
import { useEffect, useMemo } from 'react';
import { IChangeScene } from './interfaces/IScene';

interface ChangeSceneEventProps {
  event: IScriptsElement | undefined;
  customTitle: (newTitle: string) => void;
  onValueChange: (eventId: string, eventArgs: IChangeScene) => void;
}

export function SceneEvent({ event, customTitle, onValueChange }: ChangeSceneEventProps) {
  // const {scenes} = useSceneContext();
  // const {backgrounds} = useSceneContext();
  // const {settingUtils} = useSettingsUtilsContext();
  const { scenes, backgrounds, settingUtils } = useAppContexts();
  const args = event?.args as IChangeScene;

  const optSpeed = [
    { value: 1, label: "Speed 1 (Faster)" },
    { value: 2, label: "Speed 2" },
    { value: 3, label: "Speed 3" },
    { value: 4, label: "Speed 4" },
    { value: 5, label: "Speed 5" },
    { value: 6, label: "Speed 6 (Slower)" }
  ];

  const getImagePath = (scene: ISceneSettings): string => {
    const getFileNameByBackgroundId = (scene: ISceneSettings): string | undefined => {
      const sceneBackgroundId = scene.backgrounds?.find(b => b.backgroundId)?.backgroundId;
      return backgrounds.find(b => !b._deleted && b.id === sceneBackgroundId)?.filename;
    }

    if (!scene.backgrounds) return imgPlaceholder;

    const response = getFileNameByBackgroundId(scene);
    const background = backgrounds.find(
      item => !item._deleted && item.filename === response,
    );
    const imagePath = background?.hd
      ? settingUtils.localImagePathHD
      : settingUtils.localImagePath;

    return response
      ? joinLocalAssetPath(imagePath, response)
      : imgPlaceholder;
  };

  const defaultValues = useMemo(() => {
    const initValue = SceneEvent.defaultValue(scenes);
    const scene = scenes.find(s => s.id === args?.sceneId && s._deleted !== true)
      ?? scenes.find(s => s.id === initValue.sceneId && s._deleted !== true);
    // const imagePath = getImagePath(scene!);
    const sceneName = scene?.name || 'Unknown Scene';

    return {
      sceneId: args?.sceneId ?? initValue.sceneId,
      sceneName: sceneName,
      // imagePath: imagePath,
      x: args?.x ?? initValue.x,
      y: args?.y ?? initValue.y,
      sceneWidth: scene?.width ?? 256,
      sceneHeight: scene?.height ?? 256,
      direction: args?.direction ?? initValue.direction,
      fadeSpeed: args?.fadeSpeed ?? initValue.fadeSpeed,
    };
  }, [event?.args, scenes]);

  const clampDestination = (value: number | null | undefined, limit: number) =>
    Math.max(0, Math.min(Math.max(0, Math.trunc(limit) - 1), Math.trunc(Number(value ?? 0))));

  const updateDestination = (field: 'x' | 'y', value: any) => {
    const limit = field === 'x' ? defaultValues.sceneWidth : defaultValues.sceneHeight;
    onValueChange(event?.id!, { ...event?.args as IChangeScene, [field]: value && typeof value === 'object' ? value : { type: 'number', value: clampDestination(value, limit) } });
  };

  const selectDestinationScene = (sceneId: string) => {
    const destination = scenes.find(scene => scene.id === sceneId && !scene._deleted);
    const width = destination?.width ?? 256;
    const height = destination?.height ?? 256;
    onValueChange(event?.id!, {
      ...event?.args as IChangeScene,
      sceneId,
      x: normalizeNumericValue(defaultValues.x).kind === 'number' ? { type: 'number', value: clampDestination((normalizeNumericValue(defaultValues.x) as { value: number }).value, width) } : defaultValues.x,
      y: normalizeNumericValue(defaultValues.y).kind === 'number' ? { type: 'number', value: clampDestination((normalizeNumericValue(defaultValues.y) as { value: number }).value, height) } : defaultValues.y,
    });
  };

  useEffect(() => {
    customTitle(` To ${defaultValues.sceneName} At {${formatNumericValue(defaultValues.x)},${formatNumericValue(defaultValues.y)}}`);
  }, [defaultValues.sceneName, defaultValues.x, defaultValues.y]);

	return (
    <Form layout="vertical">
      <Form.Item label={ "Change Scene" } style={{ flex: 1, textAlign: 'center' }}>
        <Select
          showSearch
          optionFilterProp="label"
          style={{ height: 40 }}
          options={scenes.filter(sf => !sf._deleted).map(scene => ({
            value: scene.id, // ID único da cena
            label: (
              <Content style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 8, minHeight: 36, lineHeight: 1 }}>
                <img
                  src={getImagePath(scene)}
                  alt=""
                  style={{ display: 'block', flex: '0 0 36px', width: 36, height: 24, objectFit: 'cover', imageRendering: 'pixelated' }}
                />
                <span>{scene.name}</span>
              </Content>
            ),
          }))}
          value={defaultValues.sceneId}
          onChange={selectDestinationScene}
        >
        </Select>
      </Form.Item>

      <Flex gap={8} style={{ width: '100%' }}>
        <Form.Item style={{ flex: 1, minWidth: 0 }}><NumericEventInput label="X" value={defaultValues.x} min={0} max={Math.max(0, defaultValues.sceneWidth - 1)} onChange={value => updateDestination('x', value)} /></Form.Item>
        <Form.Item style={{ flex: 1, minWidth: 0 }}><NumericEventInput label="Y" value={defaultValues.y} min={0} max={Math.max(0, defaultValues.sceneHeight - 1)} onChange={value => updateDestination('y', value)} /></Form.Item>
      </Flex>

      <Flex>
        <Form.Item label="Direction" >
          <Radio.Group 
            optionType="button" 
            buttonStyle="solid" 
            defaultValue={defaultValues.direction} 
            onChange={(e) => onValueChange(event?.id!, { ...event?.args as IChangeScene, direction: e.target.value })}
          >
              <Radio value="left" ><CaretLeftFilled /></Radio>
              <Radio value="right" ><CaretRightFilled /></Radio>
              <Radio value="up" ><CaretUpFilled /></Radio>
              <Radio value="down"><CaretDownFilled /></Radio>
          </Radio.Group>
        </Form.Item>
        <Form.Item label="Fade Speed"  style={{flex: 1, marginLeft: '10px' }}>
          <NumericEventInput value={defaultValues.fadeSpeed} min={1} max={6}
            onChange={fadeSpeed => onValueChange(event?.id!, { ...event?.args as IChangeScene, fadeSpeed })}
            renderNumber={(speed, onChange) => <Select showSearch value={speed} options={optSpeed} style={{ flex: 1, minWidth: 0 }} onChange={onChange} />}
          />
        </Form.Item>
      </Flex>
    </Form>
	
	);
}

SceneEvent.defaultValue = (scenes: ISceneSettings[]): IChangeScene => ({
  sceneId: scenes[0]?.id || null,
  x: { type: 'number', value: 0 },
  y: { type: 'number', value: 0 },
  direction: 'right',
  fadeSpeed: 2,
});

export default SceneEvent;
