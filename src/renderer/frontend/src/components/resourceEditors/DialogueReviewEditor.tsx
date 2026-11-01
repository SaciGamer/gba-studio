import { LinkOutlined, SearchOutlined } from '@ant-design/icons';
import { App, Button, Empty, Flex, Input, Layout, Table, Tag, theme, Typography } from 'antd';
import React, { useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useI18n } from '@/i18n/I18n';
import useAppContexts from '@/providers/contexts/AppContexts';
import { IScriptsElement } from '@/providers/contexts/interfaces/ISceneElement';
import ResourceDropSurface from './ResourceDropSurface';
import { truncateUtf8 } from '@/utils/dialogueText';

type DialogueSceneScriptKey = 'script' | 'playerHit1Script' | 'playerHit2Script' | 'playerHit3Script';
type DialoguePathSegment = number | 'then' | 'else';
type DialogueArgPathSegment = string | number;
type DialogueActorScriptKey = 'onInteractScript' | 'onInitScript' | 'onUpdateScript';
type DialogueTriggerScriptKey = 'script' | 'onEnterScript' | 'onLeaveScript' | 'onInteractScript' | 'onInitScript' | 'onUpdateScript';
type DialogueTarget =
  | { type: 'scene'; scriptKey: DialogueSceneScriptKey }
  | { type: 'actor'; objectId: string; scriptKey: DialogueActorScriptKey }
  | { type: 'trigger'; objectId: string; scriptKey: DialogueTriggerScriptKey };

interface DialogueRow {
  id: string;
  sceneId: string;
  scene: string;
  owner: string;
  text: string;
  command: string;
  target: DialogueTarget;
  path: DialoguePathSegment[];
  textPath: DialogueArgPathSegment[];
  children?: DialogueRow[];
  isSubdialogue?: boolean;
}

function DialogueEditorShell({ title, search, actions, children }: { title: string; search?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode }) {
  const { token } = theme.useToken();
  return (
    <Layout style={{ height: '100%', minHeight: 0, background: token.colorBgLayout }}>
      <Flex vertical style={{ height: '100%', minHeight: 0 }}>
        <Flex align="center" justify="space-between" gap={8} style={{ height: 40, flex: '0 0 40px', paddingInline: 12, background: token.colorBorder }}>
          <Typography.Text strong ellipsis style={{ color: '#fff', minWidth: 0 }}>{title.toUpperCase()}</Typography.Text>
          <Flex align="center" gap={8}>{search}{actions}</Flex>
        </Flex>
        <main style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 16 }}>{children}</main>
      </Flex>
    </Layout>
  );
}

const sanitizeDialogueText = (value: string) => value.replace(/[^\x20-\x7EÁÉÍÓÚÜÑáéíóúüñ¡¿\n]/g, '');

const dialogueTextCommands = new Set(['EVENT_DISPLAY_DIALOGUE', 'EVENT_DIALOGUE_SHOW', 'EVENT_TEXT_SCROLL', 'EVENT_DIALOGUE', 'EVENT_TEXT', 'EVENT_SHOW_TEXT']);
const dialogueChoiceCommands = new Set(['EVENT_DIALOGUE_CHOICE', 'EVENT_MENU_OPEN', 'EVENT_CHOICE']);

function dialogueTextPaths(event: IScriptsElement): DialogueArgPathSegment[][] {
  const args = event.args as Record<string, unknown> | undefined;
  if (!args) return [];
  if (dialogueTextCommands.has(event.command)) {
    const field = Object.prototype.hasOwnProperty.call(args, 'text') ? 'text' : 'message';
    return Object.prototype.hasOwnProperty.call(args, field) ? [[field]] : [];
  }
  if (!dialogueChoiceCommands.has(event.command)) return [];
  const fields: DialogueArgPathSegment[][] = [['prompt']];
  if (event.command === 'EVENT_MENU_OPEN' && Array.isArray(args.options) && args.options.length) {
    args.options.forEach((_, index) => fields.push(['options', index]));
  } else {
    fields.push(['optionA'], ['optionB']);
  }
  return fields.filter(path => Object.prototype.hasOwnProperty.call(args, String(path[0])));
}

