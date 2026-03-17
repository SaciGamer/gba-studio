import { useElementContext, useSceneContext, useSettingsUtilsContext } from '@/providers/contexts/AppContexts';
import { IScriptsElement } from '@/providers/contexts/interfaces/ISceneElement';
import { ArrowRightOutlined, PlusSquareOutlined, StarFilled, StarOutlined } from '@ant-design/icons';
import { Button, Divider, Drawer, Empty, Flex, Input, InputRef, Menu, Space, Typography } from "antd";
import { Content } from 'antd/es/layout/layout';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { AntdToken } from '../common/AntDToken';
import DefaultValueEvents from './DefaultValueEvents';
import { EEvents, EVENT_INFO } from './interfaces/IEvents';

const CATEGORIES = ["Actor", "Camera", "Audio", "Dialogue & Menus", "Scene", "Screen", "Timer"];

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
  Actor: {
    Movimento: [
      { id: EEvents.MOVE_ACTOR, name: EVENT_INFO[EEvents.MOVE_ACTOR].name }, 
      { id: EEvents.JUMP_ACTOR, name: EVENT_INFO[EEvents.JUMP_ACTOR].name }
    ],
    Aparência: [
      { id: EEvents.CHANGE_SPRITE, name: EVENT_INFO[EEvents.CHANGE_SPRITE].name },
      { id: EEvents.CHANGE_COSTUME, name: EVENT_INFO[EEvents.CHANGE_COSTUME].name }
    ],
  },
  Camera: {
    Básico: [
      { id: EEvents.PAN_CAMERA, name: EVENT_INFO[EEvents.PAN_CAMERA].name }, 
      { id: EEvents.ZOOM, name: EVENT_INFO[EEvents.ZOOM].name }
    ],
    Avançado: [
      { id: EEvents.ROTATE_CAMERA, name: EVENT_INFO[EEvents.ROTATE_CAMERA].name }
    ],
  },
  Audio: {
    
  },
  "Dialogue & Menus": {

  },
  Scene: {
    Scene: [
      { id: EEvents.CHANGE_SCENE, name: EVENT_INFO[EEvents.CHANGE_SCENE].name },
    ],
    Tiles: [
      {
        id: EEvents.REPLC_TL_AT_POS, name: EVENT_INFO[EEvents.REPLC_TL_AT_POS].name,
      },
      {
        id: EEvents.REPLC_TL_AT_POS_FROM_SQNCE, name: EVENT_INFO[EEvents.REPLC_TL_AT_POS_FROM_SQNCE].name,
      }
    ]
  },
  Screen: {
    "Fade": [
      { id: EEvents.FADE_IN, name: EVENT_INFO[EEvents.FADE_IN].name },
      { id: EEvents.FADE_OUT, name: EVENT_INFO[EEvents.FADE_OUT].name }
    ],
  },
  Timer: {
    "Wait": [
      { id: EEvents.WAIT, name: EVENT_INFO[EEvents.WAIT].name },
      { id: EEvents.IDLE, name: EVENT_INFO[EEvents.IDLE].name }
    ]
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
}

const SelectNewEvent: React.FC<ISelectEventProps> = ({tabIndex, subTabIndex}) => {
  const { scenes, setScenes, ignoredFields } = useSceneContext();
  const { settingUtils, setSettingUtils } = useSettingsUtilsContext();
  const { elementSelected, setElementSelected } = useElementContext();
  const favoriteEvents = settingUtils.favoriteEvents || [];
  
  const [open, setOpen] = useState(false);
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

    setSettingUtils(prev => ({ ...prev, favoriteEvents: newFavorites }));
    window.electronAPI.saveFavoriteEvents(newFavorites);
  }, [favoriteEvents, setSettingUtils]);

  const filteredEventsList = useMemo(() => {
    if (!searchTerm) return [];
    const results: { id: EEvents; name: string }[] = [];
    
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

  const handleClose = (eventCode: string) => {
    // Criar um elemento de script válido
    const newScript: IScriptsElement = {
      id: uuidv4(),
      command: eventCode,
      args: DefaultValueEvents(eventCode, scenes),
    };

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
        scriptUpdate = [...(elementSelected?.script || []), newScript];
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
    <Content style={{ margin: 10 }}>
      <Flex vertical gap="middle" align="center" >
        {shouldShowEmpty && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />}
      
        <Button type="default" icon={<PlusSquareOutlined style={{fontSize: 20}}/>} style={{ width: '100%'}} onClick={() => setOpen(true)}>
          Add Event
        </Button>
      </Flex>
     
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
                onSelect={() => handleClose(fn.id)}
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
                      onSelect={() => handleClose(fn.id)}
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
