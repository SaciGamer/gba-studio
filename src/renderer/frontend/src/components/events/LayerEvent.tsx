import { Button, Dropdown, Flex, Form, Segmented, Select, Space, Switch, Tabs, Typography } from "antd";
import StepInputNumber, { InputNumber } from '../StepInputNumber';
import { IChangeBackgroundArgs, ILayerOptions, ILayerMovement, LayerMultiProps, MultiLayers } from "./interfaces/ILayer";
import { ETypeScene, IArgs, IScriptsElement } from "@/providers/contexts/interfaces/ISceneElement";
import { Content } from "antd/es/layout/layout";
import Title from "antd/lib/typography/Title";
import { AntdToken } from "../common/AntDToken";
import useAppContexts from "@/providers/contexts/AppContexts";
import { CurrentBackgroundThumbnail } from './BackgroundEvents';
import { useEffect } from 'react';

function changeLayer(layerId: number, options: ILayerOptions) {
  console.log(`Changing Layer ${layerId}`, options);
  // Aqui você pode integrar com o sistema de cenas ou engine
  // Exemplo: atualizar estado global ou enviar comando para o compilador
}

function moveLayer(layerId: number, movement: ILayerMovement) {
  console.log(`Moving Layer ${layerId}`, movement);
  // Integração futura: aplicar scroll, offset ou velocidade
}

interface LayerEventProps {
  event: IScriptsElement | undefined;
  onValueChange: (eventId: string, eventArgs: IArgs) => void;
}

export function ChangeLayerEvent({ event, onValueChange }: LayerEventProps) {
	const { elementSelected, backgrounds, settingUtils } = useAppContexts();
	const args = event?.args as IChangeBackgroundArgs;
	const isHDScene = elementSelected?.sceneType === ETypeScene.LOGO || elementSelected?.sceneType === ETypeScene.POINTNCLICK;
	const layerId = isHDScene ? 2 : args?.layerId ?? 0;
	const selectableBackgrounds = backgrounds.filter(background => !background._deleted && background.hd === isHDScene);
	const update = (changes: Partial<IChangeBackgroundArgs>) => onValueChange(event?.id!, { ...args, layerId, backgroundId: args?.backgroundId ?? null, ...changes });

	useEffect(() => {
		if (!event?.id || typeof args?.backgroundId !== 'string' || selectableBackgrounds.some(background => background.id === args.backgroundId)) return;
		onValueChange(event.id, { ...args, layerId, backgroundId: null } as IArgs);
	}, [args, event?.id, layerId, onValueChange, selectableBackgrounds]);

	return <Form layout="vertical">
		<Form.Item label="Current background">
			<Segmented
				value={layerId}
				onChange={(value) => update({ layerId: value as number })}
				options={(isHDScene ? [2] : [0, 1, 2, 3]).map(value => ({ value, label: `Layer ${value}` }))}
			/>
		</Form.Item>
		<CurrentBackgroundThumbnail eventId={event?.id} layerId={layerId} />
		<Form.Item label="Change to">
			<Select
				placeholder="No Background"
				value={args?.backgroundId ?? null}
				onChange={(backgroundId) => update({ backgroundId: backgroundId ?? null })}
				style={{ height: 40 }}
				options={[{ value: null, label: 'No Background' }, ...selectableBackgrounds.map(background => ({
					value: background.id,
					label: <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 36, lineHeight: 1 }}><img src={`${background.hd ? settingUtils.localImagePathHD : settingUtils.localImagePath}/${background.filename}`} alt="" style={{ display: 'block', flex: '0 0 36px', width: 36, height: 24, objectFit: 'cover', imageRendering: 'pixelated' }} />{background.name}</span>,
				}))]}
			/>
		</Form.Item>
	</Form>;
}

export function MoveLayerEvent({ event, onValueChange }: LayerEventProps) {
	const { token } = AntdToken();
	const args = event?.args as LayerMultiProps;
    
  return (
    <Form layout="vertical">
			<Typography.Text>
				Layer Move {args.layerId}
      </Typography.Text>

      {/* Move Layer */}
      <Flex style={{ flex: 1, textAlign: 'left' }}>
        <Form.Item label="X" style={{ flex: 1 }}>
					<Space.Compact block>
						<Button icon={'#'} style={{ backgroundColor: token.colorBgBase }}/>
						<InputNumber
							defaultValue={0}
							placeholder="X"
							style={{ flex: 1, textAlign: 'left' }} 
        onChange={(x) => moveLayer(args.layerId, { x: x ?? undefined })}
						/>
					</Space.Compact>
				</Form.Item>

				<Form.Item label="Y" style={{ flex: 1, marginLeft: "10px"  }}>
					<Space.Compact block>
						
						<Button icon={'#'} style={{ backgroundColor: token.colorBgBase }}/>
						<InputNumber
							defaultValue={0}
							placeholder="Y"
							style={{ flex: 1, textAlign: 'left' }} 
        onChange={(y) => moveLayer(args.layerId, { y: y ?? undefined })}
						/>
					</Space.Compact>
				</Form.Item>
      </Flex>

			<Flex>
				<Form.Item label="SpeedX" style={{ flex: 1 }}>
					<Space.Compact block>
						<Button icon={'#'} style={{ backgroundColor: token.colorBgBase }}/>
						<InputNumber
							defaultValue={0}
							placeholder="SpeedX"
							style={{ flex: 1, textAlign: 'left' }} 
        onChange={(speedX) => moveLayer(args.layerId, { speedX: speedX ?? undefined })}
						/>
					</Space.Compact>
				</Form.Item>

				<Form.Item label="SpeedY" style={{ flex: 1, marginLeft: "10px"  }}>
					<Space.Compact block>
						
						<Button icon={'#'} style={{ backgroundColor: token.colorBgBase }}/>
						<InputNumber
							defaultValue={0}
							placeholder="SpeedY"
							style={{ flex: 1, textAlign: 'left' }} 
        onChange={(speedY) => moveLayer(args.layerId, { speedY: speedY ?? undefined })}
						/>
					</Space.Compact>
				</Form.Item>
			</Flex>

    </Form>
  );
}
