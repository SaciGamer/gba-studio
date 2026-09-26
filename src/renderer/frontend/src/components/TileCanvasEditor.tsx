import useAppContexts from '@/providers/contexts/AppContexts';
import { useHistory } from '@/providers/HistoryProvider';
import { ISceneSettings } from '@/providers/contexts/interfaces/ISceneElement';
import { useI18n } from '@/i18n/I18n';
import { AimOutlined, ArrowLeftOutlined, BorderOutlined, DeleteOutlined, EditOutlined, EnvironmentOutlined, GatewayOutlined, PictureFilled, PlusSquareFilled, RedoOutlined, ReloadOutlined, TableOutlined, TagOutlined, UndoOutlined, ZoomInOutlined, ZoomOutOutlined } from '@ant-design/icons';
import { Button, Flex, Segmented, Select, Space, Tag, theme, Typography } from 'antd';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TransformComponent, TransformWrapper } from 'react-zoom-pan-pinch';
import { v4 as uuidv4 } from 'uuid';
import FloatButtons, { IActions, SubMenuType } from './FloatButtons';

type Tool = 'move' | 'brush' | 'stamp' | 'fill' | 'erase' | 'collision' | 'trigger' | 'actor' | 'spawn';
type Overlay = 'tiles' | 'collisions' | 'triggers' | 'objects';

interface Props {
  scene: ISceneSettings;
  resetPanelSize: () => void;
  setShowFloatButton: (show: boolean) => void;
  showFloatButton: boolean;
  onExit?: () => void;
}

