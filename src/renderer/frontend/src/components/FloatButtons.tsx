import useAppContexts from '@/providers/contexts/AppContexts';
import { LayoutFilled } from '@ant-design/icons';
import { Dropdown, FloatButton, Popover, Row, Tooltip } from 'antd';
import React, { CSSProperties, useEffect, useState } from 'react';
import { AntdToken } from './common/AntDToken';

enum SubMenuType {
  TOOLTIP = 'tooltip',
  POPOVER = 'popover',
  DROPDOWN = 'dropdown',
}

interface IActions {
  key: string;
  type?: SubMenuType;
  icon: React.ReactNode;
  iconSize?: number;
  tooltip?: string;
  active?: boolean;
  onClick?: () => void;
  subMenu?: {
    type?: SubMenuType;
    items: {
      key: string;
      icon: React.ReactNode;
      iconSize?: number;
      tooltip?: string;
      active?: boolean;
      separator?: boolean;
      onClick: () => void;
    }[];
  };
}

interface IFloatButttons {
  actions: IActions[];
  activeButton?: string;
  onResetPanelSize?: () => void;
  onShowFloatButton?: (show: boolean) => void;
  showFloatButton?: boolean;
}

const FloatButttons: React.FC<IFloatButttons> = ({ actions, onResetPanelSize, onShowFloatButton, showFloatButton/*, updateActiveSubButton */}) => {
  const { token } = AntdToken();

  // const [activeButton, setActiveButton] = useState('select');
  // const [activeButtons, setActiveButtons] = useState<IActiveButtons>({activeButton: 'select', activeSubButton: ''});

  const { settingUtils, setSettingUtils } = useAppContexts();
  const [numberNofity, setNumberNofity] = useState<string | number>('0');
  const [notification, setNotification] = useState<boolean>(true);

  useEffect(() => {
    if (settingUtils) {
      handleButtonClick(settingUtils.activeButton, settingUtils.activeSubButton);
    }
    console.log('..: handleButtonClick ActiveButtons:', settingUtils.activeButton, settingUtils.activeSubButton);
  }, [settingUtils.activeButton, settingUtils.activeSubButton]);

  const handleButtonClick = (activeButtonKey: number | string, subButtonKey?: number | string) => {
    if (subButtonKey && typeof subButtonKey === 'string') {
      setNumberNofity(subButtonKey);
    } else {
      setNumberNofity(0);
    }

    setSettingUtils(prev => ({
      ...prev, 
      activeButton: activeButtonKey, 
      activeSubButton: subButtonKey ? subButtonKey : 0
    }));
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
      fontSize: fontSize ? fontSize : '30px',
    }
  };

  const baseButtonStyle = {
    borderBlock: 'none', // Remover Borda inferior
    paddingLeft: 0,
    paddingRight: 0,
    zIndex: 1000,
  };

  const horizontalButtonStyle = {
    ...baseButtonStyle,
    borderRadius: 0, // Retira o border radius
  };

  const subMenuStyle: CSSProperties = {
    ...columnButtonStyle,
    insetInlineStart: '100px', // Alinha à esquerda do contêiner
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

  return (
    <>
      <FloatButton.Group 
        shape="square" 
        style={columnButtonStyle}
      >
        {/* Renderiza menus */}
        {actions.map((action, index) => {
          const btn = (
            <FloatButton
              badge={ 
                action.active && action.type === SubMenuType.DROPDOWN ? 
                  { showZero: false, dot: notification, count: numberNofity, color: token.colorInfo } : undefined 
              }
              onMouseOver={() => setNotification(false)}
              onMouseLeave={() => setNotification(true)}
              icon={React.isValidElement(action.icon) ? React.cloneElement(action.icon, { style: { ...baseIconStyle(action.iconSize) } }) : action.icon }
              onClick={ () => {
                action.type !== SubMenuType.DROPDOWN ? 
                (
                  handleButtonClick(action.key),
                  action.onClick?.()
                ) : 
                undefined
              }}
              style={{
                ...baseButtonStyle,
                backgroundColor: action.active ? token.colorPrimary : token.colorBgElevated,
              }}
            />
          );

          {/* Opção DROPDOWN */}
          if (action.type === SubMenuType.DROPDOWN) {
            return (
              <Dropdown 
                key={action.key}
                menu={{ items: action.subMenu?.items.map(subItems => ({
                  key: subItems.key, 
                  label: (
                    <Tooltip placement="rightTop" title={subItems.tooltip} color={token.colorBorder}>
                      <Row>
                        {React.isValidElement(subItems.icon) ? React.cloneElement(subItems.icon, { style: { ...baseIconStyle(action.iconSize), marginRight: 8 } }) : action.icon }
                        <>{subItems.key}</>
                      </Row>
                    </Tooltip>
                  ),
                  style: { backgroundColor: subItems.active ? token.colorPrimary : 'transparent' },
                  onClick: () => {
                    handleButtonClick(action.key, subItems.key);
                    subItems.onClick?.();
                  }
                  })) 
                }}
                trigger={['click']}
              >
                {btn}
              </Dropdown>
            );
          }
            
          {/* Outras Opções */}
          return (
            <Tooltip placement="right" key={action.key} title={action.tooltip} color={token.colorBorder}>
              {btn}
            </Tooltip>
          );
        })}

        {showFloatButton && (
          <FloatButton
            shape="square"
            style={{ ...baseButtonStyle, borderBlockStart: `1px solid ${token.colorSplit}` }}
            icon={<LayoutFilled style={{ ...baseIconStyle(), }} />}
            onClick={() => { onResetPanelSize?.(); onShowFloatButton?.(false); }} // Voltar ao tamanho original
          />
        )}
      </FloatButton.Group>

      {/* Renderiza submenus */}
      {actions.map(action =>
        action.active && action.subMenu?.type && action.subMenu ? (
          <FloatButton.Group key={action.key} shape="square" style={subMenuStyle}>
            {action.subMenu.items.map((subItem, index)  => {
              const subBtn = (
                <FloatButton
                  key={subItem.key}
                  icon={React.isValidElement(subItem.icon) ? React.cloneElement(subItem.icon, { style: { ...baseIconStyle(subItem.iconSize) } }) : action.icon }
                  onClick={() => {
                    handleButtonClick(action.key, subItem.key);
                    subItem.onClick?.();
                  }}
                  style={{
                    ...applyFormatButtonStyles(index, action.subMenu?.items.length || 0, horizontalButtonStyle),
                    borderInlineEnd: subItem.separator? `1px solid ${token.colorSplit}` : '',
                    backgroundColor: subItem.active? token.colorPrimary : token.colorBgElevated
                  }}
                />
              );

              {/* Opção POPOVER */}
              if (action.subMenu?.type === SubMenuType.POPOVER) {
                return (
                  <Popover key={subItem.key} content={subItem.tooltip}>
                    {subBtn}
                  </Popover>
                );
              }

              {/* Opção DROPDOWN */}
              // if (action.subMenu?.type === SubMenuType.DROPDOWN) {
              //   return (
              //     <Dropdown menu={menu} trigger={['click']}>
              //       {subBtn}
              //     </Dropdown>
              //   );
              // }

              {/* Opção TOOLTIP */}
              if (action.subMenu?.type === SubMenuType.TOOLTIP) {
                return (
                  <Tooltip key={subItem.key} title={subItem.tooltip} color={token.colorBorder}>
                    {subBtn}
                  </Tooltip>
                );
              }
            })}
          </FloatButton.Group>
        ) : null
      )}
    </>
  )
};

export default FloatButttons;