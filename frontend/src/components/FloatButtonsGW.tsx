import React, { CSSProperties, useState } from 'react';
import { AccountBookFilled, AppstoreAddOutlined, AppstoreFilled, AuditOutlined, BgColorsOutlined, BorderBottomOutlined, BorderInnerOutlined, BorderLeftOutlined, BorderOutlined, ClearOutlined, CloseSquareOutlined, EditOutlined, ExperimentFilled, ExperimentOutlined, ExperimentTwoTone, FormatPainterOutlined, InsertRowAboveOutlined, OneToOneOutlined, PictureOutlined, PlusSquareOutlined, SelectOutlined } from '@ant-design/icons';
import { FloatButton, ConfigProviderProps, Menu, Dropdown, Row, Flex, Splitter } from 'antd';
import { AntdToken } from '../components/common/AntDToken.ts';
import FloatButtonGroup from 'antd/es/float-button/FloatButtonGroup';
import { title } from 'process';

type SizeType = ConfigProviderProps['componentSize'];

const FloatButttonsGW: React.FC = () => {
  const { token } = AntdToken();
  
  const [activeButton, setActiveButton] = useState('select');
  const [activeSubButton, setActiveSubButton] = useState('select');

  const [numberNofity, setNumberNofity] = useState(0);

  const handleButtonClick = (buttonId, key?) => {
    setActiveButton(buttonId);
    handleSubMenuClick(buttonId);
    if (key) {
      setNumberNofity(key);
    } else {
      setNumberNofity(0);
    }
  };

  const handleSubButtonClick = (buttonId) => {
    setActiveSubButton(buttonId);
  };

  const menu = (
    <Menu onClick={({ key }) => handleButtonClick('add', key)} style={{ fontSize: 25, marginLeft: 45, marginTop: -30}}>
      <Menu.Item key="1" style={{ color: activeSubButton === '1' ? token.colorPrimary : token.colorTextBase}}>
        <AuditOutlined style={{ marginRight: 8 }} />
        Actor
      </Menu.Item>
      <Menu.Item key="2" style={{ color: activeSubButton === '2' ? token.colorPrimary : token.colorTextBase}}>
        <PlusSquareOutlined style={{ marginRight: 8 }}/>
        Trigger
      </Menu.Item>
      <Menu.Item key="3" style={{ color: activeSubButton === '3' ? token.colorPrimary : token.colorTextBase}}>
        <PictureOutlined style={{ marginRight: 8 }}/>
        Scene
      </Menu.Item>
    </Menu>
  );

  // Menus Superiores
  const [eraseMenu, setEraseMenu] = useState<boolean>(false);
  const [collisionMenu, setCollisionMenu] = useState<boolean>(false);
  const [colorizeMenu, setColorizeMenu] = useState<boolean>(false);

  const handleSubMenuClick = (buttonId) => {
    console.log("..: Entrando no handleSubMenuClick:", buttonId);
    setEraseMenu(false);
    setCollisionMenu(false);
    setColorizeMenu(false);

    switch (buttonId) {
      case 'eraser':
        setEraseMenu(true);
        break;
      case 'collisions':
        setCollisionMenu(true);
      break;
      case 'colorize':
        setColorizeMenu(true);
        break;
      default:
        break;
    }
    
  };

  const columnButtonStyle: CSSProperties = {
    position: 'absolute',
    insetBlockStart: '15px', // Alinha ao topo do contêiner
    insetBlockEnd: 'auto', // Alinha ao final do Block
    insetInlineStart: '15px', // Alinha à esquerda do contêiner
    insetInlineEnd: 'auto', // Alinha ao final do Inline

    // display: 'flex',
  };

  const hoverStyle = {
    '&:hover': {
      transform: 'scale(1.1)'
    }
  };

  const baseButtonStyle = {
    borderBlock: 'none', // Remover Borda inferior

    // display: 'flex',
    // justifyContent: 'center',
    // alignItems: 'center',
    
    paddingLeft: 0,
    paddingRight: 0,
  };


  const horizontalButtonStyle = {
    ... baseButtonStyle,
    // borderInlineEnd: `1px solid ${token.colorSplit}`, // Borda direita
    borderRadius: 0, // Retira o border radius
  };

  const subMenuStyle: CSSProperties = {
    ...columnButtonStyle, 
    insetInlineStart: '100px', // Alinha à esquerda do cont êiner
    
    flexDirection: 'row',  // Menu em Horizontal
  };
  
  const applyButtonStyles = (index: number, total: number, baseStyle: CSSProperties): CSSProperties => {
    if (index === 0) {
      return {
        ...baseStyle,
        borderInlineStart: 'none',
        borderEndStartRadius: token.borderRadius,
        borderStartStartRadius: token.borderRadius
      };
    } else if (index === total - 1) {
      return {
        ...baseStyle,
        borderInlineEnd: 'none',
        borderStartEndRadius: token.borderRadius,
        borderEndEndRadius: token.borderRadius
      };
    } else {
      return baseStyle;
    }
  };

  const eraseMenuButtons = [
    { tooltip: 'Pincel 8 px', icon: <ClearOutlined style={{ fontSize: 12 }}/> },
    { tooltip: 'Pincel 16 px', icon: <ClearOutlined /*style={{ fontSize: 25 }}*//>,
      style: {
        borderInlineEnd: `1px solid ${token.colorSplit}`, // Borda direita
      }
    },
    { tooltip: 'Sub Action 3', icon: <ExperimentOutlined /> },
    { tooltip: 'Sub Action 4', icon: <CloseSquareOutlined /> }
  ];

  const collisionMenuButtons = [
    { tooltip: 'Sub Action 1', icon: <InsertRowAboveOutlined /> },
    { tooltip: 'Sub Action 2', icon: <InsertRowAboveOutlined /> },
    { tooltip: 'Sub Action 3', icon: <InsertRowAboveOutlined /> },
    { tooltip: 'Sub Action 4', icon: <InsertRowAboveOutlined /> },
    { tooltip: 'Sub Action 5', icon: <InsertRowAboveOutlined /> }
  ];

  const colorizeMenuButtons = [
    { tooltip: 'Sub Action 1', icon: <AccountBookFilled /> },
    { tooltip: 'Sub Action 2', icon: <AccountBookFilled /> },
    { tooltip: 'Sub Action 3', icon: <BgColorsOutlined /> },
    { tooltip: 'Sub Action 4', icon: <SelectOutlined /> },
    { tooltip: 'Sub Action 5', icon: <FormatPainterOutlined /> },
    { tooltip: 'Sub Action 6', icon: <FormatPainterOutlined /> }
  ];

  const [notification, setNotification] = useState<boolean>(true);

  return (
    <>
    <FloatButton.Group
      shape="square"
      style={columnButtonStyle}
    >      
       <FloatButton
        tooltip={<div>Select (v)</div>}
        icon={<EditOutlined style={{ /*fontSize: '40px',*/ color: activeButton === 'select' ? token.colorPrimary : token.colorTextBase }} />}
        style={{ ...baseButtonStyle, backgroundColor: activeButton === 'select' ? token.colorPrimary : token.colorBgElevated }}
        onClick={() => handleButtonClick('select')}
      />
      <Dropdown overlay={menu} trigger={['click']} >
        <FloatButton
          badge={{ showZero: false, dot: notification, count: numberNofity, color: token.colorInfo }}
          tooltip={<div>Add (a)</div>}
          icon={<AppstoreAddOutlined style={{ color: activeButton === 'add' ? token.colorPrimary : token.colorTextBase }}/>}
          style={{ ...baseButtonStyle, backgroundColor: activeButton === 'add' ? token.colorPrimary : token.colorBgElevated }}
          onMouseOver={() => setNotification(false)}
          onMouseLeave={() => setNotification(true)}
        />
      </Dropdown>
      <FloatButton
        tooltip={<div>Eraser (e)</div>}
        icon={<ClearOutlined style={{ color: activeButton === 'eraser' ? token.colorPrimary : token.colorTextBase }}/>}
        style={{ ...baseButtonStyle, backgroundColor: activeButton === 'eraser' ? token.colorPrimary : token.colorBgElevated }}
        onClick={() => handleButtonClick('eraser')}
      />
      <FloatButton
        tooltip={<div>Collisions (c)</div>}
        icon={<InsertRowAboveOutlined style={{ color: activeButton === 'collisions' ? token.colorPrimary : token.colorTextBase }}/>}
        style={{ ...baseButtonStyle, backgroundColor: activeButton === 'collisions' ? token.colorPrimary : token.colorBgElevated }}
        onClick={() => handleButtonClick('collisions')}
      />
      <FloatButton
        tooltip={<div>Colorize (Z)</div>}
        icon={<FormatPainterOutlined style={{ color: activeButton === 'colorize' ? token.colorPrimary : token.colorTextBase }}/>}
        style={{ ...baseButtonStyle, backgroundColor: activeButton === 'colorize' ? token.colorPrimary : token.colorBgElevated }}
        onClick={() => handleButtonClick('colorize')}
      />
     
    </FloatButton.Group>

    {eraseMenu && (
      <FloatButton.Group shape="square" /*trigger="click"*/ style={subMenuStyle}>
        {eraseMenuButtons.map((button, index) => (
          <FloatButton 
            key={index} 
            tooltip={<div>{button.tooltip}</div>} 
            icon={button.icon} 
            style={applyButtonStyles(index, eraseMenuButtons.length, horizontalButtonStyle)}/>
        ))}
      </FloatButton.Group>
    )}

    {collisionMenu && (
      <FloatButton.Group shape="square" /*trigger="click"*/ style={subMenuStyle}>
        {collisionMenuButtons.map((button, index) => (
          <FloatButton 
            key={index} 
            tooltip={<div>{button.tooltip}</div>} 
            icon={button.icon} 
            style={applyButtonStyles(index, collisionMenuButtons.length, horizontalButtonStyle)}/>
        ))}
      </FloatButton.Group>
    )}

    {colorizeMenu && (
      <FloatButton.Group shape="square" /*trigger="click"*/ style={subMenuStyle}>
        {colorizeMenuButtons.map((button, index) => (
          <FloatButton 
            key={index} 
            tooltip={<div>{button.tooltip}</div>} 
            icon={button.icon} 
            style={applyButtonStyles(index, colorizeMenuButtons.length, horizontalButtonStyle)}/>
        ))}
      </FloatButton.Group>
    )}
  </>
)
};

export default FloatButttonsGW;