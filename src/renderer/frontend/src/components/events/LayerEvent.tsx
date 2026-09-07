import { Button, Dropdown, Flex, Form, InputNumber, Select, Space, Switch, Tabs, Typography } from "antd";
import { ILayerOptions, ILayerMovement, LayerMultiProps, MultiLayers } from "./interfaces/ILayer";
import { ETypeScene, IScriptsElement } from "@/providers/contexts/interfaces/ISceneElement";
import { Content } from "antd/es/layout/layout";
import Title from "antd/lib/typography/Title";
import { AntdToken } from "../common/AntDToken";
import { BackgroundSelector } from "../BackgroundSelector";
import useAppContexts from "@/providers/contexts/AppContexts";
import { useEffect, useState } from "react";

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
  onValueChange: (eventId: string, eventArgs: MultiLayers) => void;
}

export function ChangeLayerEvent({ event, onValueChange }: LayerEventProps) {
	let args = event?.args as MultiLayers;
	const { elementSelected } = useAppContexts();
	const [backgroundLayers, setBackgroundLayers] = useState<LayerMultiProps[]>(ChangeLayerEvent.defaultValue);
	const [activeLayerKey, setActiveLayerKey] = useState("2");

	if (!args.layers) {
		args.layers = backgroundLayers;
	} else {
		// setBackgroundLayers(args.layers);
	}

	const handleUpdateBackground  = (layerId: number, newBackgroundId: string | null) => {
		console.log(`handleUpdateBackground Layer ${layerId}`, newBackgroundId);

		setBackgroundLayers(prev =>
			prev.map(layer => layer.layerId === layerId ? { ...layer, backgroundId: newBackgroundId } : layer)
		);

		const updatedLayers: MultiLayers = { layers: args.layers.map(layer =>
			layer.layerId === layerId ? { ...layer, backgroundId: newBackgroundId } : layer
		)};

		onValueChange(event?.id!, { ...event?.args, ...updatedLayers })
	}

	const visibiliteLayer = (layerId: number, options: ILayerOptions) => {
		console.log(`visibiliteLayer ${layerId}`, options);
		
		setBackgroundLayers(prev =>
			prev.map(layer => layer.layerId === layerId ? { ...layer, ...options } : layer)
		);

		const updatedLayers: MultiLayers = { layers: args.layers.map(layer =>
			layer.layerId === layerId ? { ...layer, ...options } : layer
		)};

		onValueChange(event?.id!, { ...event?.args, ...updatedLayers })
	}

  return (
    <Space direction="vertical" style={{ display: "flex" }}>
			<Typography.Text>
				Layer Show
      </Typography.Text>
	  
      {/* Change Layer */}
	  	<Tabs
				activeKey={activeLayerKey}
				onChange={setActiveLayerKey}
				type="card"
				size={'small'}
				items={args.layers.map(bk => ({
					key: String(bk.layerId),
					label: `Layer ${bk.layerId}`,
					children: (
						<Flex style={{ flex: 1, textAlign: 'left' }}>
							  <Content>
									<Space style={{ marginBottom: 10 }}>
										<Content>Visible:</Content>
										<Switch
											title={'Visible'}
											// checkedChildren="Visible"
											// unCheckedChildren="Hidden"
											checked={bk.visible}
											onChange={(visible) => visibiliteLayer(bk.layerId, { visible })}
										/>
										</Space>
									<BackgroundSelector
										selectedElementId={elementSelected.id}
										layerKey={bk.layerId}
										backgroundId={bk.backgroundId}
										onUpdateBackground={handleUpdateBackground}
									/>
							 </Content>
						</Flex>
					),
					disabled: bk.layerId != 2 && elementSelected.sceneType === ETypeScene.LOGO || elementSelected.sceneType === ETypeScene.POINTNCLICK
				}))}
			/>
		
			
    </Space>
  );
}

ChangeLayerEvent.defaultValue = (): LayerMultiProps[] => (
	[
		{ layerId: 0, backgroundId: null, visible: true },
		{ layerId: 1, backgroundId: null, visible: true },
		{ layerId: 2, backgroundId: null, visible: true },
		{ layerId: 3, backgroundId: null, visible: true }
	]
);

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
							onChange={(x) => moveLayer(args.layerId, { x })}
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
							onChange={(y) => moveLayer(args.layerId, { y })}
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
							onChange={(speedX) => moveLayer(args.layerId, { speedX })}
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
							onChange={(speedY) => moveLayer(args.layerId, { speedY })}
						/>
					</Space.Compact>
				</Form.Item>
			</Flex>

    </Form>
  );
}
