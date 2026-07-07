import imgPlaceholder from '@/img/placeholder.png';
import useAppContexts from "@/providers/contexts/AppContexts";
import { ISceneSettings, IScriptsElement } from "@/providers/contexts/interfaces/ISceneElement";
import { CaretDownFilled, CaretLeftFilled, CaretRightFilled, CaretUpFilled } from "@ant-design/icons";
import { Button, Flex, Form, InputNumber, Radio, Select, Space } from "antd";
import { Content } from 'antd/es/layout/layout';
import { useMemo } from 'react';
import { AntdToken } from '../common/AntDToken';
import { IChangeScene } from './interfaces/IChangeScene';

interface ChangeSceneEventProps {
  event: IScriptsElement | undefined;
  customTitle: (newTitle: string) => void;
  onValueChange: (eventId: string, eventArgs: IChangeScene) => void;
}

export function ChangeSceneEvent({ event, customTitle, onValueChange }: ChangeSceneEventProps) {
  const { token } = AntdToken();
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
    if (scene.sceneType != "Logo" && scene.sceneType != "Point Click" && scene.backgrounds?.length > 1) {
      return response ? settingUtils.localImagePath + '/' + response : imgPlaceholder;
    }

    return response ? settingUtils.localImagePathHD + '/' + response : imgPlaceholder;
  };

  const defaultValues = useMemo(() => {
    const initValue = ChangeSceneEvent.defaultValue(scenes);
    const scene = scenes.find(s => s.id === (args?.sceneId || s.id === initValue.sceneId) && s._deleted !== true);
    // const imagePath = getImagePath(scene!);
    const sceneName = scene?.name || 'Unknown Scene';

    customTitle(` To ${sceneName} At {${args?.x?.value ?? initValue.x?.value},${args?.y?.value ?? initValue.y?.value}}`);

    return {
      sceneId: args?.sceneId ?? initValue.sceneId,
      sceneName: sceneName,
      // imagePath: imagePath,
      x: args?.x ?? initValue.x,
      y: args?.y ?? initValue.y,
      direction: args?.direction ?? initValue.direction,
      fadeSpeed: args?.fadeSpeed ?? initValue.fadeSpeed,
    };
  }, [event?.args, scenes]);

	return (
    <Form layout="vertical">
      <Form.Item name="scene" label={ "Change Scene" } style={{ flex: 1, textAlign: 'center' }}>
        <Select
          showSearch
          optionFilterProp="label"
          defaultValue={defaultValues.sceneId}
          options={scenes.filter(sf => !sf._deleted).map(scene => ({
            value: scene.id, // ID único da cena
            label: (
              <Content style={{ display: 'flex', alignItems: 'center' }}>
                  {/* <Image
                    preview={false}
                    src={getImagePath(scene)} // Caminho da imagem da miniatura
                    alt={scene.name} 
                    style={{ display: 'flex', alignItems: 'center', width: 24, height: 24, marginRight: 8 }}
                  /> */}
                  {scene.name} {/* Nome da cena */}
              </Content>
            ),
          }))}
          onChange={(value) => onValueChange(event?.id!, { ...event?.args, sceneId: value })}
        >
        </Select>
      </Form.Item>

      <Flex style={{ flex: 1, textAlign: 'center' }}>
        <Form.Item label="X" style={{ flex: 1 }}>
          <Space.Compact block>
            <Button icon={'#'} style={{ backgroundColor: token.colorBgBase }}/>
            {defaultValues.x?.type === 'number' && (
              <InputNumber 
                min={0} 
                defaultValue={defaultValues.x.value as number} 
                style={{ flex: 1, textAlign: 'center' }} 
                onChange={(value) => onValueChange(event?.id!, { ...event?.args, x: { type: 'number', value: value! } })}
              />
            )}
          </Space.Compact>
        </Form.Item>
        <Form.Item label="Y" style={{ flex: 1, marginLeft: "10px"  }}>
          <Space.Compact block>
            <Button icon={'#'} style={{ backgroundColor: token.colorBgBase }}/>
            {defaultValues.x?.type === 'number' && (
              <InputNumber 
                min={0} 
                defaultValue={defaultValues.y?.value as number} 
                style={{ flex: 1 }}
                onChange={(value) => onValueChange(event?.id!, { ...event?.args, y: { type: 'number', value: value! } })}
              />
            )}
          </Space.Compact>
        </Form.Item>
      </Flex>

      <Flex>
        <Form.Item label="Direction" >
          <Radio.Group 
            optionType="button" 
            buttonStyle="solid" 
            defaultValue={defaultValues.direction} 
            onChange={(e) => onValueChange(event?.id!, { ...event?.args, direction: e.target.value })}
          >
              <Radio value="left" ><CaretLeftFilled /></Radio>
              <Radio value="right" ><CaretRightFilled /></Radio>
              <Radio value="up" ><CaretUpFilled /></Radio>
              <Radio value="down"><CaretDownFilled /></Radio>
          </Radio.Group>
        </Form.Item>
        <Form.Item label="Fade Speed"  style={{flex: 1, marginLeft: '10px' }}>
          <Select
            showSearch
            defaultValue={defaultValues.fadeSpeed} 
            onChange={(value) => onValueChange(event?.id!, { ...event?.args, fadeSpeed: Number(value) })}
            options={optSpeed}
          />
        </Form.Item>
      </Flex>
    </Form>
	
	);
}

ChangeSceneEvent.defaultValue = (scenes: ISceneSettings[]): IChangeScene => ({
  sceneId: scenes[0]?.id || null,
  x: { type: 'number', value: 0 },
  y: { type: 'number', value: 0 },
  direction: 'right',
  fadeSpeed: 2,
});

export default ChangeSceneEvent;