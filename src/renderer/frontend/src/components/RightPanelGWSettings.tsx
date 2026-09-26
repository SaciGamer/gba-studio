import imgPlaceholder from '@/img/placeholder.png';
import { joinLocalAssetPath } from '@/utils/localAssetUrl';
import { loadPaletteTransparentImage } from '@/utils/paletteTransparency';
import useAppContexts from "@/providers/contexts/AppContexts";
import { IProjectSettings } from "@/providers/contexts/interfaces/IProjectElement";
import { ISceneSettings } from "@/providers/contexts/interfaces/ISceneElement";
import { EColorMode, IMainSettings } from "@/providers/contexts/interfaces/ISettingElement";
import { CaretDownFilled, CaretLeftFilled, CaretRightFilled, CaretUpFilled } from "@ant-design/icons";
import { Button, Checkbox, Divider, Flex, Form, Input, Radio, Select, Space, theme, Typography } from "antd";
import StepInputNumber, { InputNumber } from './StepInputNumber';
import { Content } from "antd/es/layout/layout";
import React, { useEffect, useMemo, useState } from "react";

const { useToken } = theme;

interface SceneBackgroundLayer {
  key: string;
  path: string;
  width: number;
  height: number;
  x: number;
  y: number;
}

const SceneLayersThumbnail: React.FC<{
  layers: SceneBackgroundLayer[];
  alt: string;
  canvasWidth: number;
  canvasHeight: number;
}> = ({ layers, alt, canvasWidth, canvasHeight }) => {
  const [transparentSources, setTransparentSources] = useState<Record<string, string>>({});
  const layerSignature = useMemo(() => layers.map(layer => `${layer.key}:${layer.path}`).join('|'), [layers]);
  const cropX = 0;
  const cropY = 0;

  useEffect(() => {
    let cancelled = false;
    Promise.all(layers.map(async layer => {
      const image = await loadPaletteTransparentImage(layer.path);
      return [layer.key, image?.toDataURL() ?? layer.path] as const;
    })).then(entries => {
      if (!cancelled) setTransparentSources(Object.fromEntries(entries));
    });
    return () => { cancelled = true; };
  }, [layerSignature]);

  return (
    <span
      role="img"
      aria-label={alt}
      style={{
        position: 'relative',
        display: 'block',
        boxSizing: 'border-box',
        width: 36,
        height: 24,
        flex: '0 0 36px',
        overflow: 'hidden',
        verticalAlign: 'middle',
        background: '#111',
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: 240,
          height: 160,
          overflow: 'hidden',
          transform: 'scale(0.15)',
          transformOrigin: 'top left',
        }}
      >
        {layers.length > 0 ? layers.map(layer => (
          <img
            key={layer.key}
            src={transparentSources[layer.key] ?? layer.path}
            alt=""
            style={{
              position: 'absolute',
              top: layer.y - cropY,
              left: layer.x - cropX,
              display: 'block',
              imageRendering: 'pixelated',
            }}
          />
        )) : (
          <img src={imgPlaceholder} alt="" style={{ display: 'block', width: 240, height: 160, objectFit: 'cover' }} />
        )}
      </span>
    </span>
  );
};

const UserSettingsForm: React.FC = () => {
  const [form] = Form.useForm();
  const { token } = useToken();
  // const [loading, setLoading] = useState(true);
  const { project, setProject } = useAppContexts();

  // useEffect(() => {
  //   // Load settings when component mounts
  //   const loadLocalSettings = async () => {
  //     try {
  //       console.log('..: ProjectSettingsForm loaded:', project);
  //       setLoading(project ? false : true);
  //     } catch (error) {
  //       console.error('..: Erro loading UserSettingsForm:', error);
  //       setLoading(false);
  //     }
  //   };

  //   loadLocalSettings();
  // }, [project!]);

  const handleBasicValuesChange = async (changedValues: Partial<IProjectSettings>, allValues: IProjectSettings) => {
    try {
      setProject({ ...project, ...allValues, _saved: false });
      // const updatedSettings = await window.electronAPI.updateSettings('project', project);
      // console.log('..: Settings updated:', updatedSettings);
    } catch (error) {
      console.error('..: Error updating settings:', error);
    }
  };

  // if (loading) {
  //   return <Spin />;
  // }

  return (
    <Form
      form={form}
      layout="vertical"
      initialValues={project!}
      onValuesChange={handleBasicValuesChange}
    >
      {/* Project Name */}
      <Form.Item name="name" >
        <Input
          onFocus={(e) => {
            e.currentTarget.style.backgroundColor = "";
            e.currentTarget.style.border = '';
            e.currentTarget.style.boxShadow = "";
          }}
          onBlur={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
            e.currentTarget.style.border = 'solid 1px transparent';
            e.currentTarget.style.boxShadow = "transparent";
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.border = '';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.border = 'solid 1px transparent';
          }}
          style={{ fontSize: token.fontSizeHeading5, fontWeight: 'bold', backgroundColor: "transparent", border: 'solid 1px transparent', boxShadow: "transparent" }}
        />
      </Form.Item>

      <Divider style={{ margin: `${token.margin}px 0` }} />

      {/* Author */}
      <Form.Item name="author" label="Author">
        <Input />
      </Form.Item>

      <Divider style={{ margin: `${token.margin}px 0` }} />      
    </Form>
  );
};