function collectRows(items: IScriptsElement[] | undefined, sceneId: string, scene: string, owner: string, target: DialogueTarget, rows: DialogueRow[], parentPath: DialoguePathSegment[] = []) {
  (items ?? []).forEach((event, index) => {
    const path = [...parentPath, index];
    const args = event.args as Record<string, unknown> | undefined;
    const textPaths = dialogueTextPaths(event);
    const isChoiceGroup = dialogueChoiceCommands.has(event.command) && textPaths.length > 1;
    const eventRows = textPaths.map((textPath, textIndex) => {
      const text = String(textPath.reduce<unknown>((value, key) => (value as any)?.[key], args) ?? '');
      const fieldName = textPath[0] === 'prompt' ? 'Prompt' : textPath[0] === 'options' ? `Option ${Number(textPath[1]) + 1}` : String(textPath[0]);
      return { id: event.id, sceneId, scene, owner: isChoiceGroup && textIndex > 0 ? fieldName : owner, command: event.command, target, path, textPath, text };
    });
    if (isChoiceGroup) {
      const [group, ...options] = eventRows;
      rows.push({ ...group, children: options.map(option => ({ ...option, isSubdialogue: true })) });
    } else {
      rows.push(...eventRows);
    }
    collectRows(event.children?.then, sceneId, scene, owner, target, rows, [...path, 'then']);
    collectRows(event.children?.else, sceneId, scene, owner, target, rows, [...path, 'else']);
  });
}

