import React, { CSSProperties, useState } from 'react';
import { AccountBookFilled, AppstoreAddOutlined, AppstoreFilled, AuditOutlined, BgColorsOutlined, BlockOutlined, BorderBottomOutlined, BorderInnerOutlined, BorderLeftOutlined, BorderOutlined, ClearOutlined, CloseSquareOutlined, EditFilled, EditOutlined, ExpandOutlined, ExperimentFilled, ExperimentOutlined, ExperimentTwoTone, FormatPainterFilled, FormatPainterOutlined, InsertRowAboveOutlined, LayoutFilled, LayoutOutlined, LineChartOutlined, OneToOneOutlined, PicLeftOutlined, PictureFilled, PictureOutlined, PlusSquareFilled, PlusSquareOutlined, SelectOutlined, VerticalAlignMiddleOutlined, XFilled } from '@ant-design/icons';
import { FloatButton, ConfigProviderProps, Menu, Dropdown, Row, Flex, Splitter, Popover, Tooltip, Tag } from 'antd';
import { AntdToken } from '../components/common/AntDToken.ts';
import { title } from 'process';
import { TooltipProps } from 'antd/lib/index';

const FloatButttonsGW: React.FC<{ onResetPanelSize: () => void, onShowFloatButton: (show: boolean) => void, showFloatButton}> = ({ onResetPanelSize, onShowFloatButton, showFloatButton }) => {
  const { token } = AntdToken();
  
  const [activeButton, setActiveButton] = useState('select');
  const [activeSubButton, setActiveSubButton] = useState<String|number>('0');

  const [numberNofity, setNumberNofity] = useState<String|number>('0');

  const handleButtonClick = (buttonId, key?) => {
    setActiveSubButton(key? key : activeSubButton);
    
    if (key) {
      setNumberNofity(key);
      handleSubMenuClick(key? key : activeSubButton);
    } else {
      setNumberNofity(0);
    }

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

    setActiveButton(buttonId);
  };

  // Menus Superiores
  const [eraseMenu, setEraseMenu] = useState<boolean>(false);
  const [collisionMenu, setCollisionMenu] = useState<boolean>(false);
  const [colorizeMenu, setColorizeMenu] = useState<boolean>(false);

  const handleSubMenuClick = (buttonKey) => {
    console.log("..: Entrando no handleSubMenuClick:", buttonKey);
    setActiveSubButton(buttonKey)
  };

  const columnButtonStyle: CSSProperties = {
    position: 'absolute',
    insetBlockStart: '15px', // Alinha ao topo do contêiner
    insetBlockEnd: 'auto', // Alinha ao final do Block
    insetInlineStart: '15px', // Alinha à esquerda do contêiner
    insetInlineEnd: 'auto', // Alinha ao final do Inline
  };

  const baseIconStyle = (fontSize?: number): CSSProperties => {
    return {
      display: 'grid', 
      justifyContent: 'center', 
      fontSize: fontSize? fontSize : '30px', 
    }
  };

  const baseButtonStyle = {
    borderBlock: 'none', // Remover Borda inferior
    paddingLeft: 0,
    paddingRight: 0,
  };

  const horizontalButtonStyle = {
    ... baseButtonStyle,
    borderRadius: 0, // Retira o border radius
  };

  const subMenuStyle: CSSProperties = {
    ...columnButtonStyle, 
    insetInlineStart: '100px', // Alinha à esquerda do cont êiner
    flexDirection: 'row',  // Menu em Horizontal
  };
  
  const applyFormatButtonStyles = (index: number, total: number, baseStyle: CSSProperties): CSSProperties => {
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

  const menu = (
    <Menu onClick={({ key }) => handleButtonClick('add', key)} style={{ marginLeft: 45, marginTop: -30 }}>
      <Menu.Item key="Actor" style={{ backgroundColor: activeSubButton === 'Actor' ? token.colorPrimary : 'transparent' }}>
        <Tooltip placement="rightTop" title={'Add Actor(a)'} color={token.colorBorder} >
          <Row>
            <AuditOutlined style={{ ...baseIconStyle(24), marginRight: 8 }} />
            Actor
          </Row>
        </Tooltip>
      </Menu.Item>
      <Menu.Item key="Trigger" style={{ backgroundColor: activeSubButton === 'Trigger' ? token.colorPrimary : 'transparent' }}>
        <Tooltip placement="right" title={'Add Trigger(t)'} color={token.colorBorder}>
          <Row>
            <PlusSquareFilled style={{ ...baseIconStyle(24), marginRight: 8 }} />
            Trigger
          </Row>
        </Tooltip>
      </Menu.Item>
      <Menu.Item key="Scene" style={{ backgroundColor: activeSubButton === 'Scene' ? token.colorPrimary : 'transparent' }}>
        <Tooltip placement="rightBottom" title={'Add Scene(s)'} color={token.colorBorder}>
          <Row>
            <PictureFilled style={{ ...baseIconStyle(24), marginRight: 8 }} />
            Scene
          </Row>
        </Tooltip>
      </Menu.Item>
    </Menu>
  );

  const eraseMenuButtons = [
    { tooltip: 'Pincel 8 px', icon: <div style={{ ...baseIconStyle(24), }}>■</div>,  
      
    },
    { tooltip: 'Pincel 16 px', icon: <div style={{ ...baseIconStyle(36), }}>■</div>, 
      // style: { backgroundColor: activeButton === 'eraser' ? token.colorPrimary : token.colorBgElevated },
     },
    { tooltip: 'Sub Action 3', icon: <ExperimentOutlined style={{ ...baseIconStyle(), }}/>,
      style: { 
        borderInlineEnd: `1px solid ${token.colorSplit}`, // Borda direita
      }
    },
    { tooltip: 'Sub Action 4', icon: <CloseSquareOutlined style={{ ...baseIconStyle(), }}/> }
  ];

  const collisionMenuButtons = [
    { tooltip: 'Sub Action 1', icon: <ExpandOutlined style={{ ...baseIconStyle(24), }}/>, },
    { tooltip: 'Sub Action 2', icon: <ExpandOutlined style={{ ...baseIconStyle(), }}/> },
    { tooltip: 'Sub Action 3', icon: <VerticalAlignMiddleOutlined style={{ ...baseIconStyle(), }}/> },
    { tooltip: 'Sub Action 4', icon: <PicLeftOutlined style={{ ...baseIconStyle(), }}/>, style: { borderInlineEnd: `1px solid ${token.colorSplit}` } },
    { tooltip: 'Sub Action 5', icon: <BlockOutlined style={{ ...baseIconStyle(), }}/> }
  ];

  const colorizeMenuButtons = [
    { tooltip: 'Sub Action 1', icon: <ExpandOutlined style={{ ...baseIconStyle(24) }}/> },
    { tooltip: 'Sub Action 2', icon: <ExpandOutlined style={{ ...baseIconStyle(), }}/> },
    { tooltip: 'Sub Action 3', icon: <BgColorsOutlined style={{ ...baseIconStyle(), }}/> },
    { tooltip: 'Sub Action 5', icon: <FormatPainterOutlined style={{ ...baseIconStyle(), }}/> },
    { tooltip: 'Sub Action 4', icon: <SelectOutlined style={{ ...baseIconStyle(), }}/>, style: { borderInlineEnd: `1px solid ${token.colorSplit}` } },
    { tooltip: 'Sub Action 6', icon: <FormatPainterOutlined style={{ ...baseIconStyle(), }}/> },
    { tooltip: 'Sub Action 7', icon: <BorderInnerOutlined style={{ ...baseIconStyle(), }}/> }
  ];

  const [notification, setNotification] = useState<boolean>(true);

  return (
    <>
    <FloatButton.Group
      shape="square"
      style={columnButtonStyle}
    >      
      <Tooltip placement="right" title={'Select (v)'} color={token.colorBorder} >
        <FloatButton
          // tooltip={'Select (v)'} 
          icon={<EditFilled style={{ ...baseIconStyle()/*, color: activeButton === 'select' ? token.colorPrimary : token.colorTextBase */}} />}
          style={{ ...baseButtonStyle, backgroundColor: activeButton === 'select' ? token.colorPrimary : token.colorBgElevated, }}
          onClick={() => handleButtonClick('select')}
        />
      </Tooltip>
      <Tooltip >
        <Dropdown overlay={menu} trigger={['click']} >
          <FloatButton
            badge={{ showZero: false, dot: notification, count: numberNofity, color: token.colorInfo }}
            // tooltip={'Add (a)'}
            icon={<AppstoreAddOutlined style={{ ...baseIconStyle() }}/>}
            style={{ ...baseButtonStyle, backgroundColor: activeButton === 'add' ? token.colorPrimary : token.colorBgElevated }}
            onMouseOver={() => setNotification(false)}
            onMouseLeave={() => setNotification(true)}
          />
        </Dropdown>
      </Tooltip>
      <Tooltip placement="right" title={'Eraser (e)'} color={token.colorBorder} >
        <FloatButton
          // tooltip={'Eraser (e)'}
          icon={<ClearOutlined style={{ ...baseIconStyle()/*, color: activeButton === 'eraser' ? token.colorPrimary : token.colorTextBase */}}/>}
          style={{ ...baseButtonStyle, backgroundColor: activeButton === 'eraser' ? token.colorPrimary : token.colorBgElevated,}}
          onClick={() => handleButtonClick('eraser')}
        />
      </Tooltip>
      <Tooltip placement="right" title={'Collisions (c)'} color={token.colorBorder} >
        <FloatButton
          // tooltip={'Collisions (c)'}
          icon={<InsertRowAboveOutlined style={{ ...baseIconStyle()/*, color: activeButton === 'collisions' ? token.colorPrimary : token.colorTextBase*/ }}/>}
          style={{ ...baseButtonStyle, backgroundColor: activeButton === 'collisions' ? token.colorPrimary : token.colorBgElevated }}
          onClick={() => handleButtonClick('collisions')}
        />
      </Tooltip>
      <Tooltip placement="right" title={'Colorize (z)'} color={token.colorBorder} >
        <FloatButton
          // tooltip={'Colorize (Z)'}
          icon={<FormatPainterFilled style={{ ...baseIconStyle()/*, color: activeButton === 'colorize' ? token.colorPrimary : token.colorTextBase*/ }}/>}
          style={{ ...baseButtonStyle, backgroundColor: activeButton === 'colorize' ? token.colorPrimary : token.colorBgElevated }}
          onClick={() => handleButtonClick('colorize')}
        />
      </Tooltip>

      {showFloatButton && (
        <FloatButton
          shape="square"
          style={{ ...baseButtonStyle, borderBlockStart: `1px solid ${token.colorSplit}` }}
          icon={<LayoutFilled style={{ ...baseIconStyle(), }}/>}
          onClick={() => { onResetPanelSize(); onShowFloatButton(false); }} // Voltar ao tamanho original
        />
      )}
     
    </FloatButton.Group>

    {eraseMenu && (
     
      <FloatButton.Group shape="square" /*trigger="click"*/ style={subMenuStyle}>
        {eraseMenuButtons.map((button, index) => (
          <Popover placement="bottom" content={button.tooltip} >
            <FloatButton 
              key={index} 
              // tooltip={<div>{button.tooltip}</div>} 
              icon={button.icon} 
              onClick={() => handleSubMenuClick(index)}
              style={{ ...applyFormatButtonStyles(index, eraseMenuButtons.length, horizontalButtonStyle), ...button.style, 
                backgroundColor: activeButton === 'eraser' && activeSubButton === index ? token.colorPrimary : token.colorBgElevated 
              }}
            />
          </Popover>
        ))}
      </FloatButton.Group>
    )}

    {collisionMenu && (
      <FloatButton.Group shape="square" /*trigger="click"*/ style={subMenuStyle}>
        {collisionMenuButtons.map((button, index) => (
          <Popover placement="bottom" content={button.tooltip} >
            <FloatButton 
              key={index} 
              // tooltip={<div>{button.tooltip}</div>} 
              icon={button.icon} 
              onClick={() => handleSubMenuClick(index)}
              style={{ ...applyFormatButtonStyles(index, collisionMenuButtons.length, horizontalButtonStyle), ...button.style,
                backgroundColor: activeButton === 'collisions' && activeSubButton === index ? token.colorPrimary : token.colorBgElevated 
              }}
            />
          </Popover>
        ))}
      </FloatButton.Group>
    )}

    {colorizeMenu && (
      <FloatButton.Group shape="square" /*trigger="click"*/ style={subMenuStyle}>
        {colorizeMenuButtons.map((button, index) => (
          <Tooltip placement="bottom" title={button.tooltip} color={token.colorBorder} >
            <FloatButton 
              key={index} 
              // tooltip={<div>{button.tooltip}</div>} 
              icon={button.icon} 
              onClick={() => handleSubMenuClick(index)}
              style={{ ...applyFormatButtonStyles(index, colorizeMenuButtons.length, horizontalButtonStyle), ...button.style,
                backgroundColor: activeButton === 'colorize' && activeSubButton === index ? token.colorPrimary : token.colorBgElevated 
              }}
            />
          </Tooltip>
        ))}
      </FloatButton.Group>
    )}
  </>
)
};

export default FloatButttonsGW;