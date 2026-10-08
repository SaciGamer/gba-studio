import { MOVEMENT_SPEED_OPTIONS, ANIMATION_SPEED_OPTIONS } from '@/utils/movementSpeedOptions';
import imgPlaceholder from '@/img/placeholder.png';
import { joinLocalAssetPath } from '@/utils/localAssetUrl';
import { loadPaletteTransparentImage } from '@/utils/paletteTransparency';
import useAppContexts from "@/providers/contexts/AppContexts";
import { IProjectSettings } from "@/providers/contexts/interfaces/IProjectElement";
import { ISceneSettings } from "@/providers/contexts/interfaces/ISceneElement";
import { EColorMode, IMainSettings } from "@/providers/contexts/interfaces/ISettingElement";
import { CaretDownFilled, CaretLeftFilled, CaretRightFilled, CaretUpFilled, DeleteOutlined, PlusOutlined } from "@ant-design/icons";
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
  cameraPosition?: ISceneSettings['cameraPosition'];
}> = ({ layers, alt, canvasWidth, canvasHeight, cameraPosition }) => {
  const [transparentSources, setTransparentSources] = useState<Record<string, string>>({});
  const layerSignature = useMemo(() => layers.map(layer => `${layer.key}:${layer.path}`).join('|'), [layers]);
  // Camera coordinates are the world-space top-left of the 240x160 view.
  const cropX = Number.isFinite(cameraPosition?.x) ? Number(cameraPosition!.x) : 0;
  const cropY = Number.isFinite(cameraPosition?.y) ? Number(cameraPosition!.y) : 0;

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

const DEFAULT_INPUT_MAP: Record<string, string[]> = {
  move_left: ['LEFT'], move_right: ['RIGHT'], move_up: ['UP'], move_down: ['DOWN'],
  confirm: ['A'], cancel: ['B'], shoot: ['B'], pause: ['START'], menu: ['SELECT'],
};
const INPUT_BUTTON_OPTIONS = ['A', 'B', 'L', 'R', 'START', 'SELECT', 'UP', 'DOWN', 'LEFT', 'RIGHT']
  .map(button => ({ value: button, label: button }));

export const InputMapEditor: React.FC<{
  settings: IMainSettings;
  setSettings: React.Dispatch<React.SetStateAction<IMainSettings>>;
}> = ({ settings, setSettings }) => {
  const inputMap = settings.inputMap ?? DEFAULT_INPUT_MAP;
  const [newAction, setNewAction] = useState('');
  const updateMap = (nextMap: Record<string, string[]>) => {
    setSettings(previous => ({ ...previous, inputMap: nextMap, _saved: false }));
  };
  const updateAction = (action: string, buttons: string[]) => {
    updateMap({ ...inputMap, [action]: buttons });
  };
  const addAction = () => {
    const action = newAction.trim();
    if (!/^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(action) || INPUT_BUTTON_OPTIONS.some(option => option.value === action) || inputMap[action] || Object.keys(inputMap).length >= 32) return;
    updateMap({ ...inputMap, [action]: ['A'] });
    setNewAction('');
  };
  const removeAction = (action: string) => {
    const nextMap = { ...inputMap };
    delete nextMap[action];
    updateMap(nextMap);
  };
  return <Space direction="vertical" style={{ width: '100%' }}>
    <Typography.Title level={5} style={{ margin: 0 }}>Controls</Typography.Title>
    <Typography.Text strong>Input Map</Typography.Text>
    <Typography.Text type="secondary">Project wide logical actions used by scenes, events, and shooter controls.</Typography.Text>
    <Space.Compact style={{ width: '100%' }}>
      <Input aria-label="New logical input action" placeholder="New action (e.g. fire_special)" value={newAction}
        onChange={event => setNewAction(event.target.value)} onPressEnter={addAction} />
      <Button aria-label="Add logical input action" icon={<PlusOutlined />} onClick={addAction} />
    </Space.Compact>
    {Object.entries(inputMap).map(([action, buttons]) => (
      <Flex key={action} align="center" gap={8}>
        <Typography.Text style={{ width: 110 }}>{action}</Typography.Text>
        <Select mode="multiple" style={{ flex: 1 }} value={buttons} options={INPUT_BUTTON_OPTIONS}
          onChange={next => updateAction(action, next)} maxTagCount="responsive" />
        <Button aria-label={`Remove logical input action ${action}`} icon={<DeleteOutlined />} type="text" danger onClick={() => removeAction(action)} />
      </Flex>
    ))}
  </Space>;
};

export const CombatConfigEditor: React.FC<{
  settings: IMainSettings;
  setSettings: React.Dispatch<React.SetStateAction<IMainSettings>>;
}> = ({ settings, setSettings }) => {
  const config = settings.combatConfig ?? {};
  const update = (field: keyof NonNullable<IMainSettings['combatConfig']>, value: number | null) => {
    setSettings(previous => ({
      ...previous,
      combatConfig: { ...(previous.combatConfig ?? {}), [field]: value ?? 0 },
      _saved: false,
    }));
  };
  const fields = [
    ['maxProjectiles', 'Projectiles', 128],
    ['maxEnemies', 'Enemies', 64],
    ['maxPickups', 'Pickups', 32],
    ['playerHitPoints', 'Player HP', 255],
    ['defaultDamage', 'Default Damage', 255],
  ] as const;
  return <Space direction="vertical" style={{ width: '100%' }}>
    <Typography.Text strong>Combat Config</Typography.Text>
    <Typography.Text type="secondary">Fixed runtime budgets used by combat kits; values are validated before the ROM build.</Typography.Text>
    <Flex wrap="wrap" gap={8}>
      {fields.map(([field, label, max]) => (
        <Flex key={field} vertical style={{ minWidth: 108, flex: '1 1 108px' }}>
          <Typography.Text type="secondary">{label}</Typography.Text>
          <InputNumber aria-label={label} min={0} max={max} value={config[field]} onChange={value => update(field, value)} />
        </Flex>
      ))}
    </Flex>
  </Space>;
};

export const ShooterConfigEditor: React.FC<{
  settings: IMainSettings;
  setSettings: React.Dispatch<React.SetStateAction<IMainSettings>>;
}> = ({ settings, setSettings }) => {
  const config = settings.shooterConfig ?? {};
  const updateNumber = (field: 'playerHitPoints' | 'defaultDamage' | 'bossHitPoints', value: number | null) => {
    setSettings(previous => ({ ...previous, shooterConfig: { ...(previous.shooterConfig ?? {}), [field]: value ?? 0 }, _saved: false }));
  };
  const updateWave = (defaultWaveId: string) => {
    setSettings(previous => ({ ...previous, shooterConfig: { ...(previous.shooterConfig ?? {}), defaultWaveId }, _saved: false }));
  };
  return <Space direction="vertical" style={{ width: '100%' }}>
    <Typography.Text strong>Shooter Config</Typography.Text>
    <Typography.Text type="secondary">Defaults used by the reusable shooter kit when a wave does not specify its own ID.</Typography.Text>
    <Form.Item label="Default wave" style={{ marginBottom: 8 }}>
      <Input aria-label="Default shooter wave" value={config.defaultWaveId ?? ''} placeholder="wave_01" onChange={event => updateWave(event.target.value)} />
    </Form.Item>
    <Form.Item label="Projectile sprite" style={{ marginBottom: 8 }}>
      <Input aria-label="Shooter projectile sprite" value={config.projectileSpriteId ?? ''} placeholder="bullet" onChange={event => setSettings(previous => ({ ...previous, shooterConfig: { ...(previous.shooterConfig ?? {}), projectileSpriteId: event.target.value }, _saved: false }))} />
    </Form.Item>
    <Flex wrap="wrap" gap={8}>
      <Flex vertical style={{ minWidth: 108, flex: '1 1 108px' }}>
        <Typography.Text type="secondary">Player HP</Typography.Text>
        <InputNumber aria-label="Shooter player HP" min={0} max={255} value={config.playerHitPoints} onChange={value => updateNumber('playerHitPoints', value)} />
      </Flex>
      <Flex vertical style={{ minWidth: 108, flex: '1 1 108px' }}>
        <Typography.Text type="secondary">Default Damage</Typography.Text>
        <InputNumber aria-label="Shooter default damage" min={0} max={255} value={config.defaultDamage} onChange={value => updateNumber('defaultDamage', value)} />
      </Flex>
      <Flex vertical style={{ minWidth: 108, flex: '1 1 108px' }}>
        <Typography.Text type="secondary">Boss HP</Typography.Text>
        <InputNumber aria-label="Shooter boss HP" min={1} max={65535} value={config.bossHitPoints} onChange={value => updateNumber('bossHitPoints', value)} />
      </Flex>
    </Flex>
  </Space>;
};

const GameSettingsForm: React.FC<IGameSettingsForm> = ({ controllerView }) => {
  const { token } = useToken();
  const [form] = Form.useForm();
  // const [loading, setLoading] = useState(true);
  const [customSpeedRequested, setCustomSpeed] = useState(false);
  const [animDropDownOpen, setAnimDropdownOpen] = useState(false);
  const [moveDropdownOpen, setMoveDropdownOpen] = useState(false);

  const { 
    settings, setSettings,
    scenes, backgrounds, settingUtils,
  } = useAppContexts();
  const optionsMoveSpeed = MOVEMENT_SPEED_OPTIONS;
  const customSpeed = customSpeedRequested || !optionsMoveSpeed.some(option => option.value === settings?.startMoveSpeed);
  const optionsAnimSpeed = ANIMATION_SPEED_OPTIONS;

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
    } else {
      allValues.colorMode = settings.colorMode;
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
    const allValues = { ...form.getFieldsValue(), ...newValues };
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
            label: scene.name,
            scene,
          }))}
          optionRender={option => {
            const scene = (option as any).data?.scene ?? scenes.find(item => item.id === option.value);
            if (!scene) return option.label;
            return (
              <span style={{ display: 'inline-flex', width: '100%', minHeight: 36, alignItems: 'center', justifyContent: 'flex-start', gap: 8, lineHeight: 1 }}>
                <SceneLayersThumbnail
                  layers={getSceneBackgroundLayers(scene)}
                  alt={scene.name}
                  canvasWidth={Math.max(240, scene.width || 0)}
                  canvasHeight={Math.max(160, scene.height || 0)}
                  cameraPosition={scene.cameraPosition}
                />
                <span>{scene.name}</span>
              </span>
            );
          }}
          labelRender={({ value, label }) => {
            const scene = scenes.find(item => item.id === String(value));
            if (!scene) return label;
            return (
              <span style={{ display: 'inline-flex', width: '100%', height: 40, boxSizing: 'border-box', alignItems: 'center', justifyContent: 'flex-start', gap: 8, lineHeight: 1, textAlign: 'left' }}>
                <SceneLayersThumbnail
                  layers={getSceneBackgroundLayers(scene)}
                  alt={scene.name}
                  canvasWidth={Math.max(240, scene.width || 0)}
                  canvasHeight={Math.max(160, scene.height || 0)}
                  cameraPosition={scene.cameraPosition}
                />
                <span>{scene.name}</span>
              </span>
            );
          }}
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
      <Flex gap={8}>
        <Form.Item name={"startX"} noStyle style={{ flex: 1, minWidth: 0 }}>
          <InputNumber addonBefore="X" min={0} max={getSceneMax(settings.startSceneId, 15)} style={{ width: '100%' }}/>
        </Form.Item>
        <Form.Item name={"startY"} noStyle style={{ flex: 1, minWidth: 0 }}>
          <InputNumber addonBefore="Y" min={0} max={getSceneMax(settings.startSceneId, 10)} style={{ width: '100%' }}/>
        </Form.Item>
      </Flex>

      <Divider style={{ margin: `${token.margin}px 0` }} />

      <Flex gap={8} align="flex-start">
        {/* Movement Speed - Dynamic */}
        {customSpeed ? (
          <Form.Item label="Movement Speed" style={{ flex: 1, minWidth: 0, textAlign: 'center', marginBottom: 0 }}>
            <InputNumber
              aria-label="Movement Speed"
              style={{ width: '100%' }}
              min={0.00}
              max={10.0}
              step={0.0625}
              placeholder="Pixels Per Frame..."
              value={settings.startMoveSpeed || 0}
              formatter={(formatterValue) => formatterValue ? `${parseFloat(formatterValue)}` : ''}
              parser={displayValue => displayValue?.replace(/[^0-9.]/g, "")}
              onChange={(changeValue) => {
                if (isNaN(changeValue) || changeValue === "" || changeValue <= 0.00) {
                  form.setFieldsValue({
                    startMoveSpeed: ''
                  });
                } else {
                  handleCustomUpdate({ startMoveSpeed: Number(changeValue) });
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
            <Form.Item label="Movement Speed" style={{ flex: 1, minWidth: 0, textAlign: 'center', marginBottom: 0 }}>
              <Select
                value={settings.startMoveSpeed ?? 1}
                aria-label="Movement Speed"
                onChange={(value) => {
                  if (value === 'customSpeed') {
                    form.setFieldsValue({ startMoveSpeed: settings.startMoveSpeed || 1 });
                    setCustomSpeed(true);
                  } else {
                    handleCustomUpdate({ startMoveSpeed: Number(value) });
                    setCustomSpeed(false);
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
                <Select.Option value="customSpeed" label={'Custom Speed'} >Custom Speed</Select.Option>
              </Select>
            </Form.Item>
          )}
        {/* Animation Speed */}
        <Form.Item name="startAnimSpeed" label="Animation Speed" style={{ flex: 1, minWidth: 0, textAlign: 'center', marginBottom: 0 }}>
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
      </Flex>

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