function updateNestedValue(value: unknown, path: DialogueArgPathSegment[], text: string): unknown {
  if (!path.length) return text;
  const [segment, ...rest] = path;
  if (typeof segment === 'number') {
    if (!Array.isArray(value)) return value;
    return value.map((item, index) => index === segment ? updateNestedValue(item, rest, text) : item);
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;
  return { ...record, [segment]: updateNestedValue(record[segment], rest, text) };
}

function updateEventAtPath(events: IScriptsElement[] | undefined, path: DialoguePathSegment[], textPath: DialogueArgPathSegment[], text: string): IScriptsElement[] {
  if (!events || path.length === 0) return events ?? [];
  const [segment, ...rest] = path;
  if (typeof segment !== 'number') return events;

  return events.map((event, index) => {
    if (index !== segment) return event;
    if (rest.length === 0) {
      const [field, ...fieldPath] = textPath;
      return { ...event, args: { ...(event.args ?? {}), [field]: updateNestedValue(event.args?.[field], fieldPath, text) } };
    }

    const branch = rest[0];
    if (branch !== 'then' && branch !== 'else') return event;
    return {
      ...event,
      children: {
        ...(event.children ?? {}),
        [branch]: updateEventAtPath(event.children?.[branch], rest.slice(1), textPath, text),
      },
    };
  });
}

export default function DialogueReviewEditor({ onOpenScene }: { onOpenScene?: (sceneId: string) => void }) {
  const { message } = App.useApp();
  const { token } = theme.useToken();
  const { scenes, setScenes } = useAppContexts();
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [editingRowKey, setEditingRowKey] = useState<string | null>(null);
  const baseSurfaceRgb = token.colorBgContainer.match(/[\da-f]{2}/gi)?.slice(-3).map(value => parseInt(value, 16));
  const subdialogueBackground = baseSurfaceRgb
    ? `rgb(${baseSurfaceRgb.map(channel => Math.round(channel * 0.55)).join(', ')})`
    : '#303030';
  const subdialogueCell = (row: DialogueRow) => ({
    style: row.isSubdialogue ? { background: subdialogueBackground } : undefined,
  });
  const rows = useMemo(() => {
    const result: DialogueRow[] = [];
    scenes.filter(scene => !scene._deleted).forEach(scene => {
      const sceneTarget = (scriptKey: DialogueSceneScriptKey): DialogueTarget => ({ type: 'scene', scriptKey });
      collectRows(scene.script, scene.id, scene.name, 'On Init', sceneTarget('script'), result);
      collectRows(scene.playerHit1Script, scene.id, scene.name, 'Player Hit 1', sceneTarget('playerHit1Script'), result);
      collectRows(scene.playerHit2Script, scene.id, scene.name, 'Player Hit 2', sceneTarget('playerHit2Script'), result);
      collectRows(scene.playerHit3Script, scene.id, scene.name, 'Player Hit 3', sceneTarget('playerHit3Script'), result);
      (scene.actors ?? []).forEach(actor => {
        if (!actor.id) return;
        const scripts = actor as typeof actor & Record<string, IScriptsElement[] | undefined>;
        const actorTarget = (scriptKey: DialogueActorScriptKey): DialogueTarget => ({ type: 'actor', objectId: actor.id, scriptKey });
        collectRows(scripts.onInteractScript, scene.id, scene.name, `${actor.name || 'Actor'} / On Interact`, actorTarget('onInteractScript'), result);
        collectRows(scripts.onInitScript, scene.id, scene.name, `${actor.name || 'Actor'} / On Init`, actorTarget('onInitScript'), result);
        collectRows(scripts.onUpdateScript, scene.id, scene.name, `${actor.name || 'Actor'} / On Update`, actorTarget('onUpdateScript'), result);
      });
      (scene.triggers ?? []).forEach(trigger => {
        const triggerTarget = (scriptKey: DialogueTriggerScriptKey): DialogueTarget => ({ type: 'trigger', objectId: trigger.id, scriptKey });
        collectRows(trigger.script, scene.id, scene.name, `${trigger.name || 'Trigger'} / Script`, triggerTarget('script'), result);
        collectRows(trigger.onEnterScript, scene.id, scene.name, `${trigger.name || 'Trigger'} / On Enter`, triggerTarget('onEnterScript'), result);
        collectRows(trigger.onLeaveScript, scene.id, scene.name, `${trigger.name || 'Trigger'} / On Leave`, triggerTarget('onLeaveScript'), result);
        collectRows(trigger.onInteractScript, scene.id, scene.name, `${trigger.name || 'Trigger'} / On Interact`, triggerTarget('onInteractScript'), result);
        collectRows(trigger.onInitScript, scene.id, scene.name, `${trigger.name || 'Trigger'} / On Init`, triggerTarget('onInitScript'), result);
        collectRows(trigger.onUpdateScript, scene.id, scene.name, `${trigger.name || 'Trigger'} / On Update`, triggerTarget('onUpdateScript'), result);
      });
    });
    const matches = (row: DialogueRow) => `${row.scene} ${row.owner} ${row.text} ${row.command}`.toLowerCase().includes(search.toLowerCase());
    const filterGroups = (items: DialogueRow[]): DialogueRow[] => items.flatMap(row => {
      const children = row.children ? filterGroups(row.children) : undefined;
      if (!matches(row) && !children?.length) return [];
      return [{ ...row, ...(row.children ? { children: children ?? [] } : {}) }];
    });
    return filterGroups(result);
  }, [scenes, search]);

  const updateDialogueText = (row: DialogueRow, text: string) => {
    setScenes(previous => previous.map(scene => {
      if (scene.id !== row.sceneId) return scene;
      if (row.target.type === 'actor') {
        return { ...scene, actors: (scene.actors ?? []).map(actor => actor.id === row.target.objectId
          ? { ...actor, [row.target.scriptKey]: updateEventAtPath((actor as any)[row.target.scriptKey], row.path, row.textPath, text) }
          : actor), _saved: false };
      }
      if (row.target.type === 'trigger') {
        return { ...scene, triggers: (scene.triggers ?? []).map(trigger => trigger.id === row.target.objectId
          ? { ...trigger, [row.target.scriptKey]: updateEventAtPath(trigger[row.target.scriptKey], row.path, row.textPath, text) }
          : trigger), _saved: false };
      }
      return {
        ...scene,
        [row.target.scriptKey]: updateEventAtPath(scene[row.target.scriptKey], row.path, row.textPath, text),
        _saved: false,
      };
    }));
  };

  const getRowKey = (row: DialogueRow) => `${row.sceneId}:${row.target.type}:${row.target.type === 'scene' ? row.target.scriptKey : `${row.target.objectId}:${row.target.scriptKey}`}:${row.path.join('.')}:${row.textPath.join('.')}`;

  const createDialogueFromText = (text: string) => {
    const target = scenes.find(scene => !scene._deleted);
    if (!target) {
      message.error('Create a scene before dropping dialogue text.');
      return;
    }
    const dialogue = { id: uuidv4(), command: 'EVENT_DISPLAY_DIALOGUE', args: { text: truncateUtf8(sanitizeDialogueText(text)), horizontalAlign: 'left', verticalAlign: 'bottom', animate: true } };
    setScenes(previous => previous.map(scene => scene.id === target.id ? { ...scene, script: [...(scene.script ?? []), dialogue], _saved: false } : scene));
    message.success(`Dialogue added to ${target.name}`);
  };

  return (
    <DialogueEditorShell
      title={t('editor.dialogues')}
      search={searchOpen && <Input allowClear prefix={<SearchOutlined />} value={search} placeholder={t('common.search')} onChange={event => setSearch(event.target.value)} />}
      actions={<SearchOutlined style={{ padding: 4, borderRadius: token.borderRadius, backgroundColor: searchOpen ? token.colorPrimary : 'transparent', cursor: 'pointer' }} onClick={() => { setSearchOpen(previous => !previous); if (searchOpen) setSearch(''); }} />}
    >
      <ResourceDropSurface onFiles={() => undefined} onText={createDialogueFromText} acceptFiles={false} hint={t('common.dropTextDialogue')}>
      {rows.length === 0 ? <Empty description={t('common.noItems')} /> : (
        <Table rowKey={getRowKey} dataSource={rows} expandable={{ defaultExpandAllRows: true }} pagination={{ pageSize: 20 }} columns={[
          { title: 'Ref', key: 'ref', width: 56, onCell: subdialogueCell, render: (_value, row: DialogueRow) => <Button type="text" size="small" aria-label={`Open scene ${row.scene}`} title={`Open scene ${row.scene}`} icon={<LinkOutlined />} onClick={() => onOpenScene?.(row.sceneId)} /> },
          { title: 'Scene', dataIndex: 'scene', width: 180, onCell: subdialogueCell },
          { title: 'Trigger', dataIndex: 'owner', width: 140, onCell: subdialogueCell },
          { title: 'Command', dataIndex: 'command', width: 180, onCell: subdialogueCell, render: value => <Tag>{value}</Tag> },
          { title: 'Text', dataIndex: 'text', onCell: subdialogueCell, render: (_value, row: DialogueRow) => <Input.TextArea variant={editingRowKey === getRowKey(row) ? 'outlined' : 'borderless'} value={row.text} autoSize={{ minRows: 1, maxRows: 4 }} onClick={event => event.stopPropagation()} onFocus={() => setEditingRowKey(getRowKey(row))} onBlur={() => setEditingRowKey(null)} onChange={event => updateDialogueText(row, truncateUtf8(sanitizeDialogueText(event.target.value)))} style={{ paddingInline: editingRowKey === getRowKey(row) ? undefined : 0, background: 'transparent' }} /> },
        ]} />
      )}
      </ResourceDropSurface>
    </DialogueEditorShell>
  );
}
