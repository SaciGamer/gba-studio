import { LinkOutlined, SearchOutlined } from '@ant-design/icons';
import { App, Button, Empty, Flex, Input, Layout, Table, Tag, theme, Typography } from 'antd';
import React, { useMemo, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useI18n } from '@/i18n/I18n';
import useAppContexts from '@/providers/contexts/AppContexts';
import { IScriptsElement } from '@/providers/contexts/interfaces/ISceneElement';
import ResourceDropSurface from './ResourceDropSurface';
import { truncateUtf8 } from '@/utils/dialogueText';

type DialogueScriptKey = 'script' | 'playerHit1Script' | 'playerHit2Script' | 'playerHit3Script';
type DialoguePathSegment = number | 'then' | 'else';

interface DialogueRow {
  id: string;
  sceneId: string;
  scene: string;
  owner: string;
  text: string;
  textKey: 'text' | 'message';
  command: string;
  scriptKey: DialogueScriptKey;
  path: DialoguePathSegment[];
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

const dialogueCommands = new Set(['EVENT_DISPLAY_DIALOGUE', 'EVENT_DIALOGUE', 'EVENT_TEXT', 'EVENT_CHOICE', 'EVENT_SHOW_TEXT']);
const sanitizeDialogueText = (value: string) => value.replace(/[^\x20-\x7EÁÉÍÓÚÜÑáéíóúüñ¡¿\n]/g, '');

function collectRows(items: IScriptsElement[] | undefined, sceneId: string, scene: string, owner: string, scriptKey: DialogueScriptKey, rows: DialogueRow[], parentPath: DialoguePathSegment[] = []) {
  (items ?? []).forEach((event, index) => {
    const path = [...parentPath, index];
    if (dialogueCommands.has(event.command)) {
      const args = event.args as Record<string, unknown> | undefined;
      const textKey = args && Object.prototype.hasOwnProperty.call(args, 'message') && !Object.prototype.hasOwnProperty.call(args, 'text') ? 'message' : 'text';
      rows.push({ id: event.id, sceneId, scene, owner, command: event.command, textKey, scriptKey, path, text: String(args?.[textKey] ?? '') });
    }
    collectRows(event.children?.then, sceneId, scene, owner, scriptKey, rows, [...path, 'then']);
    collectRows(event.children?.else, sceneId, scene, owner, scriptKey, rows, [...path, 'else']);
  });
}

function updateEventAtPath(events: IScriptsElement[] | undefined, path: DialoguePathSegment[], textKey: 'text' | 'message', text: string): IScriptsElement[] {
  if (!events || path.length === 0) return events ?? [];
  const [segment, ...rest] = path;
  if (typeof segment !== 'number') return events;

  return events.map((event, index) => {
    if (index !== segment) return event;
    if (rest.length === 0) {
      return { ...event, args: { ...(event.args ?? {}), [textKey]: text } };
    }

    const branch = rest[0];
    if (branch !== 'then' && branch !== 'else') return event;
    return {
      ...event,
      children: {
        ...(event.children ?? {}),
        [branch]: updateEventAtPath(event.children?.[branch], rest.slice(1), textKey, text),
      },
    };
  });
}

export default function DialogueReviewEditor({ onOpenScene }: { onOpenScene?: (sceneId: string) => void }) {
  const { message } = App.useApp();
  const { token } = theme.useToken();
  const { scenes, setScenes } = useAppContexts();
  const { t, language } = useI18n();
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [editingRowKey, setEditingRowKey] = useState<string | null>(null);
  const rows = useMemo(() => {
    const result: DialogueRow[] = [];
    scenes.filter(scene => !scene._deleted).forEach(scene => {
      collectRows(scene.script, scene.id, scene.name, 'On Init', 'script', result);
      collectRows(scene.playerHit1Script, scene.id, scene.name, 'Player Hit 1', 'playerHit1Script', result);
      collectRows(scene.playerHit2Script, scene.id, scene.name, 'Player Hit 2', 'playerHit2Script', result);
      collectRows(scene.playerHit3Script, scene.id, scene.name, 'Player Hit 3', 'playerHit3Script', result);
    });
    return result.filter(row => `${row.scene} ${row.owner} ${row.text}`.toLowerCase().includes(search.toLowerCase()));
  }, [scenes, search]);

  const updateDialogueText = (row: DialogueRow, text: string) => {
    setScenes(previous => previous.map(scene => {
      if (scene.id !== row.sceneId) return scene;
      return {
        ...scene,
        [row.scriptKey]: updateEventAtPath(scene[row.scriptKey], row.path, row.textKey, text),
        _saved: false,
      };
    }));
  };

  const getRowKey = (row: DialogueRow) => `${row.sceneId}:${row.scriptKey}:${row.path.join('.')}`;

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
      actions={<><SearchOutlined style={{ padding: 4, borderRadius: token.borderRadius, backgroundColor: searchOpen ? token.colorPrimary : 'transparent', cursor: 'pointer' }} onClick={() => { setSearchOpen(previous => !previous); if (searchOpen) setSearch(''); }} /><Tag color="blue">{language}</Tag></>}
    >
      <ResourceDropSurface onFiles={() => undefined} onText={createDialogueFromText} hint={t('common.dropTextDialogue')}>
      {rows.length === 0 ? <Empty description={t('common.noItems')} /> : (
        <Table rowKey="id" dataSource={rows} pagination={{ pageSize: 20 }} columns={[
          { title: 'Ref', key: 'ref', width: 56, render: (_value, row: DialogueRow) => <Button type="text" size="small" aria-label={`Open scene ${row.scene}`} title={`Open scene ${row.scene}`} icon={<LinkOutlined />} onClick={() => onOpenScene?.(row.sceneId)} /> },
          { title: 'Scene', dataIndex: 'scene', width: 180 },
          { title: 'Trigger', dataIndex: 'owner', width: 140 },
          { title: 'Command', dataIndex: 'command', width: 180, render: value => <Tag>{value}</Tag> },
          { title: 'Text', dataIndex: 'text', render: (_value, row: DialogueRow) => <Input.TextArea variant={editingRowKey === getRowKey(row) ? 'outlined' : 'borderless'} value={row.text} autoSize={{ minRows: 1, maxRows: 4 }} onClick={event => event.stopPropagation()} onFocus={() => setEditingRowKey(getRowKey(row))} onBlur={() => setEditingRowKey(null)} onChange={event => updateDialogueText(row, truncateUtf8(sanitizeDialogueText(event.target.value)))} style={{ paddingInline: editingRowKey === getRowKey(row) ? undefined : 0, background: 'transparent' }} /> },
        ]} />
      )}
      </ResourceDropSurface>
    </DialogueEditorShell>
  );
}
