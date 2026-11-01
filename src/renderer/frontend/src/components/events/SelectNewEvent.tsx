import { hasLocalVariableOwner } from '../../../../../shared/localVariables';
import { isActiveProjectEntry } from '../../../../../shared/projectCollectionEntries';
import useAppContexts from '@/providers/contexts/AppContexts';
import { reconcileSceneFadeIn } from '@/utils/createSceneFadeIn';
import { useScriptParameterVariables } from './ScriptParameterContext';
import { ETypeScene, IConditionValue, IScriptsElement } from '@/providers/contexts/interfaces/ISceneElement';
import { ArrowRightOutlined, BranchesOutlined, PlusSquareOutlined, StarFilled, StarOutlined } from '@ant-design/icons';
import { Button, Divider, Drawer, Empty, Flex, Input, InputRef, Menu, Space, Tooltip, Typography } from "antd";
import { Content } from 'antd/es/layout/layout';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { AntdToken } from '../common/AntDToken';
import DefaultValueEvents, { VariableEventPreset } from './DefaultValueEvents';
import FlowEditorManager, { ScriptKey } from './FlowEditorManager';
import { useI18n } from '@/i18n/I18n';
import { EEvents, EVENT_INFO, getEventLabel } from './interfaces/IEvents';
import { EVENT_CATALOG_BY_CODE, EVENT_CREATION_ALIASES } from '../../../../../shared/events/eventCatalog';

type MenuEventPreset = 'menu-dialogue' | 'menu-full-screen' | 'menu-left' | 'menu-right';
type EventPreset = VariableEventPreset | MenuEventPreset;
type EventOption = { id: EEvents; name: string; preset?: EventPreset };

