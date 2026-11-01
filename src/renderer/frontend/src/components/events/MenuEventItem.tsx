import { eventWarningMessage } from './eventWarningMessage';
import WarningIndicator from '../WarningIndicator';
import { IScriptsElement } from "@/providers/contexts/interfaces/ISceneElement";
import { ETypeScene } from '@/providers/contexts/interfaces/ISceneElement';
import useAppContexts from '@/providers/contexts/AppContexts';
import { ExpandAltOutlined, ShrinkOutlined, SettingOutlined, WarningOutlined } from "@ant-design/icons";
import { Button, Dropdown, Menu, theme, Tooltip } from "antd";
import { Content } from "antd/es/layout/layout";
import { useI18n } from '@/i18n/I18n';
import { copyEvent } from './eventClipboard';
import type { EventInsertionError } from './eventTree';

interface MenuEventItemProps {
  maximized?: boolean;
  onToggleMaximize?: (id: string) => void;
  event: IScriptsElement;
  events?: readonly IScriptsElement[];
  hasClipboard: boolean;
  pasteError?: EventInsertionError;
  onPaste: (id: string, position: 'before' | 'after') => void;
  onAdd: (id: string, position: 'before' | 'after') => void;
  onRemove: (id: string) => void;
	onDuplicate: (id: string) => void;
	onRename: (id: string) => void;
	onToggleDisable: (id: string) => void;
}

export default function MenuEventItem({ maximized, onToggleMaximize, event, events, onRemove, onDuplicate, onRename, onToggleDisable, hasClipboard, pasteError, onPaste, onAdd }: MenuEventItemProps) {
	const { t } = useI18n();
  const { token } = theme.useToken();
  const warningLabel = eventWarningMessage(event, t, events);
	const isDisabled = event.args?.__comment === true;
	const isAutomatic = event.args?.__automatic === true;
  const { elementSelected } = useAppContexts();
  const panCameraUnsupported = event.command === 'EVENT_PAN_CAMERA'
    && (elementSelected?.sceneType === ETypeScene.LOGO || elementSelected?.sceneType === ETypeScene.POINTNCLICK);

  const menu = (
    <Menu
      items={[
        {
          key: "disable",
          label: t(isDisabled ? 'events.organize.enable' : 'events.organize.disable'),
          onClick: (e) => {
            e.domEvent.stopPropagation();
            onToggleDisable(event.id);
          },
        },
        ...(!isAutomatic ? [
          {
            key: "rename",
            label: t('events.organize.rename'),
            onClick: (e: any) => {
              e.domEvent.stopPropagation();
              onRename(event.id);
            },
          },
          {
            key: "duplicate",
            label: t('events.organize.duplicate'),
            onClick: (e: any) => {
              e.domEvent.stopPropagation();
              onDuplicate(event.id);
            },
          },
        ] : []),
        {
          key: 'copy', label: t('events.organize.copy'),
          onClick: e => { e.domEvent.stopPropagation(); copyEvent(event); },
        },
        ...(hasClipboard ? (['before', 'after'] as const).map(position => ({
          key: `paste-${position}`,
          label: <Tooltip title={pasteError ? t(`events.organize.error.${pasteError}`) : undefined}><span>{t(position === 'before' ? 'events.organize.pasteBefore' : 'events.organize.pasteAfter')}</span></Tooltip>,
          disabled: Boolean(pasteError),
          onClick: (e: { domEvent: { stopPropagation: () => void } }) => { e.domEvent.stopPropagation(); onPaste(event.id, position); },
        })) : []),
        ...(['before', 'after'] as const).map(position => ({
          key: `add-${position}`,
          label: t(position === 'before' ? 'events.organize.addBefore' : 'events.organize.addAfter'),
          onClick: (e: { domEvent: { stopPropagation: () => void } }) => { e.domEvent.stopPropagation(); onAdd(event.id, position); },
        })),
        ...(!isAutomatic ? [
          {
            key: "remove",
            label: t('events.organize.delete'),
            onClick: (e: any) => {
              e.domEvent.stopPropagation();
              onRemove(event.id);
            },
          },
        ] : []),
      ]}
    />
  );

  return (
    <Content style={{ position: 'static', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 6, overflow: 'visible' }}>
      {warningLabel && <span style={{ position: 'absolute', top: 0, right: 0, zIndex: 5 }}><WarningIndicator message={warningLabel} onClick={event.command === 'EVENT_FADE_IN' && isDisabled ? () => onToggleDisable(event.id) : undefined} /></span>}
      {panCameraUnsupported && (
        <Tooltip title="Pan Camera is not supported for Logo and Point Click scenes in the current engine mode.">
          <WarningOutlined style={{ color: '#faad14' }} />
        </Tooltip>
      )}
      {onToggleMaximize && <Tooltip title={t(maximized ? 'events.organize.restore' : 'events.organize.maximize')}>
        <Button type="text" aria-label={t(maximized ? 'events.organize.restore' : 'events.organize.maximize')} aria-pressed={!!maximized}
          style={maximized ? { color: token.colorWarning } : undefined}
          icon={maximized ? <ShrinkOutlined /> : <ExpandAltOutlined />} onPointerDown={event => event.stopPropagation()}
          onClick={e => { e.stopPropagation(); onToggleMaximize(event.id); }} />
      </Tooltip>}
      <Dropdown menu={{ items: (menu as any).props.items }} trigger={["click"]}>
        <Tooltip title={t('events.organize.options')} trigger={['hover', 'focus']}>
          <Button aria-label={t('events.organize.options')} type="text" onClick={(e) => e.stopPropagation()} >
            <SettingOutlined />
          </Button>
        </Tooltip>
      </Dropdown>
    </Content>
  );
}