interface IGameSettingsForm {
  controllerView: (value: number) => void
}

const GameSettingsForm: React.FC<IGameSettingsForm> = ({ controllerView }) => {
  const { token } = useToken();
  const [form] = Form.useForm();
  // const [loading, setLoading] = useState(true);
  const [customSpeed, setCustomSpeed] = useState(true);
  const [animDropDownOpen, setAnimDropdownOpen] = useState(false);
  const [moveDropdownOpen, setMoveDropdownOpen] = useState(false);

  const { 
    settings, setSettings,
    scenes, backgrounds, settingUtils,
  } = useAppContexts();
  const optionsMoveSpeed = [
    { value: 0.25, label: "Speed ¼ (Slower)", ppf: "0.25 PPF" },
    { value: 0.5, label: "Speed ½", ppf: "0.5 PPF" },
    { value: 1, label: "Speed 1", ppf: "1 PPF" },
    { value: 2, label: "Speed 2", ppf: "2 PPF" },
    { value: 3, label: "Speed 3", ppf: "3 PPF" },
    { value: 4, label: "Speed 4 (Faster)", ppf: "4 PPF" },
  ];
  const optionsAnimSpeed = [
    { value: 0, label: "None", fps: "0" },
    { value: 1, label: "Speed 1 (Slower)", fps: "0.47 FPS" },
    { value: 2, label: "Speed 2", fps: "0.94 FPS" },
    { value: 3, label: "Speed 3", fps: "1.88 FPS" },
    { value: 4, label: "Speed 4", fps: "3.75 FPS" },
    { value: 5, label: "Speed 5", fps: "7.5 FPS" },
    { value: 6, label: "Speed 6", fps: "15 FPS" },
    { value: 7, label: "Speed 7", fps: "30 FPS" },
    { value: 8, label: "Speed 8 (Faster)", fps: "60 FPS" },
  ];

  const clampPlayerPosition = (settings: IMainSettings, scene: ISceneSettings) => {
    const maxX = Math.floor(scene.width / 16) - 2;
    const maxY = Math.floor(scene.height / 16) - 2;

    return {
      ...settings,
      startX: Math.max(0, Math.min(settings.startX, maxX)),
      startY: Math.max(0, Math.min(settings.startY, maxY)),
    };
  }

  const handleValuesChange = (changedValues: Partial<IMainSettings>, allValues: IMainSettings) => {
    if ('colorMode' in changedValues) {
      const updatedColorMode = changedValues.colorMode
        ? EColorMode.Mixed
        : EColorMode.Mono;

      allValues.colorMode = updatedColorMode;

      console.log("..: Updated Color Mode Enum:", updatedColorMode);
    }

    if ('startSceneId' in changedValues) {
      allValues = clampPlayerPosition(allValues, scenes.find(s => s.id === changedValues.startSceneId)!);
    }

    console.log("..: Settings Alterações:", changedValues);
    console.log("..: Settings Valores atuais:", allValues);

    // window.electronAPI.updateSettings('settings', allValues);
    setSettings({ ...settings, ...allValues, _saved: false });
  };

  const handleCustomUpdate = (newValues: any) => {
    form.setFieldsValue(newValues); // Define os valores no formulário

    // Aciona manualmente o onValuesChange
    const allValues = form.getFieldsValue(); // Obtém todos os valores atuais do formulário
    handleValuesChange(newValues, allValues); // Substitua 'onValuesChange' pelo nome da sua função
  };

  const handleMoreSettings = () => {
    console.log("Navigating to another tab for more settings...");
    controllerView(9);
  };

  useEffect(() => {
    // Load settings when component mounts
    const loadLocalSettings = async () => {
      try {
        console.log('..: UserSettingsForm loaded: ', settings);

        // Converter colorMode para boolean
        const transformedSettings = {
          ...settings,
          colorMode: settings?.colorMode === 'mixed',
        };

        setCustomSpeed(!optionsMoveSpeed.map((values) => values.value).includes(transformedSettings?.startMoveSpeed as number));

        const normalizedSettings = {
          ...transformedSettings,
        };

        console.log('..: GameSettingsForm customSpeed %s, convertendo colorModo após loading: ', customSpeed, normalizedSettings);

        form.setFieldsValue(normalizedSettings);
        // setLoading(settings ? false : true);
      } catch (error) {
        console.error('..: Erro loading UserSettingsForm:', error);
        // setLoading(false);
      }
    };

    loadLocalSettings();
  }, [form, settings]);

  // if (loading) {
  //   return <Spin />;
  // }

  const getSceneBackgroundLayers = (scene: ISceneSettings) => (
    [...(scene.backgrounds ?? [])]
      .sort((left, right) => left.layerId - right.layerId)
      .flatMap(layer => {
        const background = backgrounds.find(item => !item._deleted && item.id === layer.backgroundId);
        if (!background) return [];

        return [{
          key: `${layer.layerId}-${background.id}`,
          path: joinLocalAssetPath(
            background.hd ? settingUtils.localImagePathHD : settingUtils.localImagePath,
            background.filename,
          ),
          width: background.imageWidth,
          height: background.imageHeight,
          x: Number(layer.x) || 0,
          y: Number(layer.y) || 0,
        }];
      })
  );

  function getSceneMax(startSceneId: string, maxDefault: number) {
    const scene = scenes.find(s => s.id === startSceneId);
    return scene ? (scene.width / 16) - 2 : maxDefault;
  }

  return (
    <Form
      form={form}
      layout="vertical"
      initialValues={settings}
      onValuesChange={handleValuesChange} // Captura mudanças em tempo real
    >
      <Form.Item name="startSceneId" label="Starting Scene" style={{ flex: 1, textAlign: 'center' }}>
        <Select
          showSearch
          optionFilterProp="label"
          placeholder="Select Starting Scene"
          // value={scenes.filter(sf => !sf._deleted && sf.id === settings.startSceneId) ?? null }
          options={scenes.filter(sf => !sf._deleted).map(scene => ({
            value: scene.id, // ID único da cena
            label: (
              <span style={{ display: 'inline-flex', width: '100%', minHeight: 36, alignItems: 'center', justifyContent: 'flex-start', gap: 8, lineHeight: 1 }}>
                <SceneLayersThumbnail
                  layers={getSceneBackgroundLayers(scene)}
                  alt={scene.name}
                  canvasWidth={Math.max(240, scene.width || 0)}
                  canvasHeight={Math.max(160, scene.height || 0)}
                />
                <span>{scene.name}</span>
              </span>
            ),
          }))}
          style={{ width: '100%', height: 40 }}
        >
        </Select>
      </Form.Item>
      
      {/* Checkbox and More Settings */}
      <Space style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Form.Item name="colorMode" valuePropName="checked" style={{ marginBottom: 0 }}>
          <Checkbox>
            Enable Color Mode
          </Checkbox>
        </Form.Item>
        <Button type="default" onClick={handleMoreSettings}>
          More Settings
        </Button>
      </Space>

      <Divider style={{ margin: `${token.margin}px 0` }} />

      {/* Direction */}
      <Form.Item name="startDirection" label="Direction">
        <Radio.Group buttonStyle="solid" style={{ width: '100%', display: "flex" }}>
          <Radio.Button value="left" style={{ flex: 1, textAlign: 'center' }}>
            <CaretLeftFilled />
          </Radio.Button>
          <Radio.Button value="up" style={{ flex: 1, textAlign: 'center' }}>
            <CaretUpFilled />
          </Radio.Button>
          <Radio.Button value="down" style={{ flex: 1, textAlign: 'center' }}>
            <CaretDownFilled />
          </Radio.Button>
          <Radio.Button value="right" style={{ flex: 1, textAlign: 'center' }}>
            <CaretRightFilled />
          </Radio.Button>
        </Radio.Group>
      </Form.Item>
      
      {/* Start Position */}
      <Typography.Paragraph >Start Position</Typography.Paragraph>
      <Flex >
        <Space.Compact style={{ flex: 1 }}>
          <Space.Addon>X</Space.Addon>
          <Form.Item name={"startX"} noStyle>
            <InputNumber min={0} max={getSceneMax(settings.startSceneId, 15)} style={{ flex: 1 }}/>
          </Form.Item>
        </Space.Compact>

        <Space.Compact style={{ flex: 1, marginLeft: '10px' }}>
          <Space.Addon>Y</Space.Addon>
          <Form.Item name={"startY"} noStyle>
            <InputNumber min={0} max={getSceneMax(settings.startSceneId, 10)} style={{ flex: 1 }}/>
          </Form.Item>
        </Space.Compact>
      </Flex>

      <Divider style={{ margin: `${token.margin}px 0` }} />

      <Space.Compact block>
        {/* Movement Speed - Dynamic */}
        {customSpeed ? (
          <Form.Item label="Movement Speed" style={{ flex: 1, textAlign: 'center' }}>
            <InputNumber
              style={{ width: '100%' }}
              min={0.00}
              max={10.0}
              step={0.0625}
              placeholder="Pixels Per Frame..."
              value={form.getFieldValue("startMoveSpeed") || 0}
              formatter={(formatterValue) => formatterValue ? `${parseFloat(formatterValue)}` : ''}
              parser={displayValue => displayValue?.replace(/[^0-9.]/g, "")}
              onChange={(changeValue) => {
                if (isNaN(changeValue) || changeValue === "" || changeValue <= 0.00) {
                  form.setFieldsValue({
                    startMoveSpeed: ''
                  });
                } else {
                  form.setFieldsValue({
                    startMoveSpeed: changeValue
                  });
                }

                console.log("Custom moviment speed:", form.getFieldValue("startMoveSpeed"));
              }}
              onBlur={() => {
                console.log('..: form.item onBlur moveSpeed:', form.getFieldValue("startMoveSpeed"));
                const value = form.getFieldValue("startMoveSpeed");
                if (isNaN(value) || value === "" || value <= 0) {
                  handleCustomUpdate({ startMoveSpeed: 1 });
                  setCustomSpeed(false);
                }
              }}
            />
          </Form.Item>
        ) :
          (
            <Form.Item name="startMoveSpeed" label="Movement Speed" style={{ flex: 1, textAlign: 'center' }}>
              <Select
                onChange={(value) => {
                  const isCustom = value.toString().startsWith("customSpeed");
                  if (isCustom) {
                    const customValue = parseFloat(value.split("_")[1]);
                    console.log("..: Custom movement speed selection start: %s, com valor: %s", value, customValue);

                    form.setFieldsValue({
                      startMoveSpeed: customValue,
                    });

                    handleCustomUpdate({ startMoveSpeed: customValue });
                    setCustomSpeed(isCustom);
                  } else {
                    handleCustomUpdate({ startMoveSpeed: value });
                    setCustomSpeed(isCustom);
                  }
                }}
                onOpenChange={(open) => {
                  console.log('..: Abriu drop de Movement: ', open);
                  setMoveDropdownOpen(open);
                }}
                showSearch
                optionFilterProp="label"
              >
                {optionsMoveSpeed.map((option) => (
                  <Select.Option key={option.value} value={option.value} label={`${option.label} ${option.ppf}`}>
                    <span style={{ display: "flex", justifyContent: "space-between" }}>
                      {option.label} { moveDropdownOpen && ( <span style={{ opacity: 0.6, marginLeft: "8px" }}>{option.ppf}</span> ) }
                    </span>
                  </Select.Option>
                ))}
                <Select.Option value={`customSpeed_${form.getFieldValue("startMoveSpeed")}`} label={'Custom Speed'} >Custom Speed</Select.Option>
              </Select>
            </Form.Item>
          )}
        {/* Animation Speed */}
        <Form.Item name="startAnimSpeed" label="Animation Speed" style={{ flex: 1, textAlign: 'center', marginLeft: "10px" }}>
          <Select
            showSearch
            optionFilterProp="label"
            onOpenChange={(open) => {
              console.log('..: Abriu drop de animation: ', open);
              setAnimDropdownOpen(open);
            }}
          >
            {optionsAnimSpeed.map((option) => (
              <Select.Option key={option.value} value={option.value} label={`${option.label} ${option.fps}`}>
                <span style={{ display: "flex", justifyContent: "space-between" }}>
                  {option.label} { animDropDownOpen && (<span style={{ opacity: 0.6, marginLeft: "8px" }}>{option.fps}</span>) }
                </span>
              </Select.Option>
            ))}
          </Select>
        </Form.Item>
      </Space.Compact>
    </Form>
  );

};

const RightPanelGWSettings = ({ controllerView: updateView }: { controllerView: (value: number) => void }) => {
  return (
    <Space direction={'vertical'} style={{ width: "100%" }}>
      <UserSettingsForm />
      <GameSettingsForm controllerView={updateView} />
    </Space>
  );
};

export default RightPanelGWSettings;
