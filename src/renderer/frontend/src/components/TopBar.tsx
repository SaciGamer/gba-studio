import React, { useEffect, useState } from 'react';
import { Dropdown, Input, Button, Tooltip, Space } from 'antd';
import { DownOutlined, FolderOpenOutlined, ExportOutlined, PlaySquareOutlined, CloseCircleOutlined } from '@ant-design/icons';
import { useZoomContext } from './ZoomContext';
import { AntdToken } from '../components/common/AntDToken';

interface TopBarProps {
  contenView: number;
  setContentView: (id: number) => void;
}

const TopBar: React.FC<TopBarProps> = ({ contenView, setContentView: controllerView }) => {
  const { token } = AntdToken();
  const { zoomLevel, setZoomLevel } = useZoomContext(); 

  const resetZoom = () => {
    setZoomLevel(100);
  };

  const handleZoomChange = (change: number) => {
    setZoomLevel((prevZoom) => Math.max(10, Math.min(500, prevZoom + change)));
  };

  const [searchValue, setSearchValue] = useState<string>('');
  const [selectedKey, setSelectedKey] = useState<number>(1);
  const [menuName, setMenuName] = useState<string>('Game World');
  const [isRunning, setIsRunning] = useState<boolean>(false);

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
    console.log('..:: Open Project Folder ::..');
    window.electronAPI.send('open-project-folder', null);
  }
  
  const menuItems = [
    { key: '1', label: 'Game World'},
    { key: '2', label: 'Sprites' },
    { key: '3', label: 'Images' },
    { key: '4', label: 'Music' },
    { key: '5', label: 'Sound Effects' },
    { key: '6', label: 'Palettes' },
    { key: '7', label: 'Dialog Review' },
    { key: '8', label: 'Setting' }
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

  useEffect(() => {
    // Listen emulator events
    if (window.electronAPI && window.electronAPI.on) {
      window.electronAPI.on('emulator-started', () => setIsRunning(true));
      window.electronAPI.on('emulator-stopped', () => setIsRunning(false));
    }
    return () => {
      try { window.electronAPI.removeListener('emulator-started', () => setIsRunning(true)); } catch (e) {}
      try { window.electronAPI.removeListener('emulator-stopped', () => setIsRunning(false)); } catch (e) {}
    };
  }, []);

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
          <Button onClick={() => handleZoomChange(-10)}>-</Button>
        </Tooltip>
        <Tooltip title="Reset Zoom">
          <span style={{ marginLeft: '10px', marginRight: '10px', cursor: 'pointer' }} onClick={resetZoom}>{zoomLevel}%</span>
        </Tooltip>
        <Tooltip title="Zoom In">
          <Button onClick={() => handleZoomChange(10)}>+</Button>
        </Tooltip>
      </Space>)}
      <div style={{ marginLeft: '5px', display: 'flex', alignItems: 'right' }}>
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
          <Button icon={<PlaySquareOutlined />} 
            onClick={() => { 
              console.log('..: TopBar Build - request compile'); 
              window.electronAPI.send('compile-project', null); 
            }}
            style={{ marginLeft: '15px', padding: '10px' }}>
          </Button>
        </Tooltip>
        <Tooltip title={isRunning ? 'Stop' : 'Play'}>
          <Button 
            icon={ isRunning ? <CloseCircleOutlined /> : <PlaySquareOutlined /> }
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
