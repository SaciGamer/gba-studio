import { IScriptsElement } from "@/providers/contexts/interfaces/ISceneElement";
import { ETypeScene } from '@/providers/contexts/interfaces/ISceneElement';
import useAppContexts from '@/providers/contexts/AppContexts';
import { SettingOutlined, WarningOutlined } from "@ant-design/icons";
import { Button, Dropdown, Menu, theme, Tooltip } from "antd";
import { Content } from "antd/es/layout/layout";
import { useI18n } from '@/i18n/I18n';
import { getEventPendingFields } from '../../../../../shared/events/eventPendingFields';

interface MenuEventItemProps {
  event: IScriptsElement;
  onRemove: (id: string) => void;
	onDuplicate: (id: string) => void;
	onRename: (id: string) => void;
	onToggleDisable: (id: string) => void;
}

export default function MenuEventItem({ event, onRemove, onDuplicate, onRename, onToggleDisable }: MenuEventItemProps) {
	const { t } = useI18n();
  const { token } = theme.useToken();
  const pendingFields = getEventPendingFields(event.command, event.args);
  const pendingLabel = t('events.pendingInputs');
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
          label: isDisabled ? "Enable Event" : "Disable Event",
          onClick: (e) => {
            e.domEvent.stopPropagation();
            onToggleDisable(event.id);
          },
        },
        ...(!isAutomatic ? [
          {
            key: "rename",
            label: "Rename Event",
            onClick: (e: any) => {
              e.domEvent.stopPropagation();
              onRename(event.id);
            },
          },
          {
            key: "duplicate",
            label: "Duplicate Event",
            onClick: (e: any) => {
              e.domEvent.stopPropagation();
              onDuplicate(event.id);
            },
          },
          {
            key: "remove",
            label: "Delete Event",
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
    <Content style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 6 }}>
      {pendingFields.length > 0 && <Tooltip title={pendingLabel}>
        <span role="img" aria-label={pendingLabel} tabIndex={0} onClick={e => e.stopPropagation()} style={{ display: 'inline-flex', color: token.colorWarning }}>
          <WarningOutlined />
        </span>
      </Tooltip>}
      {panCameraUnsupported && (
        <Tooltip title="Pan Camera is not supported for Logo and Point Click scenes in the current engine mode.">
          <WarningOutlined style={{ color: '#faad14' }} />
        </Tooltip>
      )}
      <Dropdown menu={{ items: (menu as any).props.items }} trigger={["click"]}>
        <Button type="text" onClick={(e) => e.stopPropagation()} >
          <SettingOutlined />
        </Button>
      </Dropdown>
    </Content>
  );
}
