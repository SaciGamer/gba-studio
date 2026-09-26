import useAppContexts from '@/providers/contexts/AppContexts';
import { ETypeScene, IConditionValue, IScriptsElement } from '@/providers/contexts/interfaces/ISceneElement';
import { ArrowRightOutlined, BranchesOutlined, PlusSquareOutlined, StarFilled, StarOutlined } from '@ant-design/icons';
import { Button, Divider, Drawer, Empty, Flex, Input, InputRef, Menu, Space, Typography } from "antd";
import { Content } from 'antd/es/layout/layout';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { AntdToken } from '../common/AntDToken';
import DefaultValueEvents, { VariableEventPreset } from './DefaultValueEvents';
import FlowEditorManager, { ScriptKey } from './FlowEditorManager';
import { EEvents, EVENT_INFO } from './interfaces/IEvents';

const CATEGORIES = ["Player", "Actor", "Camera", "Scene", "Screen", "Timer", "Audio", "Dialogue", "Scripts", "Variables"];

type EventOption = { id: EEvents; name: string; preset?: VariableEventPreset };

const highlightText = (text: string, highlight: string) => {
  const { token } = AntdToken();

  if (!highlight.trim()) return text;
  const regex = new RegExp(`(${highlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  const parts = text.split(regex);
  return parts.map((part, index) => 
    regex.test(part) ? <Space key={index} style={{ color: token.colorPrimary/*, fontWeight: 'bold'*/ }}>{part}</Space> : part
  );
};

const FUNCTIONS_BY_CATEGORY = {
  // Actor: {
  //   Movimento: [
  //     { id: EEvents.MOVE_ACTOR, name: EVENT_INFO[EEvents.MOVE_ACTOR].name }, 
  //     { id: EEvents.JUMP_ACTOR, name: EVENT_INFO[EEvents.JUMP_ACTOR].name }
  //   ],
  //   Aparência: [
  //     { id: EEvents.CHANGE_SPRITE, name: EVENT_INFO[EEvents.CHANGE_SPRITE].name },
  //     { id: EEvents.CHANGE_COSTUME, name: EVENT_INFO[EEvents.CHANGE_COSTUME].name }
  //   ],
  // },
  // Camera: {
  //   Básico: [
  //     { id: EEvents.PAN_CAMERA, name: EVENT_INFO[EEvents.PAN_CAMERA].name }, 
  //     { id: EEvents.ZOOM, name: EVENT_INFO[EEvents.ZOOM].name }
  //   ],
  //   Avançado: [
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
    ],
  },
  Audio: {
    Music: [
      { id: EEvents.PLAY_MUSIC, name: EVENT_INFO[EEvents.PLAY_MUSIC].name },
      { id: EEvents.PLAY_SOUND, name: EVENT_INFO[EEvents.PLAY_SOUND].name },
      { id: EEvents.STOP_MUSIC, name: EVENT_INFO[EEvents.STOP_MUSIC].name },
      { id: EEvents.SET_MUSIC_VOLUME, name: EVENT_INFO[EEvents.SET_MUSIC_VOLUME].name },
    ],
  },
  Dialogue: {
    Text: [
      { id: EEvents.DISPLAY_DIALOGUE, name: EVENT_INFO[EEvents.DISPLAY_DIALOGUE].name },
      { id: EEvents.HIDE_DIALOGUE, name: EVENT_INFO[EEvents.HIDE_DIALOGUE].name },
      { id: EEvents.DIALOGUE_CHOICE, name: EVENT_INFO[EEvents.DIALOGUE_CHOICE].name },
    ],
  },
  Scene: {
    Scene: [
      { id: EEvents.CHANGE_SCENE, name: EVENT_INFO[EEvents.CHANGE_SCENE].name },
    ],
    Layer:[
      {
        id: EEvents.CHANGE_LAYER, name: EVENT_INFO[EEvents.CHANGE_LAYER].name
      },
      {
        id: EEvents.VISIBLE_BACKGROUND, name: EVENT_INFO[EEvents.VISIBLE_BACKGROUND].name
      },
      {
        id: EEvents.CHANGE_PALETTE_BACKGROUND, name: EVENT_INFO[EEvents.CHANGE_PALETTE_BACKGROUND].name
      },
      // {
      //   id: EEvents.MOVE_LAYER, name: EVENT_INFO[EEvents.MOVE_LAYER].name
      // }
    ],
    // Tiles: [
    //   {
    //     id: EEvents.REPLC_TL_AT_POS, name: EVENT_INFO[EEvents.REPLC_TL_AT_POS].name,
    //   },
    //   {
    //     id: EEvents.REPLC_TL_AT_POS_FROM_SQNCE, name: EVENT_INFO[EEvents.REPLC_TL_AT_POS_FROM_SQNCE].name,
    //   }
    // ]
  },
  Actor: {
    "Actor Functions": [
      { id: EEvents.SPAWN_ACTOR, name: EVENT_INFO[EEvents.SPAWN_ACTOR].name },
      { id: EEvents.MOVE_ACTOR, name: EVENT_INFO[EEvents.MOVE_ACTOR].name },
      { id: EEvents.REMOVE_ACTOR, name: EVENT_INFO[EEvents.REMOVE_ACTOR].name },
    ],
    Visibility: [
      { id: EEvents.HIDE_ACTOR, name: EVENT_INFO[EEvents.HIDE_ACTOR].name },
      { id: EEvents.HIDE_ALL_SPRITES, name: EVENT_INFO[EEvents.HIDE_ALL_SPRITES].name },
      { id: EEvents.SHOW_ACTOR, name: EVENT_INFO[EEvents.SHOW_ACTOR].name },
      { id: EEvents.SHOW_ALL_SPRITES, name: EVENT_INFO[EEvents.SHOW_ALL_SPRITES].name },
    ],
    Animation: [
      { id: EEvents.SET_ANIMATION_SPEED, name: EVENT_INFO[EEvents.SET_ANIMATION_SPEED].name },
      { id: EEvents.SET_ACTOR_PRIORITY, name: EVENT_INFO[EEvents.SET_ACTOR_PRIORITY].name },
    ],
  },
  "Joypad Input": {
    Buttons: [
      { id: EEvents.WAIT_FOR_BUTTON, name: EVENT_INFO[EEvents.WAIT_FOR_BUTTON].name },
      { id: EEvents.IF_BUTTON_HELD, name: EVENT_INFO[EEvents.IF_BUTTON_HELD].name },
    ],
  },
  Screen: {
    "Fade": [
      { id: EEvents.FADE_IN, name: EVENT_INFO[EEvents.FADE_IN].name },
      { id: EEvents.FADE_OUT, name: EVENT_INFO[EEvents.FADE_OUT].name },
      { id: EEvents.FADE_OPTIONS, name: EVENT_INFO[EEvents.FADE_OPTIONS].name },
    ],
  },
  Timer: {
    "Wait": [
      { id: EEvents.WAIT, name: EVENT_INFO[EEvents.WAIT].name },
      // { id: EEvents.IDLE, name: EVENT_INFO[EEvents.IDLE].name }
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
      { id: EEvents.VARIABLE_RESET_ALL, name: EVENT_INFO[EEvents.VARIABLE_RESET_ALL].name },
    ],
  }
};

interface EventMenuItemProps {
  eventId: EEvents;
  isFavorite: boolean;
  onToggleFavorite: (id: EEvents) => void;
  onSelect: () => void;
  searchTerm?: string;
}

const EventMenuItem: React.FC<EventMenuItemProps> = ({ eventId, isFavorite, onToggleFavorite, onSelect, searchTerm }) => (
  <Menu.Item key={eventId} onClick={onSelect}>
    <Space style={{ width: "100%", justifyContent: "space-between" }}>
      <Typography.Text>{searchTerm ? highlightText(EVENT_INFO[eventId].name, searchTerm) : EVENT_INFO[eventId].name}</Typography.Text>
      <Button
        icon={isFavorite ? <StarFilled /> : <StarOutlined />}
        type="text"
        onClick={(e) => { e.stopPropagation(); onToggleFavorite(eventId); }}
      />
    </Space>
  </Menu.Item>
);

interface ISelectEventProps {
  tabIndex?: string;
  subTabIndex?: string;
  showFlowButton?: boolean;
  compact?: boolean;
  onEventCreated?: (event: IScriptsElement) => void;
}

const SelectNewEvent: React.FC<ISelectEventProps> = ({ tabIndex, subTabIndex, showFlowButton = true, compact = false, onEventCreated }) => {
  // const { scenes, setScenes, ignoredFields } = useSceneContext();
  // const { settingUtils, setSettingUtils } = useSettingsUtilsContext();
  // const { elementSelected, setElementSelected } = useElementContext();

  const { scenes, variables, setScenes, setSettingUtils, elementSelected, setElementSelected, userSettings, setUserSettings } = useAppContexts();
  
  const favoriteEvents = userSettings.favoriteEvents || [];
  
  const [open, setOpen] = useState(false);
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
          if (EVENT_INFO[event.id].name.toLowerCase().includes(searchTerm.toLowerCase())) {
            results.push(event);
          }
        });
      });
    });
    
    return results.sort((a, b) => a.name.localeCompare(b.name));
  }, [searchTerm]);

  const handleClose = (eventCode: string, variablePreset: VariableEventPreset = 'value') => {
    const firstVariableValue = (): IConditionValue => {
      const variable = variables.variables[0];
      return variable
        ? { kind: 'variable', variableId: variable.id, symbol: variable.symbol, type: variable.type }
        : { kind: 'literal', type: 'number', value: 0 };
    };

    // Criar um elemento de script válido
    const defaultArgs = [EEvents.IF, EEvents.WHILE].includes(eventCode as EEvents)
      ? { left: firstVariableValue(), operator: '==', right: firstVariableValue() }
      : DefaultValueEvents(eventCode, scenes, variablePreset);
    const isSingleLayerScene = elementSelected?.sceneType === ETypeScene.LOGO || elementSelected?.sceneType === ETypeScene.POINTNCLICK;
    if (isSingleLayerScene && [EEvents.CHANGE_LAYER, EEvents.VISIBLE_BACKGROUND, EEvents.CHANGE_PALETTE_BACKGROUND].includes(eventCode as EEvents) && defaultArgs) {
      (defaultArgs as { layerId?: number }).layerId = 2;
    }
    const newScript: IScriptsElement = {
      id: uuidv4(),
      version: 1,
      command: eventCode,
      args: defaultArgs,
      ...([EEvents.IF, EEvents.WHILE, EEvents.FOR, EEvents.WAIT_FOR_BUTTON].includes(eventCode as EEvents) ? { children: { then: [] } } : {}),
      ...(eventCode === EEvents.IF_BUTTON_HELD ? { children: { then: [], else: [] } } : {}),
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
        scriptUpdate = eventCode === EEvents.FADE_IN && elementSelected?.script?.[0]?.command === EEvents.FADE_IN && elementSelected.script[0].args?.__automatic
          ? [newScript, ...elementSelected.script.slice(1)]
          : [...(elementSelected?.script || []), newScript];
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
      <Flex vertical gap="middle" align="center" >
        {!compact && shouldShowEmpty && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />}
      
        <Flex gap="small" style={{ width: '100%' }}>
          <Button
            type={compact ? 'text' : 'default'}
            icon={<PlusSquareOutlined style={{fontSize: 20}}/>}
            style={{ flex: 1, ...(compact ? { backgroundColor: '#6b6b6b', color: '#fff' } : {}) }}
            onClick={() => setOpen(true)}
          >
            Add Event
          </Button>
          {showFlowButton && (
            <Button
              aria-label="Open Flow Editor"
              icon={<BranchesOutlined />}
              title="Open Flow Editor"
              onClick={() => setFlowOpen(true)}
            />
          )}
        </Flex>
      </Flex>

      {showFlowButton && (
        <FlowEditorManager
          open={flowOpen}
          onClose={() => setFlowOpen(false)}
          scriptKey={(subTabIndex || 'script') as ScriptKey}
          addEventControl={<SelectNewEvent tabIndex={tabIndex} subTabIndex={subTabIndex} showFlowButton={false} compact />}
        />
      )}
     
      <Drawer
        title="Add Event"
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
          placeholder="Search..." 
          onChange={(e) => setSearchTerm(e.target.value)}
          value={searchTerm}
          allowClear
        />

        {searchTerm ? (
          // Modo busca: lista simples
          <Menu selectable={false} style={{ background: "transparent", borderInlineEnd: "none" }}>
            {filteredEventsList.map((fn) => (
              <EventMenuItem
                key={fn.id}
                eventId={fn.id}
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
                <Divider orientation="left">Favoritos</Divider>
                <Menu selectable={false} style={{ background: "transparent", borderInlineEnd: "none" }}>
                  {[...favoriteEvents].sort((a, b) => EVENT_INFO[(a as EEvents)].name.localeCompare(EVENT_INFO[b as EEvents].name)).map((item) => (
                    <EventMenuItem
                      key={item}
                      eventId={item as EEvents}
                      isFavorite={true}
                      onToggleFavorite={toggleFavorite}
                      onSelect={() => handleClose(item)}
                    />
                  ))}
                </Menu>
              </>
            )}

            <Divider orientation="left">Categorias</Divider>
            <Menu mode="vertical" selectable={false} style={{ background: "transparent", borderInlineEnd: "none" }}>
              {CATEGORIES.map((label) => (
                <Menu.Item key={label} onClick={() => { setSelectedCategory(label); setSubOpen(true); }}>
                  <Space style={{ width: "100%", justifyContent: "space-between" }}>
                    <Typography.Text>{label}</Typography.Text>
                    <ArrowRightOutlined />
                  </Space>
                </Menu.Item>
              ))}
            </Menu>
          </>
        )}
      </Drawer>

      {/* Sub-Drawer para funções da categoria */}
      <Drawer title={`Funções de ${selectedCategory}`} placement="right" onClose={() => setSubOpen(false)} open={subOpen}>
        {selectedCategory && selectedCategory in FUNCTIONS_BY_CATEGORY ? (
          Object.entries(FUNCTIONS_BY_CATEGORY[selectedCategory as keyof typeof FUNCTIONS_BY_CATEGORY]).length > 0 ? (
            Object.entries(FUNCTIONS_BY_CATEGORY[selectedCategory as keyof typeof FUNCTIONS_BY_CATEGORY]).map(([subCat, funcs]) => (
              <Content key={subCat} style={{ marginBottom: 24 }}>
                <Divider orientation="left">{subCat}</Divider>
                <Menu selectable={false} style={{ background: "transparent", borderInlineEnd: "none" }}>
                  {funcs.map((fn) => (
                    <EventMenuItem
                      key={fn.id}
                      eventId={fn.id}
                      isFavorite={favoriteEvents.includes(fn.id)}
                      onToggleFavorite={toggleFavorite}
                      onSelect={() => handleClose(fn.id, 'preset' in fn ? fn.preset as VariableEventPreset : undefined)}
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