const highlightText = (text: string, highlight: string) => {
  const { token } = AntdToken();

  if (!highlight.trim()) return text;
  const regex = new RegExp(`(${highlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  const parts = text.split(regex);
  return parts.map((part, index) => 
    regex.test(part) ? <Space key={index} style={{ color: token.colorPrimary/*, fontWeight: 'bold'*/ }}>{part}</Space> : part
  );
};

const FUNCTIONS_BY_CATEGORY: Record<string, Record<string, EventOption[]>> = {
  // Actor: {
  //   Movimento: [
  //     { id: EEvents.MOVE_ACTOR, name: EVENT_INFO[EEvents.MOVE_ACTOR].name }, 
  //     { id: EEvents.JUMP_ACTOR, name: EVENT_INFO[EEvents.JUMP_ACTOR].name }
  //   ],
  //   AparÃƒÂªncia: [
  //     { id: EEvents.CHANGE_SPRITE, name: EVENT_INFO[EEvents.CHANGE_SPRITE].name },
  //     { id: EEvents.CHANGE_COSTUME, name: EVENT_INFO[EEvents.CHANGE_COSTUME].name }
  //   ],
  // },
  // Camera: {
  //   BÃƒÂ¡sico: [
  //     { id: EEvents.PAN_CAMERA, name: EVENT_INFO[EEvents.PAN_CAMERA].name }, 
  //     { id: EEvents.ZOOM, name: EVENT_INFO[EEvents.ZOOM].name }
  //   ],
  //   AvanÃƒÂ§ado: [
  //     { id: EEvents.ROTATE_CAMERA, name: EVENT_INFO[EEvents.ROTATE_CAMERA].name }
  //   ],
  // },
  // Audio: {
    
  // },
  // "Dialogue & Menus": {

  // },
  Camera: {
    Position: [
      { id: EEvents.PAN_CAMERA, name: EVENT_INFO[EEvents.PAN_CAMERA].name },
      { id: EEvents.CAMERA_MOVE_TO, name: EVENT_INFO[EEvents.CAMERA_MOVE_TO].name },
      { id: EEvents.CAMERA_FOLLOW, name: EVENT_INFO[EEvents.CAMERA_FOLLOW].name },
      { id: EEvents.CAMERA_STOP_FOLLOW, name: EVENT_INFO[EEvents.CAMERA_STOP_FOLLOW].name },
      { id: EEvents.CAMERA_SHAKE, name: EVENT_INFO[EEvents.CAMERA_SHAKE].name },
    ],
  },
  Scene: {
    Triggers: [{ id: EEvents.TRIGGER_SET_ENABLED, name: EVENT_INFO[EEvents.TRIGGER_SET_ENABLED].name }],
    Scene: [
      { id: EEvents.CHANGE_SCENE, name: EVENT_INFO[EEvents.CHANGE_SCENE].name },
    ],
    "Background Layers": [
      { id: EEvents.CHANGE_LAYER, name: EVENT_INFO[EEvents.CHANGE_LAYER].name },
      { id: EEvents.VISIBLE_BACKGROUND, name: EVENT_INFO[EEvents.VISIBLE_BACKGROUND].name },
      { id: EEvents.BACKGROUND_SCROLL, name: EVENT_INFO[EEvents.BACKGROUND_SCROLL].name },
      { id: EEvents.BACKGROUND_SET_PARALLAX, name: EVENT_INFO[EEvents.BACKGROUND_SET_PARALLAX].name },
      { id: EEvents.BACKGROUND_ANIMATE, name: EVENT_INFO[EEvents.BACKGROUND_ANIMATE].name },
      { id: EEvents.BACKGROUND_SET_SCALE, name: EVENT_INFO[EEvents.BACKGROUND_SET_SCALE].name },
      { id: EEvents.BACKGROUND_SET_ROTATION, name: EVENT_INFO[EEvents.BACKGROUND_SET_ROTATION].name },
      { id: EEvents.BACKGROUND_SET_SHEAR, name: EVENT_INFO[EEvents.BACKGROUND_SET_SHEAR].name },
      { id: EEvents.CHANGE_PALETTE_BACKGROUND, name: EVENT_INFO[EEvents.CHANGE_PALETTE_BACKGROUND].name },
      { id: EEvents.CHANGE_DEFAULT_PALETTES, name: EVENT_INFO[EEvents.CHANGE_DEFAULT_PALETTES].name },
    ],
  },
  Actor: {
    Physics: [
      { id: EEvents.STOP_PHYSICS, name: EVENT_INFO[EEvents.STOP_PHYSICS].name },
      { id: EEvents.PHYSICS_SET_GRAVITY, name: EVENT_INFO[EEvents.PHYSICS_SET_GRAVITY].name },
      { id: EEvents.PHYSICS_SET_JUMP_SPEED, name: EVENT_INFO[EEvents.PHYSICS_SET_JUMP_SPEED].name },
      { id: EEvents.PHYSICS_SET_MAX_FALL_SPEED, name: EVENT_INFO[EEvents.PHYSICS_SET_MAX_FALL_SPEED].name },
      { id: EEvents.PHYSICS_SET_AIR_JUMPS, name: EVENT_INFO[EEvents.PHYSICS_SET_AIR_JUMPS].name },
      { id: EEvents.PHYSICS_SET_DIAGONAL, name: EVENT_INFO[EEvents.PHYSICS_SET_DIAGONAL].name },
      { id: EEvents.PHYSICS_RESET, name: EVENT_INFO[EEvents.PHYSICS_RESET].name },
      { id: EEvents.APPLY_VERTICAL_IMPULSE, name: EVENT_INFO[EEvents.APPLY_VERTICAL_IMPULSE].name },
    ],
    "Actor Functions": [
      { id: EEvents.IF_ACTOR_FACING, name: EVENT_INFO[EEvents.IF_ACTOR_FACING].name },
      { id: EEvents.SPAWN_ACTOR, name: EVENT_INFO[EEvents.SPAWN_ACTOR].name },
      { id: EEvents.MOVE_ACTOR, name: EVENT_INFO[EEvents.MOVE_ACTOR].name },
      { id: EEvents.ACTOR_MOVE_TO, name: EVENT_INFO[EEvents.ACTOR_MOVE_TO].name },
      { id: EEvents.ACTOR_SET_POSITION, name: EVENT_INFO[EEvents.ACTOR_SET_POSITION].name },
      { id: EEvents.REMOVE_ACTOR, name: EVENT_INFO[EEvents.REMOVE_ACTOR].name },
    ],
    Visibility: [
      { id: EEvents.HIDE_ACTOR, name: EVENT_INFO[EEvents.HIDE_ACTOR].name },
      { id: EEvents.HIDE_ALL_SPRITES, name: EVENT_INFO[EEvents.HIDE_ALL_SPRITES].name },
      { id: EEvents.SHOW_ACTOR, name: EVENT_INFO[EEvents.SHOW_ACTOR].name },
      { id: EEvents.ACTOR_SET_VISIBLE, name: EVENT_INFO[EEvents.ACTOR_SET_VISIBLE].name },
      { id: EEvents.SHOW_ALL_SPRITES, name: EVENT_INFO[EEvents.SHOW_ALL_SPRITES].name },
    ],
    Animation: [
      { id: EEvents.SHOW_EMOTE, name: EVENT_INFO[EEvents.SHOW_EMOTE].name },
      { id: EEvents.SET_ANIMATION_SPEED, name: EVENT_INFO[EEvents.SET_ANIMATION_SPEED].name },
      { id: EEvents.ACTOR_SET_DIRECTION, name: EVENT_INFO[EEvents.ACTOR_SET_DIRECTION].name },
      { id: EEvents.ACTOR_SET_STATE, name: EVENT_INFO[EEvents.ACTOR_SET_STATE].name },
      { id: EEvents.ACTOR_SET_ANIMATION, name: EVENT_INFO[EEvents.ACTOR_SET_ANIMATION].name },
      { id: EEvents.SET_ACTOR_PRIORITY, name: EVENT_INFO[EEvents.SET_ACTOR_PRIORITY].name },
      { id: EEvents.ACTOR_SET_ROTATION, name: EVENT_INFO[EEvents.ACTOR_SET_ROTATION].name },
      { id: EEvents.ACTOR_SET_SCALE, name: EVENT_INFO[EEvents.ACTOR_SET_SCALE].name },
      { id: EEvents.ACTOR_SET_TINT, name: EVENT_INFO[EEvents.ACTOR_SET_TINT].name },
      { id: EEvents.ACTOR_SET_SATURATION, name: EVENT_INFO[EEvents.ACTOR_SET_SATURATION].name },
      { id: EEvents.ACTOR_SET_BRIGHTNESS, name: EVENT_INFO[EEvents.ACTOR_SET_BRIGHTNESS].name },
      { id: EEvents.ACTOR_SET_OPACITY, name: EVENT_INFO[EEvents.ACTOR_SET_OPACITY].name },
    ],
  },
  'Save Data': { Game: [
    { id: EEvents.VARIABLES_SAVE, name: EVENT_INFO[EEvents.VARIABLES_SAVE].name },
    { id: EEvents.VARIABLES_LOAD, name: EVENT_INFO[EEvents.VARIABLES_LOAD].name },
    { id: EEvents.SAVE_WRITE, name: EVENT_INFO[EEvents.SAVE_WRITE].name },
    { id: EEvents.SAVE_LOAD, name: EVENT_INFO[EEvents.SAVE_LOAD].name },
    { id: EEvents.SAVE_REMOVE, name: EVENT_INFO[EEvents.SAVE_REMOVE].name },
  ] },
  Screen: {
    Rumble: [
      { id: EEvents.RUMBLE, name: EVENT_INFO[EEvents.RUMBLE].name },
    ],
    "H-Blank Effects": [
      { id: EEvents.HBE_EFFECT_ENABLE, name: EVENT_INFO[EEvents.HBE_EFFECT_ENABLE].name },
      { id: EEvents.HBE_EFFECT_DISABLE, name: EVENT_INFO[EEvents.HBE_EFFECT_DISABLE].name },
    ],
    Transparency: [
      { id: EEvents.BLEND_ALPHA, name: EVENT_INFO[EEvents.BLEND_ALPHA].name },
    ],
    Fade: [
      { id: EEvents.FADE_IN, name: EVENT_INFO[EEvents.FADE_IN].name },
      { id: EEvents.FADE_OUT, name: EVENT_INFO[EEvents.FADE_OUT].name },
      { id: EEvents.FADE_OPTIONS, name: EVENT_INFO[EEvents.FADE_OPTIONS].name },
    ],
  },
  UI: {
    Text: [
      { id: EEvents.UI_SET_TEXT, name: EVENT_INFO[EEvents.UI_SET_TEXT].name },
      { id: EEvents.UI_SET_VALUE, name: EVENT_INFO[EEvents.UI_SET_VALUE].name },
      { id: EEvents.UI_ANIMATE, name: EVENT_INFO[EEvents.UI_ANIMATE].name },
      { id: EEvents.UI_ANIMATION_STOP, name: EVENT_INFO[EEvents.UI_ANIMATION_STOP].name },
      { id: EEvents.UI_HIDE, name: EVENT_INFO[EEvents.UI_HIDE].name },
      { id: EEvents.UI_SHOW, name: EVENT_INFO[EEvents.UI_SHOW].name },
      { id: EEvents.UI_DESTROY, name: EVENT_INFO[EEvents.UI_DESTROY].name },

    ],
  },
  Audio: {
    Music: [
      { id: EEvents.PLAY_MUSIC, name: EVENT_INFO[EEvents.PLAY_MUSIC].name },
      { id: EEvents.MUSIC_PLAY_JINGLE, name: EVENT_INFO[EEvents.MUSIC_PLAY_JINGLE].name },
      { id: EEvents.STOP_MUSIC, name: EVENT_INFO[EEvents.STOP_MUSIC].name },
      { id: EEvents.SET_MUSIC_VOLUME, name: EVENT_INFO[EEvents.SET_MUSIC_VOLUME].name },
      { id: EEvents.MUSIC_RESUME, name: EVENT_INFO[EEvents.MUSIC_RESUME].name },
      { id: EEvents.MUSIC_PAUSE, name: EVENT_INFO[EEvents.MUSIC_PAUSE].name },
      { id: EEvents.MUSIC_FADE, name: EVENT_INFO[EEvents.MUSIC_FADE].name },
    ],
    Sound: [
      { id: EEvents.PLAY_SOUND, name: EVENT_INFO[EEvents.PLAY_SOUND].name },
      { id: EEvents.SOUND_STOP, name: EVENT_INFO[EEvents.SOUND_STOP].name },
    ],
  },
  // TODO(restore-shooter-events): uncomment this category to make Shooter events selectable again.
  /* Shooter: {
    Session: [
      { id: EEvents.SHOOTER_START, name: EVENT_INFO[EEvents.SHOOTER_START].name },
      { id: EEvents.SHOOTER_LOAD_STAGE, name: EVENT_INFO[EEvents.SHOOTER_LOAD_STAGE].name },
      { id: EEvents.SHOOTER_SET_BACKGROUND_MODE, name: EVENT_INFO[EEvents.SHOOTER_SET_BACKGROUND_MODE].name },
      { id: EEvents.SHOOTER_PAUSE, name: EVENT_INFO[EEvents.SHOOTER_PAUSE].name },
      { id: EEvents.SHOOTER_STOP, name: EVENT_INFO[EEvents.SHOOTER_STOP].name },
      { id: EEvents.SHOOTER_CLEAR_ENEMIES, name: EVENT_INFO[EEvents.SHOOTER_CLEAR_ENEMIES].name },
      { id: EEvents.SHOOTER_SPAWN_BOSS, name: EVENT_INFO[EEvents.SHOOTER_SPAWN_BOSS].name },
      { id: EEvents.SHOOTER_SET_BOSS_PHASE, name: EVENT_INFO[EEvents.SHOOTER_SET_BOSS_PHASE].name },
      { id: EEvents.SHOOTER_WAIT_SIGNAL, name: EVENT_INFO[EEvents.SHOOTER_WAIT_SIGNAL].name },
      { id: EEvents.SHOOTER_GRANT, name: EVENT_INFO[EEvents.SHOOTER_GRANT].name },
      { id: EEvents.SHOOTER_SET_STAT, name: EVENT_INFO[EEvents.SHOOTER_SET_STAT].name },
      { id: EEvents.SHOOTER_ADD_STAT, name: EVENT_INFO[EEvents.SHOOTER_ADD_STAT].name },
      { id: EEvents.SHOOTER_SET_PLAYER_ENABLED, name: EVENT_INFO[EEvents.SHOOTER_SET_PLAYER_ENABLED].name },
    ],
  }, */
  Dialogue: {
    Dialogue: [
      { id: EEvents.DISPLAY_DIALOGUE, name: EVENT_INFO[EEvents.DISPLAY_DIALOGUE].name },
      { id: EEvents.HIDE_DIALOGUE, name: EVENT_INFO[EEvents.HIDE_DIALOGUE].name },
      { id: EEvents.TEXT_SCROLL, name: EVENT_INFO[EEvents.TEXT_SCROLL].name },
    ],
    Menus: [
      ...(['dialogue', 'full-screen', 'left', 'right'] as const).map(position => ({ id: EEvents.MENU_OPEN, name: '', preset: `menu-${position}` as MenuEventPreset })),
    ],
  },
  "Joypad Input": {
    Buttons: [
      { id: EEvents.RUN_BUTTON_ACTION, name: EVENT_INFO[EEvents.RUN_BUTTON_ACTION].name },
      { id: EEvents.WAIT_FOR_BUTTON, name: EVENT_INFO[EEvents.WAIT_FOR_BUTTON].name },
      { id: EEvents.REMOVE_BUTTON_SCRIPT, name: EVENT_INFO[EEvents.REMOVE_BUTTON_SCRIPT].name },
      { id: EEvents.PAUSE_UNTIL_BUTTON_PRESSED, name: EVENT_INFO[EEvents.PAUSE_UNTIL_BUTTON_PRESSED].name },
      { id: EEvents.WAIT_INPUT, name: EVENT_INFO[EEvents.WAIT_INPUT].name },
      { id: EEvents.IF_BUTTON_HELD, name: EVENT_INFO[EEvents.IF_BUTTON_HELD].name },
      { id: EEvents.INPUT_ENABLE, name: EVENT_INFO[EEvents.INPUT_ENABLE].name },
      { id: EEvents.INPUT_DISABLE, name: EVENT_INFO[EEvents.INPUT_DISABLE].name },
    ],
  },
  Timer: {
    "Wait": [
      { id: EEvents.WAIT, name: EVENT_INFO[EEvents.WAIT].name },
    ]
  },
  Scripts: {
    Script: [
      { id: EEvents.CALL_SCRIPT, name: EVENT_INFO[EEvents.CALL_SCRIPT].name },
      { id: EEvents.FOR, name: EVENT_INFO[EEvents.FOR].name },
      { id: EEvents.BREAK, name: EVENT_INFO[EEvents.BREAK].name },
      { id: EEvents.CONTINUE, name: EVENT_INFO[EEvents.CONTINUE].name },
    ],
    "Control Flow": [
      { id: EEvents.IF, name: EVENT_INFO[EEvents.IF].name },
      { id: EEvents.SWITCH, name: EVENT_INFO[EEvents.SWITCH].name },
      { id: EEvents.WHILE, name: EVENT_INFO[EEvents.WHILE].name },
    ],
  },
  Variables: {
    Assignment: [
      { id: EEvents.VARIABLE, name: 'Variable Set to Value', preset: 'value' },
      { id: EEvents.DISPLAY_VARIABLE_TEXT, name: EVENT_INFO[EEvents.DISPLAY_VARIABLE_TEXT].name },
    ],
    Boolean: [
      { id: EEvents.VARIABLE, name: 'Variable Set to False', preset: 'false' },
      { id: EEvents.VARIABLE, name: 'Variable Set to True', preset: 'true' },
    ],
    Reset: [
      { id: EEvents.LOCAL_VARIABLE_RESET, name: EVENT_INFO[EEvents.LOCAL_VARIABLE_RESET].name },
    { id: EEvents.VARIABLE_RESET_ALL, name: EVENT_INFO[EEvents.VARIABLE_RESET_ALL].name },
    ],
  }
};

const CATEGORIES = Object.keys(FUNCTIONS_BY_CATEGORY);

const CATEGORY_KEYS: Record<string, string> = { Camera: 'camera', Scene: 'scene', Actor: 'actor', 'Save Data': 'save', Screen: 'screen', UI: 'ui', Audio: 'audio', Shooter: 'shooter', Dialogue: 'dialogue', 'Joypad Input': 'input', Timer: 'timer', Scripts: 'scripts', Variables: 'variables' };
const GROUP_KEYS: Record<string, string> = { Triggers: 'triggers', Rumble: 'rumble', Position: 'position', Scene: 'scene', 'Background Layers': 'backgrounds', Physics: 'physics', 'Actor Functions': 'actors', Visibility: 'visibility', Animation: 'animation', Game: 'game', 'H-Blank Effects': 'hblank', Transparency: 'transparency', Fade: 'fade', Text: 'text', Music: 'music', Sound: 'sound', Session: 'session', Dialogue: 'dialogue', Menus: 'menus', Buttons: 'buttons', Wait: 'wait', Script: 'script', 'Control Flow': 'flow', Assignment: 'assignment', Boolean: 'boolean', Reset: 'reset' };

function EventOptionHelp({ eventId, label, children }: { eventId: string; label: string; children: React.ReactElement }) {
  const { t } = useI18n();
  const { token } = AntdToken();
  return <Tooltip placement="left" mouseEnterDelay={0.7} mouseLeaveDelay={0.1} trigger={['hover', 'focus']}
    color={token.colorBgElevated} overlayStyle={{ maxWidth: 360 }}
    title={<div style={{ color: token.colorText, overflowWrap: 'anywhere' }}><strong>{eventId}: {label}</strong><div style={{ marginTop: 4 }}>{t(`events.description.${eventId}`)}</div></div>}>
    {children}
  </Tooltip>;
}

interface EventMenuItemProps {
  eventId: EEvents;
  preset?: EventPreset;
  isFavorite: boolean;
  onToggleFavorite: (id: EEvents) => void;
  onSelect: () => void;
  searchTerm?: string;
  disabled?: boolean;
}

const optionLabel = (eventId: EEvents, preset: EventPreset | undefined, t: (key: string) => string) => {
  if (eventId === EEvents.MENU_OPEN && preset?.startsWith('menu-')) return t(`events.menu.preset.${preset.slice(5)}`);
  if (eventId === EEvents.VARIABLE && (preset === 'true' || preset === 'false')) {
    return t(`events.variable.set${preset === 'true' ? 'True' : 'False'}`);
  }
  const key = `events.picker.label.${eventId}`;
  const label = t(key);
  return label !== key ? label : getEventLabel(eventId, t);
};

const EventMenuItem: React.FC<EventMenuItemProps> = ({ eventId, preset, isFavorite, onToggleFavorite, onSelect, searchTerm, disabled }) => {
  const { t } = useI18n();
  const label = optionLabel(eventId, preset, t);
  return (
  <Menu.Item key={`${eventId}:${preset ?? 'default'}`} aria-label={label} onClick={onSelect} disabled={disabled}>
    <EventOptionHelp eventId={eventId} label={label}>
    <Space style={{ width: "100%", justifyContent: "space-between", pointerEvents: 'auto' }}>
      <Typography.Text>{searchTerm ? highlightText(label, searchTerm) : label}</Typography.Text>
      <Button
        aria-label={t(isFavorite ? 'events.picker.favoriteRemove' : 'events.picker.favoriteAdd', { event: label })}
        aria-pressed={isFavorite}
        icon={isFavorite ? <StarFilled /> : <StarOutlined />}
        type="text"
        onClick={(e) => { e.stopPropagation(); onToggleFavorite(eventId); }}
      />
    </Space>
    </EventOptionHelp>
  </Menu.Item>
);
};

interface ISelectEventProps {
  tabIndex?: string;
  subTabIndex?: string;
  showFlowButton?: boolean;
  compact?: boolean;
  onEventCreated?: (event: IScriptsElement) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
  isEventAllowed?: (command: string) => boolean;
  caseValueType?: 'number' | 'string' | 'boolean';
}

const SelectNewEvent: React.FC<ISelectEventProps> = ({ tabIndex, subTabIndex, showFlowButton = true, compact = false, onEventCreated, open: controlledOpen, onOpenChange, hideTrigger = false, isEventAllowed: parentEventAllowed, caseValueType }) => {
  const { t } = useI18n();
  const categoryLabel = (category: string) => CATEGORY_KEYS[category] ? t(`events.picker.category.${CATEGORY_KEYS[category]}`) : category;
  // const { scenes, setScenes, ignoredFields } = useSceneContext();
  // const { settingUtils, setSettingUtils } = useSettingsUtilsContext();
  // const { elementSelected, setElementSelected } = useElementContext();

  const { scenes, variables: globalVariables, setScenes, setSettingUtils, elementSelected, setElementSelected, userSettings, setUserSettings } = useAppContexts();
  const localOwnerAvailable = hasLocalVariableOwner(useAppContexts());
  const isEventAllowed = (code: string) => (code !== EEvents.LOCAL_VARIABLE_RESET || localOwnerAvailable) && (!parentEventAllowed || parentEventAllowed(code as EEvents));
  const parameters = useScriptParameterVariables();
  const variables = { variables: [...parameters, ...globalVariables.variables].filter(isActiveProjectEntry) };
  
  const favoriteEvents = [...new Set((userSettings.favoriteEvents || []).map(code => (EVENT_CREATION_ALIASES[code] ?? code) as EEvents))].filter(code => code !== EEvents.SPRITE_EFFECT);
  
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (next: boolean) => { setInternalOpen(next); onOpenChange?.(next); };
  const [flowOpen, setFlowOpen] = useState(false);
  const [subOpen, setSubOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const searchInputRef = useRef<InputRef>(null);

  const scriptTypes = [
    { key: '1', value: elementSelected?.script, has: !!(elementSelected?.script?.length > 0) },
    { key: 'playerHit1Script', value: elementSelected?.playerHit1Script, has: !!(elementSelected?.playerHit1Script?.length > 0) },
    { key: 'playerHit2Script', value: elementSelected?.playerHit2Script, has: !!(elementSelected?.playerHit2Script?.length > 0) },
    { key: 'playerHit3Script', value: elementSelected?.playerHit3Script, has: !!(elementSelected?.playerHit3Script?.length > 0) },
  ];

  const shouldShowEmpty = 
    (tabIndex === '1' && !scriptTypes[0].has) ||
    (subTabIndex === 'playerHit1Script' && !scriptTypes[1].has) ||
    (subTabIndex === 'playerHit2Script' && !scriptTypes[2].has) ||
    (subTabIndex === 'playerHit3Script' && !scriptTypes[3].has);

  const toggleFavorite = useCallback((eventId: EEvents) => {
    const isFavorite = favoriteEvents.includes(eventId);
    
    const newFavorites = isFavorite
      ? favoriteEvents.filter(id => id !== eventId)
      : [...favoriteEvents, eventId];

    setUserSettings(prev => ({ ...prev, favoriteEvents: newFavorites, _saved: false }));
    // window.electronAPI.saveFavoriteEvents(newFavorites);
  }, [favoriteEvents, setSettingUtils]);

  const filteredEventsList = useMemo(() => {
    if (!searchTerm) return [];
    const results: EventOption[] = [];
    
    Object.values(FUNCTIONS_BY_CATEGORY).forEach(category => {
      Object.values(category).forEach(subCategory => {
        subCategory.forEach(event => {
          if (`${optionLabel(event.id, event.preset, t)} ${event.name} ${event.id}`.toLowerCase().includes(searchTerm.toLowerCase())) {
            results.push(event);
          }
        });
      });
    });
    
    return results.sort((a, b) => optionLabel(a.id, a.preset, t).localeCompare(optionLabel(b.id, b.preset, t)));
  }, [searchTerm, t]);

  const handleClose = (eventCode: string, variablePreset: EventPreset = 'value') => {
    eventCode = EVENT_CREATION_ALIASES[eventCode] ?? eventCode;
    if (isEventAllowed && !isEventAllowed(eventCode)) return;
    const firstVariableValue = (): IConditionValue => {
      const variable = variables.variables[0];
      return variable
        ? { kind: 'variable', variableId: variable.id, symbol: variable.symbol, type: variable.type }
        : { kind: 'literal', type: 'number', value: 0 };
    };

    // Criar um elemento de script vÃƒÂ¡lido
    const defaultArgs = eventCode === 'EVENT_SWITCH_CASE'
      ? { value: { kind: 'literal', type: caseValueType ?? 'number', value: caseValueType === 'string' ? '' : caseValueType === 'boolean' ? false : 0 } }
      : [EEvents.IF, EEvents.WHILE].includes(eventCode as EEvents)
      ? { left: firstVariableValue(), operator: '==', right: firstVariableValue() }
      : eventCode === EEvents.SWITCH ? { value: firstVariableValue() }
      : DefaultValueEvents(eventCode, scenes, ['value', 'false', 'true'].includes(variablePreset) ? variablePreset as VariableEventPreset : 'value');
    if (eventCode === EEvents.MENU_OPEN && variablePreset.startsWith('menu-') && defaultArgs) {
      (defaultArgs as Record<string, unknown>).position = variablePreset.slice(5);
      (defaultArgs as Record<string, unknown>).columns = 1;
    }
    const isSingleLayerScene = elementSelected?.sceneType === ETypeScene.LOGO || elementSelected?.sceneType === ETypeScene.POINTNCLICK;
    if (isSingleLayerScene && [EEvents.CHANGE_LAYER, EEvents.VISIBLE_BACKGROUND, EEvents.CHANGE_PALETTE_BACKGROUND, EEvents.HBE_EFFECT_ENABLE].includes(eventCode as EEvents) && defaultArgs) {
      (defaultArgs as { layerId?: number }).layerId = 2;
    }
    if (eventCode === EEvents.CAMERA_MOVE_TO) eventCode = EEvents.PAN_CAMERA;
    if (eventCode === EEvents.ACTOR_MOVE_TO) eventCode = EEvents.MOVE_ACTOR;
    const newScript: IScriptsElement = {
      id: uuidv4(),
      version: EVENT_CATALOG_BY_CODE[eventCode]?.version ?? 1,
      command: eventCode,
      args: defaultArgs,
      ...([EEvents.IF, EEvents.WHILE, EEvents.FOR, EEvents.WAIT_FOR_BUTTON].includes(eventCode as EEvents) ? { children: { then: [] } } : {}),
      ...(eventCode === EEvents.SWITCH ? { children: { then: [{ id: uuidv4(), command: 'EVENT_SWITCH_CASE', args: { value: { kind: 'literal', type: firstVariableValue().type, value: firstVariableValue().type === 'number' ? 0 : firstVariableValue().type === 'boolean' ? false : '' } }, children: { then: [] } }], else: [] } } : {}),
      ...(eventCode === 'EVENT_SWITCH_CASE' ? { children: { then: [] } } : {}),
      ...([EEvents.SAVE_WRITE, EEvents.SAVE_LOAD].includes(eventCode as EEvents) ? { children: { then: [] } } : {}),
      ...([EEvents.IF_ACTOR_FACING, EEvents.IF_BUTTON_HELD].includes(eventCode as EEvents) ? { children: { then: [], else: [] } } : {}),
    };

    if (onEventCreated) {
      onEventCreated(newScript);
      setOpen(false);
      setSubOpen(false);
      return;
    }

    // Criar novo array sem mutar o original
    let scriptUpdate;
    let updatedElement: any;

    switch (subTabIndex) {
      case 'playerHit1Script':
        scriptUpdate = [...(elementSelected.playerHit1Script || []), newScript];
        updatedElement = { ...elementSelected, playerHit1Script: scriptUpdate };
        break;
      case 'playerHit2Script':
        scriptUpdate = [...(elementSelected.playerHit2Script || []), newScript];
        updatedElement = { ...elementSelected, playerHit2Script: scriptUpdate };
        break;
      case 'playerHit3Script':
        scriptUpdate = [...(elementSelected.playerHit3Script || []), newScript];
        updatedElement = { ...elementSelected, playerHit3Script: scriptUpdate };
        break;
      default:
        // A manually inserted Fade In replaces the placeholder created with
        // the scene. There must be only one initial fade in the script.
        scriptUpdate = reconcileSceneFadeIn(elementSelected?.script ?? [], [...(elementSelected?.script ?? []), newScript]);
        updatedElement = { ...elementSelected, script: scriptUpdate };
        break;
    }
   
    // Atualizar elemento selecionado
    setElementSelected(updatedElement);

    // Atualizar lista de cenas
    setScenes(prevScenes =>
      prevScenes.map(scene =>
        scene.id === elementSelected.id
          ? { ...scene, ...updatedElement, _saved: false }
          : scene
      )
    );
    
    setOpen(false);
    setSubOpen(false);
  };

  const handleDrawerOpen = (isOpen: boolean) => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Delete') {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  return (
    <Content style={{ margin: compact ? 0 : 10 }}>
      {!hideTrigger && <Flex vertical gap="middle" align="center" >
        {!compact && shouldShowEmpty && elementSelected?._resourceType !== 'script' && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />}
      
        <Flex gap="small" style={{ width: '100%' }}>
          <Button
            type={compact ? 'text' : 'default'}
            icon={<PlusSquareOutlined style={{fontSize: 20}}/>}
            style={{ flex: 1, ...(compact ? { backgroundColor: '#6b6b6b', color: '#fff' } : {}) }}
            onClick={() => { setSearchTerm(''); setOpen(true); }}
          >
            {t('events.picker.add')}
          </Button>
          {showFlowButton && (
            <Button
              aria-label={t('events.picker.flow')}
              icon={<BranchesOutlined />}
              title={t('events.picker.flow')}
              onClick={() => setFlowOpen(true)}
            />
          )}
        </Flex>
      </Flex>}

      {showFlowButton && (
        <FlowEditorManager
          open={flowOpen}
          onClose={() => setFlowOpen(false)}
          scriptKey={(subTabIndex || 'script') as ScriptKey}
          addEventControl={<SelectNewEvent tabIndex={tabIndex} subTabIndex={subTabIndex} showFlowButton={false} compact />}
        />
      )}
     
      <Drawer
        title={t('events.picker.add')}
        placement="right"
        mask={true}
        closable={false}
        onClose={() => setOpen(false)}
        open={open}
        afterOpenChange={handleDrawerOpen} 
        styles={{
          mask: { backdropFilter: 'blur(4px)' },
        }}
         onKeyDown={handleKeyDown}
      >
        {/* Barra de busca */}
        <Input 
          ref={searchInputRef}
          placeholder={t('events.picker.search')}
          aria-label={t('events.picker.search')}
          onChange={(e) => setSearchTerm(e.target.value)}
          value={searchTerm}
          allowClear
        />

        {caseValueType ? <Menu selectable={false} style={{ background: 'transparent', borderInlineEnd: 'none' }} items={[{
          key: 'case', label: <EventOptionHelp eventId="EVENT_SWITCH_CASE" label={t('events.switch.addCase')}><span style={{ display: 'block' }}>{t('events.switch.addCase')}</span></EventOptionHelp>, onClick: () => handleClose('EVENT_SWITCH_CASE'),
        }]} /> : searchTerm ? (
          // Modo busca: lista simples
          <Menu selectable={false} style={{ background: "transparent", borderInlineEnd: "none" }}>
            {filteredEventsList.map((fn) => (
              <EventMenuItem
                key={`${fn.id}:${fn.preset ?? 'default'}`}
                eventId={fn.id}
                disabled={isEventAllowed ? !isEventAllowed(fn.id) : false}
                preset={fn.preset}
                isFavorite={favoriteEvents.includes(fn.id)}
                onToggleFavorite={toggleFavorite}
                onSelect={() => handleClose(fn.id, fn.preset)}
                searchTerm={searchTerm}
              />
            ))}
          </Menu>
        ) : (
          <>
            {favoriteEvents.length > 0 && (
              <>
                <Divider orientation="left">{t('events.picker.favorites')}</Divider>
                <Menu selectable={false} style={{ background: "transparent", borderInlineEnd: "none" }}>
                  {[...favoriteEvents].sort((a, b) => optionLabel(a, undefined, t).localeCompare(optionLabel(b, undefined, t))).map((item) => (
                    <EventMenuItem
                      key={item}
                      eventId={item as EEvents}
                      disabled={isEventAllowed ? !isEventAllowed(item) : false}
                      isFavorite={true}
                      onToggleFavorite={toggleFavorite}
                      onSelect={() => handleClose(item)}
                    />
                  ))}
                </Menu>
              </>
            )}

            <Divider orientation="left">{t('events.picker.categories')}</Divider>
            <Menu mode="vertical" selectable={false} style={{ background: "transparent", borderInlineEnd: "none" }}>
              {CATEGORIES.map((label) => (
                <Menu.Item key={label} onClick={() => { setSelectedCategory(label); setSubOpen(true); }}>
                  <Space style={{ width: "100%", justifyContent: "space-between" }}>
                    <Typography.Text>{categoryLabel(label)}</Typography.Text>
                    <ArrowRightOutlined />
                  </Space>
                </Menu.Item>
              ))}
            </Menu>
          </>
        )}
      </Drawer>

      {/* Sub-Drawer para funÃƒÂ§ÃƒÂµes da categoria */}
      <Drawer title={t('events.picker.categoryTitle', { category: selectedCategory ? categoryLabel(selectedCategory) : '' })} placement="right" onClose={() => setSubOpen(false)} open={subOpen}>
        {selectedCategory && selectedCategory in FUNCTIONS_BY_CATEGORY ? (
          Object.entries(FUNCTIONS_BY_CATEGORY[selectedCategory as keyof typeof FUNCTIONS_BY_CATEGORY]).length > 0 ? (
            Object.entries(FUNCTIONS_BY_CATEGORY[selectedCategory as keyof typeof FUNCTIONS_BY_CATEGORY]).map(([subCat, funcs]) => (
              <Content key={subCat} style={{ marginBottom: 24 }}>
                <Divider orientation="left">{GROUP_KEYS[subCat] ? t(`events.picker.group.${GROUP_KEYS[subCat]}`) : subCat}</Divider>
                <Menu selectable={false} style={{ background: "transparent", borderInlineEnd: "none" }}>
                  {funcs.map((fn) => (
                    <EventMenuItem
                      key={`${fn.id}:${'preset' in fn ? fn.preset : 'default'}`}
                      eventId={fn.id}
                      disabled={isEventAllowed ? !isEventAllowed(fn.id) : false}
                      preset={'preset' in fn ? fn.preset as EventPreset : undefined}
                      isFavorite={favoriteEvents.includes(fn.id)}
                      onToggleFavorite={toggleFavorite}
                      onSelect={() => handleClose(fn.id, 'preset' in fn ? fn.preset as EventPreset : undefined)}
                    />
                  ))}
                </Menu>
              </Content>
            ))
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />
          )
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />
        )}
      </Drawer>
    </Content>
  );
};

export default SelectNewEvent;