export default function TileCanvasEditor({ scene, resetPanelSize, setShowFloatButton, showFloatButton, onExit }: Props) {
  const { token } = theme.useToken();
  const { t } = useI18n();
  const { elementSelected, setElementSelected, setScenes, settingUtils, setSettingUtils } = useAppContexts();
  const active = (elementSelected?.id === scene.id ? elementSelected : scene) as ISceneSettings;
  const grid = active.gridSize ?? 16;
  const width = Math.max(grid, Math.ceil((active.width || 240) / grid) * grid);
  const height = Math.max(grid, Math.ceil((active.height || 160) / grid) * grid);
  const columns = Math.ceil(width / grid);
  const rows = Math.ceil(height / grid);
  const selectedTiles: number[] = active.selectedTiles ?? [];
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const transformRef = useRef<any>(null);
  const { undo, redo, canUndo, canRedo } = useHistory();
  const [tileset, setTileset] = useState<HTMLImageElement | null>(null);
  const [tool, setTool] = useState<Tool>(() => ['collision', 'trigger', 'actor', 'spawn'].includes(settingUtils.activeButton as string) ? settingUtils.activeButton as Tool : 'move');
  const [overlay, setOverlay] = useState<Overlay>('tiles');
  const [showGrid, setShowGrid] = useState(true);
  const [pointer, setPointer] = useState<{ col: number; row: number } | null>(null);
  const [start, setStart] = useState<{ col: number; row: number } | null>(null);
  const [painting, setPainting] = useState(false);

  const normalizeMap = useCallback((source?: number[][]) => Array.from({ length: rows }, (_, row) => Array.from({ length: columns }, (_, col) => source?.[row]?.[col] ?? -1)), [columns, rows]);
  const map = useMemo(() => normalizeMap(active.tileMap), [active.tileMap, normalizeMap]);

  const update = useCallback((changes: Partial<ISceneSettings>) => {
    const updated = { ...active, ...changes, _saved: false } as ISceneSettings;
    setElementSelected(updated);
    setScenes(previous => previous.map(item => item.id === updated.id ? updated : item));
  }, [active, setElementSelected, setScenes]);

  useEffect(() => {
    const load = async () => {
      if (!active.selectedTilesetId) { setTileset(null); return; }
      try {
        const response = await window.electronAPI.fetchImages('tilesets');
        const filename = response?.fileImages?.find((file: string) => file === active.selectedTilesetId || file.replace(/\.[^/.]+$/, '') === active.selectedTilesetId);
        if (!filename) { setTileset(null); return; }
        const image = new Image();
        image.onload = () => setTileset(image);
        image.onerror = () => setTileset(null);
        image.src = `${response.localPath}/${filename}`;
      } catch { setTileset(null); }
    };
    void load();
  }, [active.selectedTilesetId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    canvas.width = width; canvas.height = height;
    context.imageSmoothingEnabled = false;
    context.fillStyle = token.colorBgContainer;
    context.fillRect(0, 0, width, height);
    if (tileset) {
      const perRow = Math.max(1, Math.floor(tileset.naturalWidth / grid));
      map.forEach((line, row) => line.forEach((tile, col) => {
        if (tile < 0) return;
        context.drawImage(tileset, (tile % perRow) * grid, Math.floor(tile / perRow) * grid, grid, grid, col * grid, row * grid, grid, grid);
      }));
    } else {
      context.fillStyle = token.colorTextSecondary;
      context.font = '16px sans-serif';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText('No Data', width / 2, height / 2);
    }
    if (showGrid) {
      context.beginPath(); context.strokeStyle = 'rgba(127,127,127,.28)'; context.lineWidth = 1;
      for (let x = 0; x <= width; x += grid) { context.moveTo(x + .5, 0); context.lineTo(x + .5, height); }
      for (let y = 0; y <= height; y += grid) { context.moveTo(0, y + .5); context.lineTo(width, y + .5); }
      context.stroke();
    }
    active.collisions?.forEach(shape => { context.fillStyle = 'rgba(255,77,79,.25)'; context.strokeStyle = '#ff4d4f'; context.fillRect(shape.x, shape.y, shape.width, shape.height); context.strokeRect(shape.x + .5, shape.y + .5, shape.width - 1, shape.height - 1); });
    active.triggers?.forEach(shape => { context.fillStyle = 'rgba(82,196,26,.22)'; context.strokeStyle = '#52c41a'; context.fillRect(shape.x, shape.y, shape.width, shape.height); context.strokeRect(shape.x + .5, shape.y + .5, shape.width - 1, shape.height - 1); });
    active.actors?.forEach(actor => { context.fillStyle = '#1677ff'; context.fillRect(actor.x, actor.y, actor.width || grid, actor.height || grid); context.fillStyle = '#fff'; context.font = '9px sans-serif'; context.fillText('A', actor.x + 4, actor.y + 11); });
    active.spawnPoints?.forEach(point => { context.fillStyle = '#faad14'; context.beginPath(); context.arc(point.x + grid / 2, point.y + grid / 2, Math.max(4, grid / 3), 0, Math.PI * 2); context.fill(); });
    if (start && pointer && (tool === 'collision' || tool === 'trigger')) {
      context.fillStyle = tool === 'trigger' ? 'rgba(82,196,26,.35)' : 'rgba(255,77,79,.35)';
      context.fillRect(Math.min(start.col, pointer.col) * grid, Math.min(start.row, pointer.row) * grid, (Math.abs(start.col - pointer.col) + 1) * grid, (Math.abs(start.row - pointer.row) + 1) * grid);
    }
  }, [active.actors, active.collisions, active.spawnPoints, active.triggers, grid, height, map, pointer, showGrid, start, tileset, token.colorBgContainer, tool, width]);

  const getCell = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current; if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return { col: Math.max(0, Math.min(columns - 1, Math.floor((event.clientX - rect.left) / rect.width * columns))), row: Math.max(0, Math.min(rows - 1, Math.floor((event.clientY - rect.top) / rect.height * rows))) };
  };
  const flood = (tiles: number[][], startRow: number, startCol: number, replacement: number) => {
    const target = tiles[startRow][startCol]; if (target === replacement) return;
    const pending = [[startRow, startCol]];
    while (pending.length) { const [row, col] = pending.pop()!; if (row < 0 || row >= rows || col < 0 || col >= columns || tiles[row][col] !== target) continue; tiles[row][col] = replacement; pending.push([row - 1, col], [row + 1, col], [row, col - 1], [row, col + 1]); }
  };
  const paint = useCallback((cell: { col: number; row: number }) => {
    if (!['brush', 'stamp', 'fill', 'erase'].includes(tool) || (tool !== 'erase' && (!tileset || !selectedTiles.length))) return;
    const next = normalizeMap(active.tileMap).map(line => [...line]);
    if (tool === 'fill') flood(next, cell.row, cell.col, selectedTiles[0]);
    else if (tool === 'erase') next[cell.row][cell.col] = -1;
    else if (tool === 'stamp' && selectedTiles.length > 1) {
      const perRow = tileset ? Math.max(1, Math.floor(tileset.naturalWidth / grid)) : selectedTiles.length;
      const first = Math.min(...selectedTiles), firstCol = first % perRow, firstRow = Math.floor(first / perRow);
      selectedTiles.forEach(tile => { const col = cell.col + tile % perRow - firstCol, row = cell.row + Math.floor(tile / perRow) - firstRow; if (row >= 0 && row < rows && col >= 0 && col < columns) next[row][col] = tile; });
    } else next[cell.row][cell.col] = selectedTiles[0];
    update({ tileMap: next });
  }, [active.tileMap, columns, grid, normalizeMap, rows, selectedTiles, tileset, tool, update]);

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const cell = getCell(event); if (!cell) return;
    if (tool === 'move') {
      const x = cell.col * grid;
      const y = cell.row * grid;
      const trigger = active.triggers?.find(item => x >= item.x && x < item.x + item.width && y >= item.y && y < item.y + item.height);
      setSettingUtils(previous => ({ ...previous, activeTriggerId: trigger?.id ?? null }));
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId); setPointer(cell);
    if (tool === 'collision' || tool === 'trigger') setStart(cell);
    else if (tool === 'actor') { update({ actors: [...(active.actors ?? []), { id: uuidv4(), name: `Actor ${(active.actors?.length ?? 0) + 1}`, x: cell.col * grid, y: cell.row * grid, width: grid, height: grid, direction: 'right' }] }); }
    else if (tool === 'spawn') { update({ spawnPoints: [...(active.spawnPoints ?? []), { id: uuidv4(), name: `Spawn ${(active.spawnPoints?.length ?? 0) + 1}`, x: cell.col * grid, y: cell.row * grid, direction: 'right' }] }); }
    else { setPainting(true); paint(cell); }
  };
  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => { const cell = getCell(event); if (!cell) return; setPointer(cell); if (painting && (tool === 'brush' || tool === 'erase')) paint(cell); };
  const onPointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const end = getCell(event) ?? pointer;
    if (start && end && (tool === 'collision' || tool === 'trigger')) {
      const shape = { id: uuidv4(), name: `${tool === 'trigger' ? 'Trigger' : 'Collision'} ${tool === 'trigger' ? (active.triggers?.length ?? 0) + 1 : (active.collisions?.length ?? 0) + 1}`, x: Math.min(start.col, end.col) * grid, y: Math.min(start.row, end.row) * grid, width: (Math.abs(start.col - end.col) + 1) * grid, height: (Math.abs(start.row - end.row) + 1) * grid };
      if (tool === 'trigger') {
        const trigger = { ...shape, sceneId: active.id, activation: 'enter' as const, enabled: true, once: false, cooldownFrames: 0, script: [], onEnterScript: [], onLeaveScript: [] };
        update({ triggers: [...(active.triggers ?? []), trigger] });
        setSettingUtils(previous => ({ ...previous, activeTriggerId: trigger.id }));
      } else update({ collisions: [...(active.collisions ?? []), shape] });
    }
    setPainting(false); setStart(null);
  };

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if ((event.ctrlKey || event.metaKey) && ['z', 'y'].includes(event.key.toLowerCase())) return;
      const shortcuts: Record<string, Tool> = { v: 'move', b: 'brush', f: 'fill', e: 'erase', c: 'collision', t: 'trigger', a: 'actor', p: 'spawn' };
      if (shortcuts[event.key.toLowerCase()]) chooseTool(shortcuts[event.key.toLowerCase()]);
    };
    document.addEventListener('keydown', handler); return () => document.removeEventListener('keydown', handler);
  }, []);

  const chooseTool = (next: Tool) => { setTool(next); setSettingUtils(previous => ({ ...previous, activeButton: next, activeSubButton: '' })); };
  const actions: IActions[] = [
    { key: 'move', icon: <AimOutlined />, tooltip: 'Move (V)', active: tool === 'move', onClick: () => chooseTool('move'), subMenu: { type: SubMenuType.TOOLTIP, items: [
      { key: 'zoomIn', icon: <ZoomInOutlined />, tooltip: 'Zoom in', onClick: () => transformRef.current?.zoomIn() }, { key: 'zoomOut', icon: <ZoomOutOutlined />, tooltip: 'Zoom out', onClick: () => transformRef.current?.zoomOut() }, { key: 'reset', icon: <ReloadOutlined />, tooltip: 'Reset view', onClick: () => transformRef.current?.resetTransform() }, { key: 'grid', icon: <TableOutlined />, tooltip: 'Grid', active: showGrid, onClick: () => setShowGrid(value => !value) },
    ] } },
    { key: 'paint', type: SubMenuType.DROPDOWN, icon: <EditOutlined />, active: ['brush', 'stamp', 'fill'].includes(tool), subMenu: { items: [
      { key: 'Brush', icon: <EditOutlined />, tooltip: 'Brush (B)', active: tool === 'brush', onClick: () => chooseTool('brush') }, { key: 'Stamp', icon: <TagOutlined />, tooltip: 'Stamp', active: tool === 'stamp', onClick: () => chooseTool('stamp') }, { key: 'Fill', icon: <PictureFilled />, tooltip: 'Fill (F)', active: tool === 'fill', onClick: () => chooseTool('fill') },
    ] } },
    { key: 'erase', icon: <DeleteOutlined />, tooltip: 'Erase (E)', active: tool === 'erase', onClick: () => chooseTool('erase') },
    { key: 'collision', icon: <BorderOutlined />, tooltip: 'Collision (C)', active: tool === 'collision', onClick: () => { chooseTool('collision'); setOverlay('collisions'); } },
    { key: 'trigger', icon: <PlusSquareFilled />, tooltip: 'Trigger (T)', active: tool === 'trigger', onClick: () => { chooseTool('trigger'); setOverlay('triggers'); } },
    { key: 'actor', icon: <GatewayOutlined />, tooltip: 'Actor (A)', active: tool === 'actor', onClick: () => { chooseTool('actor'); setOverlay('objects'); } },
    { key: 'spawn', icon: <EnvironmentOutlined />, tooltip: 'Spawn point (P)', active: tool === 'spawn', onClick: () => { chooseTool('spawn'); setOverlay('objects'); } },
  ];

  return <Flex vertical style={{ width: '100%', height: '100%', minHeight: 0, position: 'relative', background: token.colorBgLayout }}>
    <FloatButtons actions={actions} onResetPanelSize={resetPanelSize} onShowFloatButton={setShowFloatButton} showFloatButton={showFloatButton} />
    <Flex align="center" justify="space-between" gap={8} style={{ padding: '8px 12px 8px 82px', borderBottom: `1px solid ${token.colorBorderSecondary}`, background: token.colorBgContainer }}>
      <Segmented value={overlay} onChange={value => setOverlay(value as Overlay)} options={[{ label: 'Tiles', value: 'tiles' }, { label: `Collision ${active.collisions?.length ?? 0}`, value: 'collisions' }, { label: `Triggers ${active.triggers?.length ?? 0}`, value: 'triggers' }, { label: `Objects ${(active.actors?.length ?? 0) + (active.spawnPoints?.length ?? 0)}`, value: 'objects' }]} />
      <Space>{onExit && <Button icon={<ArrowLeftOutlined />} onClick={onExit}>Back to world</Button>}<Button icon={<UndoOutlined />} disabled={!canUndo} onClick={undo} /><Button icon={<RedoOutlined />} disabled={!canRedo} onClick={redo} /><Select value={active.renderMode ?? 'regular_tilemap'} style={{ width: 260 }} onChange={renderMode => update({ renderMode })} options={[{ value: 'regular_tilemap', label: t('tiles.regular') }, { value: 'palette_bitmap', label: t('tiles.paletteBitmap') }, { value: 'direct_bitmap', label: t('tiles.directBitmap') }]} /></Space>
    </Flex>
    <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}><TransformWrapper ref={transformRef} minScale={0.25} maxScale={8} centerOnInit limitToBounds={false} wheel={{ step: .1 }} panning={{ disabled: tool !== 'move' }} doubleClick={{ disabled: true }}><TransformComponent wrapperStyle={{ width: '100%', height: '100%' }} contentStyle={{ width, height }}><canvas ref={canvasRef} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={() => setPointer(null)} style={{ width, height, display: 'block', imageRendering: 'pixelated', cursor: tool === 'move' ? 'grab' : 'crosshair', boxShadow: token.boxShadowSecondary }} /></TransformComponent></TransformWrapper></div>
    <Flex align="center" justify="space-between" style={{ minHeight: 28, paddingInline: 10, borderTop: `1px solid ${token.colorBorderSecondary}`, background: token.colorBgContainer }}><Typography.Text type="secondary">{active.name} · {columns}×{rows} · {width}×{height}px · grid {grid}px</Typography.Text><Flex gap={6}><Tag>{tool}</Tag>{pointer && <Typography.Text type="secondary">x {pointer.col}, y {pointer.row}</Typography.Text>}</Flex></Flex>
  </Flex>;
}
