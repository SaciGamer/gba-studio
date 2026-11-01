import { INPUT_MAP_SCENE_TYPES, sceneInputActions, resolveSceneInputMap } from '../../../../shared/inputMap';
import { WarningField } from './WarningIndicator';
import { hasAssetReferenceWarning } from '../../../../shared/events/sceneReferenceCleanup';
import { useI18n } from '@/i18n/I18n';
import DirectionRadioGroup from './DirectionRadioGroup';
import { MOVEMENT_SPEED_OPTIONS, ANIMATION_SPEED_OPTIONS } from '@/utils/movementSpeedOptions';
import SceneLayersThumbnail from './SceneLayersThumbnail';
import useAppContexts from "@/providers/contexts/AppContexts";
import { IProjectSettings } from "@/providers/contexts/interfaces/IProjectElement";
import { ISceneSettings } from "@/providers/contexts/interfaces/ISceneElement";
import { IMainSettings } from "@/providers/contexts/interfaces/ISettingElement";
import { CaretDownFilled, CaretLeftFilled, CaretRightFilled, CaretUpFilled } from "@ant-design/icons";
import { Button, Checkbox, Divider, Flex, Form, Input, Radio, Select, Space, theme, Typography } from "antd";
import StepInputNumber, { InputNumber } from './StepInputNumber';
import { Content } from "antd/es/layout/layout";
import React, { useEffect, useState } from "react";

// TODO: Restore these imports with the custom logical-action editor.
// import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
const { useToken } = theme;

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

const INPUT_BUTTON_OPTIONS = ['A', 'B', 'L', 'R', 'START', 'SELECT', 'UP', 'DOWN', 'LEFT', 'RIGHT']
  .map(button => ({ value: button, label: button }));

