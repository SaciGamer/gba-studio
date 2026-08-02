import React, { useEffect, useState } from 'react';
import { Dropdown, Input, Button, Tooltip, Space } from 'antd';
import { DownOutlined, FolderOpenOutlined, ExportOutlined, PlaySquareOutlined, CloseCircleOutlined, ToolFilled } from '@ant-design/icons';
import { AntdToken } from '../components/common/AntDToken';
import { useBuildState } from '../providers/BuildStateProvider';
import useAppContexts from '@/providers/contexts/AppContexts';

interface TopBarProps {
  contenView: number;
  setContentView: (id: number) => void;
}

const TopBar: React.FC<TopBarProps> = ({ contenView, setContentView: controllerView }) => {
  const { token } = AntdToken();
  const { settings, userSettings, setUserSettings, setSettingUtils } = useAppContexts();
  const zoomSteps = [25, 50, 100, 200, 400, 800, 1600];

  const resetZoom = () => {
    setUserSettings(prev => ({...prev, zoom: 100, _saved: false}));
    setSettingUtils(prev => ({...prev, buttonZoomPressed: true}));
  };

  const handleZoomChange = (change: number) => {
    setUserSettings(prev => {
      let current = prev.zoom!;

      // encontra o índice mais próximo na sequência
      let idx = zoomSteps.reduce((closestIdx, step, i) => {
        return Math.abs(step - current) < Math.abs(zoomSteps[closestIdx] - current)
          ? i
          : closestIdx;
      }, 0);

      // ajusta índice conforme o change
      if (change > 0) {
        idx = Math.min(idx + 1, zoomSteps.length - 1);
      } else if (change < 0) {
        idx = Math.max(idx - 1, 0);
      }

      const newZoom = zoomSteps[idx];

      return { ...prev, zoom: Math.trunc(newZoom), _saved: false };
    });

    setSettingUtils(prev => ({...prev, buttonZoomPressed: true}));
  };

  const [searchValue, setSearchValue] = useState<string>('');
  const [selectedKey, setSelectedKey] = useState<number>(1);
  const [menuName, setMenuName] = useState<string>('Game World');
  const { isBuilding, isRunning, setBuilding } = useBuildState();

  const clearSearch = () => {
    setSearchValue('');
  };

  const handleMenuClick = (item: any) => {
    setSelectedKey(item.key);
    setMenuName(item.label);
   
    controllerView(item.key);
    console.log('..: selectedKey %s, menuName', item.key, item.label);
  }

  const handleProjectFolder = () => {
    console.log('..:: Open Project Folder ::..') ;
    window.electronAPI.send('open-project-folder', null);
  }
  
  const menuItems = [
    { key: '1', label: 'Game World'},
    { key: '2', label: 'Tiles Editor' },
    { key: '3', label: 'Sprites' },
    { key: '4', label: 'Images' },
    { key: '5', label: 'Music' },
    { key: '6', label: 'Sound Effects' },
    { key: '7', label: 'Palettes' },
    { key: '8', label: 'Dialog Review' },
    { key: '9', label: 'Setting' }
  ];

  const menu = {
    items: menuItems,
    onClick: (event: any) => { handleMenuClick(menu.items.find(item => item.key == event.key)), console.log('..: handleMenuClick dropdown'); },
  };

  useEffect(() => {
    const menuItem = menu.items.find(item => item.key === contenView.toString());
    if (menuItem) {
      handleMenuClick(menuItem);
    } else {
      console.warn('..: Menu item not found for contenView:', contenView);
    }
  }, [contenView]);

  // emulator start/stop handled by BuildStateProvider; no local listeners needed
  useEffect(() => {}, [isBuilding, isRunning]);

  // save config on localstorage to build and play
  useEffect(() => {
    if (settings) {
      localStorage.setItem("appSettings", JSON.stringify(settings));
    }
  }, [settings]);

  return (
    <Space style={{ display: 'flex', alignItems: 'center', paddingInline: '10px', paddingBlock: '5px', justifyContent: 'space-between', backgroundColor: token.colorBgBase }}>
      <Dropdown menu={menu} placement="bottomLeft" trigger={['click']}>
        <Button style={{ width: '150px', display: 'flex', justifyContent: 'space-between' }}>
          {menuName}
          <DownOutlined />
        </Button>
      </Dropdown>
      {(selectedKey == 1 || selectedKey == 2 || selectedKey <= 3) && (<Space style={{ marginLeft: '5px', display: 'flex', alignItems: 'center', justifyContent: 'start' }}>
        <Tooltip title="Zoom Out">
          <Button onClick={() => handleZoomChange(-1)}>-</Button>
        </Tooltip>
        <Tooltip title="Reset Zoom">
          <span style={{ marginLeft: '10px', marginRight: '10px', cursor: 'pointer' }} onClick={resetZoom}>{userSettings.zoom}%</span>
        </Tooltip>
        <Tooltip title="Zoom In">
          <Button onClick={() => handleZoomChange(1)}>+</Button>
        </Tooltip>
      </Space>)}
      <div style={{ marginLeft: '5px', display: 'flex', alignItems: 'center', gap: '5px' }}>
        <Input.Search 
          placeholder="Search"
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
          style={{ paddingRight: '5px' }}
          // disabled={true}
        />
        {searchValue && (
          <CloseCircleOutlined
            onClick={clearSearch}
            style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', cursor: 'pointer' }}
          />
        )}
        <Tooltip title="Open Project Folder" >
          <Button 
            icon={ <FolderOpenOutlined /> } 
            onClick={() => handleProjectFolder()}
            style={{ padding: '10px' }}
          />
        </Tooltip>
        <Tooltip title="Export As...">
          <Button 
            icon={<ExportOutlined />} 
            onClick={() => console.log('..: TopBar Export As...')}
            style={{ padding: '10px', marginLeft: '5px' }}>
          </Button>
        </Tooltip>
        <Tooltip title="Build">
          <Button 
            icon={<ToolFilled />} 
            loading={isBuilding}
            disabled={isRunning}
            onClick={() => { 
              console.log('..: TopBar Build - request compile'); 
              setBuilding(true);
              window.electronAPI.send('compile-project', null); 
            }}
            style={{ marginLeft: '15px', padding: '10px' }}>
          </Button>
        </Tooltip>
        <Tooltip title={isRunning ? 'Stop' : 'Play'}>
          <Button 
            icon={ isRunning ? <CloseCircleOutlined /> : <PlaySquareOutlined /> }
            disabled={isBuilding}
            onClick={() => { 
              if (isRunning) { window.electronAPI.send('stop-emulator', null); console.log('..: TopBar Stop emulator'); }
              else { window.electronAPI.send('run-live', null); console.log('..: TopBar Run-live requested'); }
            }}
            style={{ marginLeft: '8px', padding: '10px' }}
          />
        </Tooltip>
      </div>
    </Space >
  );
};

export default TopBar;
