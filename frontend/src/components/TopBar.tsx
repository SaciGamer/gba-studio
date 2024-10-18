import React, { useState } from 'react';
import { Menu, Dropdown, Input, Button, Tooltip } from 'antd';
import { DownOutlined, FolderOpenOutlined, ExportOutlined, PlaySquareOutlined, CloseCircleOutlined } from '@ant-design/icons';
import { useZoomContext } from './ZoomContext.tsx';

const TopBar: React.FC = () => {
  const { zoomLevel, setZoomLevel } = useZoomContext(); 

  const resetZoom = () => {
    setZoomLevel(100);
  };

  const handleZoomChange = (change: number) => {
    setZoomLevel((prevZoom) => Math.max(10, Math.min(500, prevZoom + change)));
  };

  const [searchValue, setSearchValue] = useState<string>('');

  const clearSearch = () => {
    setSearchValue('');
  };

  const [selectedKey, setSelectedKey] = useState<string>('1');
  const [menuName, setMenuName] = useState<string>('Game World');

  const handleMenuClick = (e: any) => {
    setSelectedKey(e.key);
    setMenuName(e.item.props.children);
  }

  const menuItems = [
    { key: '1', label: 'Game World' },
    { key: '2', label: 'Sprites' },
    { key: '3', label: 'Images' },
    { key: '4', label: 'Music' },
    { key: '5', label: 'Sound Effects' },
    { key: '6', label: 'Palettes' },
    { key: '7', label: 'Dialog Review' },
    { key: '8', label: 'Setting' }
  ];

  const menu = (
    <Menu 
      selectedKeys={[selectedKey]} 
      onClick={handleMenuClick} items={menuItems} 
    />
  );

  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '10px', justifyContent: 'space-between' }}>
      <div>
        <Dropdown overlay={menu} placement="bottomLeft" trigger={['click']}>
          <Button style={{ width: '150px', display: 'flex', justifyContent: 'space-between' }}>
            {menuName}
            <DownOutlined />
          </Button>
        </Dropdown>
      </div>
      <div style={{ marginLeft: '5px', display: 'flex', alignItems: 'center' }}>
        <Tooltip title="Zoom Out">
          <Button onClick={() => handleZoomChange(-10)}>-</Button>
        </Tooltip>
        <Tooltip title="Reset Zoom">
          <span style={{ marginLeft: '10px', marginRight: '10px', cursor: 'pointer' }} onClick={resetZoom}>{zoomLevel}%</span>
        </Tooltip>
        <Tooltip title="Zoom In">
          <Button onClick={() => handleZoomChange(10)}>+</Button>
        </Tooltip>
      </div>
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
        <Tooltip title="Open Project Folder">
          <Button icon={<FolderOpenOutlined />} style={{ padding: '10px' }} />
        </Tooltip>
        <Tooltip title="Export As...">
          <Button icon={<ExportOutlined />} style={{ padding: '10px', marginLeft: '5px' }}></Button>
        </Tooltip>
        <Tooltip title="Run">
          <Button icon={<PlaySquareOutlined />} style={{ marginLeft: '15px', padding: '10px' }}></Button>
        </Tooltip>
      </div>
    </div>
  );
};

export default TopBar;