export const InputMapEditor: React.FC<{
  settings: IMainSettings;
  setSettings: React.Dispatch<React.SetStateAction<IMainSettings>>;
}> = ({ settings, setSettings }) => {
  const { t } = useI18n();
  const [sceneType, setSceneType] = useState<string>('Top Down');
  const inputMap = resolveSceneInputMap(sceneType, settings.inputMapsBySceneType, settings.inputMap);
  // TODO: Resume custom logical actions when their editor workflow is ready.
  // const [newAction, setNewAction] = useState('');
  const updateMap = (nextMap: Record<string, string[]>) => {
    setSettings(previous => ({ ...previous, inputMapsBySceneType: { ...previous.inputMapsBySceneType, [sceneType]: Object.fromEntries(sceneInputActions(sceneType).map(action => [action, nextMap[action]])) }, _saved: false }));
  };
  const updateAction = (action: string, buttons: string[]) => {
    updateMap({ ...inputMap, [action]: buttons });
  };
  // TODO: Resume creation/removal of custom actions. Standard actions are fixed.
//   const addAction = () => {
//     const action = newAction.trim();
//     if (!/^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(action) || INPUT_BUTTON_OPTIONS.some(option => option.value === action) || inputMap[action] || Object.keys(inputMap).length >= 32) return;
//     updateMap({ ...inputMap, [action]: ['A'] });
//     setNewAction('');
//   };
//   const removeAction = (action: string) => {
//     const nextMap = { ...inputMap };
//     delete nextMap[action];
//     updateMap(nextMap);
//   };
  return <Space direction="vertical" style={{ width: '100%' }}>
    <Typography.Title level={5} style={{ margin: 0 }}>{t('controls.map')}</Typography.Title>
    <Typography.Text type="secondary">{t('controls.description')}</Typography.Text>
    {/* TODO: Resume the New action input and Add button.
    <Space.Compact style={{ width: '100%' }}>
      <Input aria-label="New logical input action" placeholder="New action (e.g. fire_special)" value={newAction}
        onChange={event => setNewAction(event.target.value)} onPressEnter={addAction} />
      <Button aria-label="Add logical input action" icon={<PlusOutlined />} onClick={addAction} />
    </Space.Compact>
    */}
    <Select aria-label={t('controls.sceneType')} value={sceneType} onChange={setSceneType} size="small" style={{ width: '100%' }} options={INPUT_MAP_SCENE_TYPES.map(type => ({ value: type, label: type }))} />
    {sceneInputActions(sceneType).map(action => (
      <Flex key={action} align="center" gap={8}>
        <Typography.Text style={{ flex: 1, minWidth: 0 }}>{t(`controls.action.${action}`)}</Typography.Text>
        <Select aria-label={t(`controls.action.${action}`)} size="small" mode="multiple" style={{ width: 180, maxWidth: '55%' }} value={inputMap[action]}
          options={INPUT_BUTTON_OPTIONS.map(option => ({ ...option, disabled: inputMap[action].length === 1 && inputMap[action][0] === option.value }))}
          onChange={next => { if (next.length) updateAction(action, next); }} maxCount={8} maxTagCount="responsive" />
        {/* TODO: Resume removing custom actions.
        <Button aria-label={`Remove logical input action ${action}`} icon={<DeleteOutlined />} type="text" danger onClick={() => removeAction(action)} />
        */}
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
  const { t } = useI18n();
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
    <Form.Item label="Projectile sprite" validateStatus={hasAssetReferenceWarning(config, 'projectileSpriteId') ? 'warning' : undefined} style={{ marginBottom: 8 }}>
      <WarningField warning={hasAssetReferenceWarning(config, 'projectileSpriteId')} message={t('events.missingReference')}>
      <Input status={hasAssetReferenceWarning(config, 'projectileSpriteId') ? 'warning' : undefined} aria-label="Shooter projectile sprite" value={config.projectileSpriteId ?? ''} placeholder="bullet" onChange={event => setSettings(previous => ({ ...previous, shooterConfig: { ...(previous.shooterConfig ?? {}), projectileSpriteId: event.target.value }, _saved: false }))} />
      </WarningField>
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
    scenes, spriteResources,
  } = useAppContexts();
  const [positionSnap, setPositionSnap] = useState<8 | 16>(8);
  useEffect(() => {
    let active = true;
    const apply = (preferences: any) => setPositionSnap(preferences?.sceneObjectSnapSize === 16 ? 16 : 8);
    void window.electronAPI.loadPreferences?.().then(preferences => { if (active) apply(preferences); });
    const changed = (event: Event) => apply((event as CustomEvent).detail);
    window.addEventListener('gba-studio:game-world-preferences', changed);
    return () => { active = false; window.removeEventListener('gba-studio:game-world-preferences', changed); };
  }, []);
  const positionBounds = (scene: ISceneSettings | undefined, axis: 'width' | 'height') => {
    const sprite = spriteResources.find(item => item.id === settings.playerSpriteId);
    const size = Number(axis === 'width' ? sprite?.playerFrameWidth ?? 16 : sprite?.playerFrameHeight ?? 16);
    const origin = Number(axis === 'width' ? sprite?.playerCanvasOriginX ?? 0 : sprite?.playerCanvasOriginY ?? 8);
    const min = origin / 16;
    const max = (Math.max(0, (scene?.[axis] ?? 240) - size) + origin) / 16;
    return { min, max };
  };
  const optionsMoveSpeed = MOVEMENT_SPEED_OPTIONS;
  const customSpeed = customSpeedRequested || !optionsMoveSpeed.some(option => option.value === settings?.startMoveSpeed);
  const optionsAnimSpeed = ANIMATION_SPEED_OPTIONS;

  const clampPlayerPosition = (settings: IMainSettings, scene: ISceneSettings) => {
    const maxX = positionBounds(scene, 'width').max;
    const maxY = positionBounds(scene, 'height').max;

    return {
      ...settings,
      startX: Math.max(positionBounds(scene, 'width').min, Math.min(settings.startX, maxX)),
      startY: Math.max(positionBounds(scene, 'height').min, Math.min(settings.startY, maxY)),
    };
  }

  const handleValuesChange = (changedValues: Partial<IMainSettings>, allValues: IMainSettings) => {
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

        const normalizedSettings = { ...settings };



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

  function getSceneMax(startSceneId: string, maxDefault: number, axis: 'width' | 'height') {
    const scene = scenes.find(s => s.id === startSceneId);
    return scene ? positionBounds(scene, axis).max : maxDefault;
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
                  scene={scene}
                  alt={scene.name}
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
                  scene={scene}
                  alt={scene.name}
                />
                <span>{scene.name}</span>
              </span>
            );
          }}
          style={{ width: '100%', height: 40 }}
        >
        </Select>
      </Form.Item>
      
      {/* More Settings */}
      <Space style={{ display: "flex", justifyContent: "flex-end", alignItems: "center" }}>
        <Button type="default" onClick={handleMoreSettings}>
          More Settings
        </Button>
      </Space>

      <Divider style={{ margin: `${token.margin}px 0` }} />

      {/* Direction */}
      <Form.Item name="startDirection" label="Direction">
        <DirectionRadioGroup buttonStyle="solid" style={{ width: '100%', display: "flex" }}>
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
        </DirectionRadioGroup>
      </Form.Item>
      
      {/* Start Position */}
      <Typography.Paragraph >Start Position</Typography.Paragraph>
      <Flex gap={8}>
        <Form.Item name={"startX"} noStyle style={{ flex: 1, minWidth: 0 }}>
          <InputNumber addonBefore="X" step={positionSnap / 16} min={positionBounds(scenes.find(scene => scene.id === settings.startSceneId), 'width').min} max={getSceneMax(settings.startSceneId, 15, 'width')} style={{ width: '100%' }}/>
        </Form.Item>
        <Form.Item name={"startY"} noStyle style={{ flex: 1, minWidth: 0 }}>
          <InputNumber addonBefore="Y" step={positionSnap / 16} min={positionBounds(scenes.find(scene => scene.id === settings.startSceneId), 'height').min} max={getSceneMax(settings.startSceneId, 10, 'height')} style={{ width: '100%' }}/>
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
