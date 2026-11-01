import { isModalOpen } from '@/utils/isModalOpen';
import useAppContexts from '@/providers/contexts/AppContexts';
import { LayoutFilled } from '@ant-design/icons';
import { Dropdown, FloatButton, Popover, Row, Tooltip } from 'antd';
import React, { CSSProperties, useEffect, useState } from 'react';
import { AntdToken } from './common/AntDToken';

const FLOAT_BUTTON_SIZE = 50;
const FLOAT_MENU_GAP = 8;
const FLOAT_SUBMENU_OFFSET = FLOAT_BUTTON_SIZE + FLOAT_MENU_GAP;

export enum SubMenuType {
  TOOLTIP = 'tooltip',
  POPOVER = 'popover',
  DROPDOWN = 'dropdown',
}

export interface IActions {
  key: string;
  type?: SubMenuType;
  icon: React.ReactNode;
  iconSize?: number;
  tooltip?: string;
  active?: boolean;
  disabled?: boolean;
  preserveActiveTool?: boolean;
  selectOnly?: boolean;
  onClick?: () => void;
  subMenu?: {
    type?: SubMenuType;
    items: {
      key: string;
      icon: React.ReactNode;
      iconSize?: number;
      tooltip?: string;
      active?: boolean;
      disabled?: boolean;
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
  floatingPosition?: { left: number; top: number };
}

const FloatButttons: React.FC<IFloatButttons> = ({ actions, onResetPanelSize, onShowFloatButton, showFloatButton, floatingPosition/*, updateActiveSubButton */}) => {
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

  const handleActionClick = (action: IActions) => {
    if (action.selectOnly) {
      handleButtonClick(action.key);
      return;
    }
    if (action.preserveActiveTool) {
      action.onClick?.();
      return;
    }
    // A tool with variants is immediately usable on its first variant. This
    // avoids entering erase/collision/colorize with no brush selected.
    const firstSubAction = action.subMenu?.items[0];
    handleButtonClick(action.key, firstSubAction?.key);
    firstSubAction?.onClick();
    action.onClick?.();
  };

  // Every shortcut shown as `(x)` in a tooltip is actionable from the
  // keyboard as well. Keeping this here makes the convention consistent for
  // every floating toolbar.
  useEffect(() => {
    const getShortcut = (tooltip?: string) => tooltip?.match(/\(([^)]+)\)/)?.[1]?.toLowerCase();
    const onKeyDown = (event: KeyboardEvent) => {
      if (isModalOpen()) return;
      if (event.ctrlKey || event.metaKey || event.altKey || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      const key = event.key.toLowerCase();
      for (const action of actions) {
        if (!action.disabled && getShortcut(action.tooltip) === key) {
          event.preventDefault();
          handleActionClick(action);
          return;
        }
        const subItem = action.subMenu?.items.find(item => !item.disabled && getShortcut(item.tooltip) === key);
        if (subItem) {
          event.preventDefault();
          handleButtonClick(action.key, subItem.key);
          subItem.onClick?.();
          return;
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [actions]);

  const columnButtonStyle: CSSProperties = {
    position: 'absolute',
    insetBlockStart: '15px', // Alinha ao topo do contêiner
    insetBlockEnd: 'auto', // Alinha ao final do Block
    insetInlineStart: '15px', // Alinha à esquerda do contêiner
    insetInlineEnd: 'auto', // Alinha ao final do Inline
    ...(floatingPosition ? {
      position: 'fixed' as const,
      insetBlockStart: `var(--gba-world-top, ${floatingPosition.top}px)`,
      insetInlineStart: `var(--gba-world-left, ${floatingPosition.left}px)`,
    } : {}),
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
    position: floatingPosition ? 'fixed' : 'absolute',
    insetBlockStart: floatingPosition ? `var(--gba-world-top, ${floatingPosition.top}px)` : 15,
    insetBlockEnd: 'auto',
    insetInlineStart: floatingPosition ? `calc(var(--gba-world-left, ${floatingPosition.left}px) + ${FLOAT_SUBMENU_OFFSET}px)` : 15 + FLOAT_SUBMENU_OFFSET,
    insetInlineEnd: 'auto',
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
              aria-label={action.tooltip}
              disabled={action.disabled}
              badge={ 
                action.active && action.type === SubMenuType.DROPDOWN ? 
                  { showZero: false, dot: notification, count: numberNofity, color: token.colorInfo } : undefined 
              }
              onMouseOver={() => setNotification(false)}
              onMouseLeave={() => setNotification(true)}
              icon={React.isValidElement(action.icon) ? React.cloneElement(action.icon, { style: { ...baseIconStyle(action.iconSize) } }) : action.icon }
              onClick={ () => {
                if (action.disabled) return;
                action.type !== SubMenuType.DROPDOWN ? 
                (
                  handleActionClick(action)
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
                placement="rightTop"
                align={{ offset: [-24, 0] }}
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
                  disabled: action.disabled || subItems.disabled,
                  onClick: () => {
                    if (action.disabled || subItems.disabled) return;
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
            aria-label="Restore navigator panel"
            tooltip="Reopen the navigator panel"
            style={{ ...baseButtonStyle, borderBlockStart: `1px solid ${token.colorSplit}` }}
            icon={<LayoutFilled style={{ ...baseIconStyle(), }} />}
            onClick={() => { onResetPanelSize?.(); onShowFloatButton?.(false); }} // Voltar ao tamanho original
          />
        )}
      </FloatButton.Group>

      {/* Renderiza submenus */}
      {actions.map(action =>
        action.active && action.subMenu?.type && action.subMenu.type !== SubMenuType.DROPDOWN && action.subMenu ? (
          <FloatButton.Group key={action.key} shape="square" style={subMenuStyle}>
            {action.subMenu.items.map((subItem, index)  => {
              const subBtn = (
                <FloatButton
                  key={subItem.key}
                  aria-label={subItem.tooltip}
                  disabled={subItem.disabled}
                  icon={React.isValidElement(subItem.icon) ? React.cloneElement(subItem.icon, { style: { ...baseIconStyle(subItem.iconSize) } }) : action.icon }
                  onClick={() => {
                    if (subItem.disabled) return;
                    handleButtonClick(action.key, subItem.key);
                    subItem.onClick?.();
                  }}
                  style={{
                    ...applyFormatButtonStyles(index, action.subMenu?.items.length || 0, horizontalButtonStyle),
                    borderInlineEnd: subItem.separator? `1px solid ${token.colorSplit}` : '',
                    backgroundColor: subItem.active? token.colorPrimary : token.colorBgElevated,
                    opacity: subItem.disabled ? 0.45 : 1,
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
