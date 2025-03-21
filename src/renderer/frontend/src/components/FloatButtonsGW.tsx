import React, { CSSProperties, Dispatch, SetStateAction, useEffect, useState } from 'react';
import { AppstoreAddOutlined, AuditOutlined, BgColorsOutlined, BlockOutlined, BorderInnerOutlined, ClearOutlined, CloseSquareOutlined, EditFilled, ExpandOutlined, ExperimentOutlined, FormatPainterFilled, FormatPainterOutlined, InsertRowAboveOutlined, LayoutFilled, PicLeftOutlined, PictureFilled, PlusSquareFilled, SelectOutlined, VerticalAlignMiddleOutlined, } from '@ant-design/icons';
import { FloatButton, Dropdown, Row, Popover, Tooltip } from 'antd';
import { AntdToken } from '../components/common/AntDToken';

interface IActiveButtons {
  activeButton: string | number;
  activeSubButton: string | number;
}

interface IFloatButttonsGW {
  onResetPanelSize: () => void;
  onShowFloatButton: (show: boolean) => void;
  showFloatButton: boolean;
  updateActiveSubButton: Dispatch<SetStateAction<IActiveButtons>>;
}

const FloatButttonsGW: React.FC<IFloatButttonsGW> = ({ onResetPanelSize, onShowFloatButton, showFloatButton, updateActiveSubButton }) => {
  const { token } = AntdToken();

  // const [activeButton, setActiveButton] = useState('select');
  const [activeButtons, setActiveButtons] = useState<IActiveButtons>({activeButton: 'select', activeSubButton: ''});
  const [numberNofity, setNumberNofity] = useState<string | number>('0');

  useEffect(() => {
    if (activeButtons) {
      updateActiveSubButton(activeButtons);
    }
  }, [activeButtons]);

  const handleButtonClick = (activeButtonKey: number | string, subButtonKey?: number | string) => {
    setEraseMenu(false);
    setCollisionMenu(false);
    setColorizeMenu(false);

    switch (activeButtonKey) {
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

    const selectionOptins = ['Actor','Trigger', 'Scene'];
    if (subButtonKey && typeof subButtonKey === 'string') {
      setNumberNofity(selectionOptins.includes(subButtonKey) ? selectionOptins.find((listOptions) => listOptions === subButtonKey) || 0 : 0);
    } else {
      setNumberNofity(0);
    }

    setActiveButtons({ activeButton: activeButtonKey, activeSubButton: subButtonKey ? subButtonKey : 0 });
  };

  // Menus Superiores
  const [eraseMenu, setEraseMenu] = useState<boolean>(false);
  const [collisionMenu, setCollisionMenu] = useState<boolean>(false);
  const [colorizeMenu, setColorizeMenu] = useState<boolean>(false);

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
      fontSize: fontSize ? fontSize : '30px',
    }
  };

  const baseButtonStyle = {
    borderBlock: 'none', // Remover Borda inferior
    paddingLeft: 0,
    paddingRight: 0,
  };

  const horizontalButtonStyle = {
    ...baseButtonStyle,
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

  // Criação do menu usando o formato compatível com MenuProps
  const menuItems = [
    {
      key: 'Actor',
      label: (
        <Tooltip placement="rightTop" title={'Add Actor(a)'} color={token.colorBorder}>
          <Row>
            <AuditOutlined style={{ ...baseIconStyle(24), marginRight: 8 }} />
            Actor
          </Row>
        </Tooltip>
      ),
      style: { backgroundColor: activeButtons?.activeButton === 'Actor' ? token.colorPrimary : 'transparent' },
    },
    {
      key: 'Trigger',
      label: (
        <Tooltip placement="right" title={'Add Trigger(t)'} color={token.colorBorder}>
          <Row>
            <PlusSquareFilled style={{ ...baseIconStyle(24), marginRight: 8 }} />
            Trigger
          </Row>
        </Tooltip>
      ),
      style: { backgroundColor: activeButtons?.activeButton === 'Trigger' ? token.colorPrimary : 'transparent' },
    },
    {
      key: 'Scene',
      label: (
        <Tooltip placement="rightBottom" title={'Add Scene(s)'} color={token.colorBorder}>
          <Row>
            <PictureFilled style={{ ...baseIconStyle(24), marginRight: 8 }} />
            Scene
          </Row>
        </Tooltip>
      ),
      style: { backgroundColor: activeButtons?.activeButton === 'Scene' ? token.colorPrimary : 'transparent' },
    },
  ];

  const menu = {
    items: menuItems,
    onClick: (event: any) => handleButtonClick('add', event.key),
  };

  const eraseMenuButtons = [
    {
      tooltip: 'Pincel 8 px', icon: <div style={{ ...baseIconStyle(24), }}>■</div>,

    },
    {
      tooltip: 'Pincel 16 px', icon: <div style={{ ...baseIconStyle(36), }}>■</div>,
      // style: { backgroundColor: activeButton === 'eraser' ? token.colorPrimary : token.colorBgElevated },
    },
    {
      tooltip: 'Sub Action 3', icon: <ExperimentOutlined style={{ ...baseIconStyle(), }} />,
      style: {
        borderInlineEnd: `1px solid ${token.colorSplit}`, // Borda direita
      }
    },
    { tooltip: 'Sub Action 4', icon: <CloseSquareOutlined style={{ ...baseIconStyle(), }} /> }
  ];

  const collisionMenuButtons = [
    { tooltip: 'Sub Action 1', icon: <ExpandOutlined style={{ ...baseIconStyle(24), }} />, },
    { tooltip: 'Sub Action 2', icon: <ExpandOutlined style={{ ...baseIconStyle(), }} /> },
    { tooltip: 'Sub Action 3', icon: <VerticalAlignMiddleOutlined style={{ ...baseIconStyle(), }} /> },
    { tooltip: 'Sub Action 4', icon: <PicLeftOutlined style={{ ...baseIconStyle(), }} />, style: { borderInlineEnd: `1px solid ${token.colorSplit}` } },
    { tooltip: 'Sub Action 5', icon: <BlockOutlined style={{ ...baseIconStyle(), }} /> }
  ];

  const colorizeMenuButtons = [
    { tooltip: 'Sub Action 1', icon: <ExpandOutlined style={{ ...baseIconStyle(24) }} /> },
    { tooltip: 'Sub Action 2', icon: <ExpandOutlined style={{ ...baseIconStyle(), }} /> },
    { tooltip: 'Sub Action 3', icon: <BgColorsOutlined style={{ ...baseIconStyle(), }} /> },
    { tooltip: 'Sub Action 5', icon: <FormatPainterOutlined style={{ ...baseIconStyle(), }} /> },
    { tooltip: 'Sub Action 4', icon: <SelectOutlined style={{ ...baseIconStyle(), }} />, style: { borderInlineEnd: `1px solid ${token.colorSplit}` } },
    { tooltip: 'Sub Action 6', icon: <FormatPainterOutlined style={{ ...baseIconStyle(), }} /> },
    { tooltip: 'Sub Action 7', icon: <BorderInnerOutlined style={{ ...baseIconStyle(), }} /> }
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
            icon={<EditFilled style={{ ...baseIconStyle()/*, color: activeButton === 'select' ? token.colorPrimary : token.colorTextBase */ }} />}
            style={{ ...baseButtonStyle, backgroundColor: activeButtons.activeButton === 'select' ? token.colorPrimary : token.colorBgElevated, }}
            onClick={() => handleButtonClick('select')}
          />
        </Tooltip>
        <Tooltip >
          <Dropdown menu={menu} trigger={['click']} >
            <FloatButton
              badge={{ showZero: false, dot: notification, count: numberNofity, color: token.colorInfo }}
              // tooltip={'Add (a)'}
              icon={<AppstoreAddOutlined style={{ ...baseIconStyle() }} />}
              style={{ ...baseButtonStyle, backgroundColor: activeButtons.activeButton === 'add' ? token.colorPrimary : token.colorBgElevated }}
              onMouseOver={() => setNotification(false)}
              onMouseLeave={() => setNotification(true)}
            />
          </Dropdown>
        </Tooltip>
        <Tooltip placement="right" title={'Eraser (e)'} color={token.colorBorder} >
          <FloatButton
            // tooltip={'Eraser (e)'}
            icon={<ClearOutlined style={{ ...baseIconStyle()/*, color: activeButton === 'eraser' ? token.colorPrimary : token.colorTextBase */ }} />}
            style={{ ...baseButtonStyle, backgroundColor: activeButtons.activeButton === 'eraser' ? token.colorPrimary : token.colorBgElevated, }}
            onClick={() => handleButtonClick('eraser')}
          />
        </Tooltip>
        <Tooltip placement="right" title={'Collisions (c)'} color={token.colorBorder} >
          <FloatButton
            // tooltip={'Collisions (c)'}
            icon={<InsertRowAboveOutlined style={{ ...baseIconStyle()/*, color: activeButton === 'collisions' ? token.colorPrimary : token.colorTextBase*/ }} />}
            style={{ ...baseButtonStyle, backgroundColor: activeButtons.activeButton === 'collisions' ? token.colorPrimary : token.colorBgElevated }}
            onClick={() => handleButtonClick('collisions')}
          />
        </Tooltip>
        <Tooltip placement="right" title={'Colorize (z)'} color={token.colorBorder} >
          <FloatButton
            // tooltip={'Colorize (Z)'}
            icon={<FormatPainterFilled style={{ ...baseIconStyle()/*, color: activeButton === 'colorize' ? token.colorPrimary : token.colorTextBase*/ }} />}
            style={{ ...baseButtonStyle, backgroundColor: activeButtons.activeButton === 'colorize' ? token.colorPrimary : token.colorBgElevated }}
            onClick={() => handleButtonClick('colorize')}
          />
        </Tooltip>

        {showFloatButton && (
          <FloatButton
            shape="square"
            style={{ ...baseButtonStyle, borderBlockStart: `1px solid ${token.colorSplit}` }}
            icon={<LayoutFilled style={{ ...baseIconStyle(), }} />}
            onClick={() => { onResetPanelSize(); onShowFloatButton(false); }} // Voltar ao tamanho original
          />
        )}

      </FloatButton.Group>

      {eraseMenu && (
        <FloatButton.Group shape="square" /*trigger="click"*/ style={subMenuStyle}>
          {eraseMenuButtons.map((button, index) => (
            <Popover key={index} placement="bottom" content={button.tooltip} >
              <FloatButton
                // tooltip={<div>{button.tooltip}</div>} 
                icon={button.icon}
                onClick={() => handleButtonClick('eraser', index)}
                style={{
                  ...applyFormatButtonStyles(index, eraseMenuButtons.length, horizontalButtonStyle), ...button.style,
                  backgroundColor: activeButtons.activeButton === 'eraser' && activeButtons.activeSubButton === index ? token.colorPrimary : token.colorBgElevated
                }}
              />
            </Popover>
          ))}
        </FloatButton.Group>
      )}

      {collisionMenu && (
        <FloatButton.Group shape="square" /*trigger="click"*/ style={subMenuStyle}>
          {collisionMenuButtons.map((button, index) => (
            <Popover key={index} placement="bottom" content={button.tooltip} >
              <FloatButton
                // tooltip={<div>{button.tooltip}</div>} 
                icon={button.icon}
                onClick={() => handleButtonClick('collisions', index)}
                style={{
                  ...applyFormatButtonStyles(index, collisionMenuButtons.length, horizontalButtonStyle), ...button.style,
                  backgroundColor: activeButtons.activeButton === 'collisions' && activeButtons.activeSubButton === index ? token.colorPrimary : token.colorBgElevated
                }}
              />
            </Popover>
          ))}
        </FloatButton.Group>
      )}

      {colorizeMenu && (
        <FloatButton.Group shape="square" /*trigger="click"*/ style={subMenuStyle}>
          {colorizeMenuButtons.map((button, index) => (
            <Tooltip key={index} placement="bottom" title={button.tooltip} color={token.colorBorder} >
              <FloatButton
                // tooltip={<div>{button.tooltip}</div>} 
                icon={button.icon}
                onClick={() => handleButtonClick('colorize', index)}
                style={{
                  ...applyFormatButtonStyles(index, colorizeMenuButtons.length, horizontalButtonStyle), ...button.style,
                  backgroundColor: activeButtons.activeButton === 'colorize' && activeButtons.activeSubButton === index ? token.colorPrimary : token.colorBgElevated
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