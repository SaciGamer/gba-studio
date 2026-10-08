import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Checkbox, Divider, Input, Select, Space, Tag, Typography } from 'antd';
import { DeleteOutlined, PauseOutlined, PlayCircleOutlined, PlusOutlined } from '@ant-design/icons';
import { ITileAnimation, ISceneSettings } from '@/providers/contexts/interfaces/ISceneElement';
import { loadPaletteTransparentImage } from '@/utils/paletteTransparency';
import { InputNumber } from './StepInputNumber';

interface TileAnimationEditorProps {
  scene: ISceneSettings;
  onChange: (animations: ITileAnimation[]) => void;
  onSceneChange?: (scene: ISceneSettings) => void;
  tileset?: { image: HTMLImageElement | HTMLCanvasElement; tileWidth: number; tileHeight: number; columns: number; rows: number; source?: string };
  paletteOptions?: Array<{ id: string; name: string; colors: string[] }>;
}

const numericStyle: React.CSSProperties = { backgroundColor: '#d9d9d9' };

const normalize = (animation: Partial<ITileAnimation>): ITileAnimation => {
  const frames = Array.isArray(animation.frameTileIndices) && animation.frameTileIndices.length
    ? animation.frameTileIndices.map(value => Math.max(0, Math.min(1023, Math.trunc(Number(value) || 0))))
    : [0];
  const initialFrame = Math.max(0, Math.min(frames.length - 1, Math.trunc(Number(animation.initialFrame) || 0)));
  return {
    id: animation.id,
    layerId: Math.max(0, Math.min(3, Math.trunc(Number(animation.layerId) || 0))),
    targetTileIndex: Math.max(0, Math.min(1023, Math.trunc(Number(animation.targetTileIndex) || 0))),
    frameTileIndices: frames.slice(0, 32),
    durationFrames: Math.max(1, Math.min(65535, Math.trunc(Number(animation.durationFrames) || 1))),
    loop: animation.loop !== false,
    initialFrame,
  };
};

const TileAnimationEditor: React.FC<TileAnimationEditorProps> = ({ scene, onChange, onSceneChange, tileset, paletteOptions = [] }) => {
  const animations = scene.tileAnimations ?? [];
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [previewFrame, setPreviewFrame] = useState(0);

  const playingAnimation = useMemo(() => animations.find(item => item.id === playingId), [animations, playingId]);
  const duplicateTargets = useMemo(() => {
    const seen = new Set<number>();
    return animations.map(item => item.targetTileIndex).filter(tile => seen.has(tile) || !seen.add(tile));
  }, [animations]);

  useEffect(() => {
    if (!playingAnimation) return undefined;
    const frameCount = playingAnimation.frameTileIndices.length;
    setPreviewFrame(Math.min(playingAnimation.initialFrame, Math.max(0, frameCount - 1)));
    const interval = window.setInterval(() => {
      setPreviewFrame(current => {
        const next = current + 1;
        if (next < frameCount) return next;
        if (!playingAnimation.loop) {
          setPlayingId(null);
          return Math.max(0, frameCount - 1);
        }
        return 0;
      });
    }, Math.max(1, playingAnimation.durationFrames) * (1000 / 60));
    return () => window.clearInterval(interval);
  }, [playingAnimation]);

  const update = (index: number, patch: Partial<ITileAnimation>) => {
    onChange(animations.map((item, itemIndex) => itemIndex === index ? normalize({ ...item, ...patch }) : item));
  };

  const add = () => {
    if (animations.length >= 32) return;
    const id = `tile-animation-${Date.now()}-${animations.length}`;
    onChange([...animations, normalize({ id, layerId: 0, targetTileIndex: 0, frameTileIndices: [0, 1], durationFrames: 8, loop: true, initialFrame: 0 })]);
  };

  return <Space direction="vertical" style={{ width: '100%' }}>
    <Space align="center" style={{ width: '100%', justifyContent: 'space-between' }}>
      <Typography.Text strong>Regular BG tile animations</Typography.Text>
      <Button size="small" icon={<PlusOutlined />} onClick={add} disabled={animations.length >= 32}>Add</Button>
    </Space>
    <Typography.Text type="secondary">Each destination tile changes everywhere that index is used. Maximum: 32 animations and 32 frames each.</Typography.Text>
    {duplicateTargets.length > 0 && <Alert type="warning" showIcon message="Duplicate destination tile" description={`Tile ${[...new Set(duplicateTargets)].join(', ')} is assigned to more than one animation. The build will reject this ambiguous overwrite.`} />}
    {animations.map((animation, index) => {
      const id = animation.id ?? `tile-animation-${index}`;
      const isPlaying = playingId === id;
      const frame = isPlaying ? Math.min(previewFrame, animation.frameTileIndices.length - 1) : animation.initialFrame;
      const frameTile = animation.frameTileIndices[frame] ?? 0;
      return <Space key={id} direction="vertical" style={{ width: '100%', padding: 8, border: '1px solid #d9d9d9', borderRadius: 4 }}>
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <Tag color="blue">Animation {index + 1}</Tag>
          <Button danger size="small" icon={<DeleteOutlined />} onClick={() => {
            if (playingId === id) setPlayingId(null);
            onChange(animations.filter((_, itemIndex) => itemIndex !== index));
          }}>Remove</Button>
        </Space>
        <Space.Compact block>
          <Select aria-label="Animation layer" value={animation.layerId} onChange={layerId => update(index, { layerId })} options={[0, 1, 2, 3].map(layerId => ({ value: layerId, label: `Layer ${layerId}` }))} style={{ width: '35%' }} />
          <InputNumber aria-label="Destination tile" min={0} max={1023} value={animation.targetTileIndex} onChange={value => update(index, { targetTileIndex: Number(value ?? 0) })} style={{ width: '32%', ...numericStyle }} addonBefore="Tile" />
          <InputNumber aria-label="Duration in frames" min={1} max={65535} value={animation.durationFrames} onChange={value => update(index, { durationFrames: Number(value ?? 1) })} style={{ width: '33%', ...numericStyle }} addonBefore="Ticks" />
        </Space.Compact>
        <Input aria-label="Animation frame tiles" value={animation.frameTileIndices.join(', ')} onChange={event => {
          const frameTileIndices = event.target.value.split(',').map(value => Number(value.trim())).filter(value => Number.isFinite(value)).slice(0, 32).map(value => Math.max(0, Math.min(1023, Math.trunc(value))));
          update(index, { frameTileIndices: frameTileIndices.length ? frameTileIndices : [0], initialFrame: Math.min(animation.initialFrame, Math.max(0, frameTileIndices.length - 1)) });
        }} placeholder="Frame tile indices: 12, 13, 14" />
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <InputNumber aria-label="Initial frame" min={0} max={Math.max(0, animation.frameTileIndices.length - 1)} value={animation.initialFrame} onChange={value => update(index, { initialFrame: Number(value ?? 0) })} style={numericStyle} addonBefore="Start" />
          <Checkbox checked={animation.loop} onChange={event => update(index, { loop: event.target.checked })}>Loop</Checkbox>
          <Button size="small" icon={isPlaying ? <PauseOutlined /> : <PlayCircleOutlined />} onClick={() => setPlayingId(isPlaying ? null : id)}>{isPlaying ? 'Pause' : 'Preview'}</Button>
        </Space>
        <div style={{ background: '#202020', color: '#fff', padding: '6px 8px', borderRadius: 3 }}>
          <Typography.Text style={{ color: '#fff' }}>Preview frame {frame + 1}/{animation.frameTileIndices.length}: tile {frameTile}</Typography.Text>
          {(tileset?.image instanceof HTMLCanvasElement || tileset?.image?.complete) && tileset.columns > 0 && tileset.rows > 0
            ? <>
              <div style={{ marginTop: 6, width: 64, height: 64, imageRendering: 'pixelated', background: '#333', display: 'grid', placeItems: 'center' }}>
                <TilePreview image={tileset.image} tileIndex={frameTile} tileWidth={tileset.tileWidth} tileHeight={tileset.tileHeight} columns={tileset.columns} />
              </div>
              <TileMapPreview scene={scene} layerId={animation.layerId} targetTileIndex={animation.targetTileIndex} frameTileIndex={frameTile} tileset={tileset} paletteOptions={paletteOptions} />
            </>
            : <div style={{ marginTop: 6, color: '#aaa', fontSize: 11 }}>No tileset</div>}
        </div>
        <MapCellOverrideEditor scene={scene} layerId={animation.layerId} onSceneChange={onSceneChange} />
      </Space>;
    })}
    {!animations.length && <Typography.Text type="secondary">No tile animations configured for this scene.</Typography.Text>}
    <Divider style={{ margin: '4px 0' }} />
  </Space>;
};

const MapCellOverrideEditor: React.FC<{
  scene: ISceneSettings;
  layerId: number;
  onSceneChange?: (scene: ISceneSettings) => void;
}> = ({ scene, layerId, onSceneChange }) => {
  const layer = scene.backgrounds?.find(item => item.layerId === layerId);
  const overrides = layer?.tileMapCellOverrides ?? [];
  const [cellIndex, setCellIndex] = useState(0);
  const [tileIndex, setTileIndex] = useState(0);
  const [paletteId, setPaletteId] = useState(0);
  const [horizontalFlip, setHorizontalFlip] = useState(false);
  const [verticalFlip, setVerticalFlip] = useState(false);

  const commit = (nextOverrides: NonNullable<typeof layer>['tileMapCellOverrides']) => {
    if (!onSceneChange) return;
    const backgrounds = scene.backgrounds?.some(item => item.layerId === layerId)
      ? scene.backgrounds.map(item => item.layerId === layerId ? { ...item, tileMapCellOverrides: nextOverrides } : item)
      : [...(scene.backgrounds ?? []), { layerId, tileMapCellOverrides: nextOverrides }];
    onSceneChange({ ...scene, backgrounds, _saved: false });
  };

  if (!onSceneChange) return null;
  return <Space direction="vertical" size={4} style={{ width: '100%', marginTop: 4 }}>
    <Typography.Text type="secondary">Map cell attributes (regular_bg)</Typography.Text>
    <Space.Compact block>
      <InputNumber aria-label="Map cell index" min={0} max={65535} value={cellIndex} onChange={value => setCellIndex(Math.max(0, Math.trunc(Number(value ?? 0))))} style={{ width: '25%', ...numericStyle }} addonBefore="Cell" />
      <InputNumber aria-label="Map cell tile" min={0} max={1023} value={tileIndex} onChange={value => setTileIndex(Math.max(0, Math.min(1023, Math.trunc(Number(value ?? 0)))))} style={{ width: '25%', ...numericStyle }} addonBefore="Tile" />
      <InputNumber aria-label="Map cell palette" min={0} max={15} value={paletteId} onChange={value => setPaletteId(Math.max(0, Math.min(15, Math.trunc(Number(value ?? 0)))))} style={{ width: '25%', ...numericStyle }} addonBefore="Pal" />
      <Button size="small" onClick={() => commit([
        ...overrides.filter(item => item.index !== cellIndex),
        { index: cellIndex, tileIndex, paletteId, horizontalFlip, verticalFlip },
      ].sort((left, right) => left.index - right.index))}>Apply</Button>
    </Space.Compact>
    <Space size={8} wrap>
      <Checkbox checked={horizontalFlip} onChange={event => setHorizontalFlip(event.target.checked)}>Flip X</Checkbox>
      <Checkbox checked={verticalFlip} onChange={event => setVerticalFlip(event.target.checked)}>Flip Y</Checkbox>
    </Space>
    {overrides.map(override => <Space key={override.index} size={4}>
      <Tag>Cell {override.index}: tile {override.tileIndex}{override.horizontalFlip ? ' ↔' : ''}{override.verticalFlip ? ' ↕' : ''}, pal {override.paletteId ?? 0}</Tag>
      <Button size="small" danger onClick={() => commit(overrides.filter(item => item.index !== override.index))}>Remove</Button>
    </Space>)}
  </Space>;
};

const TileMapPreview: React.FC<{
  scene: ISceneSettings;
  layerId: number;
  targetTileIndex: number;
  frameTileIndex: number;
  tileset: { image: HTMLImageElement | HTMLCanvasElement; tileWidth: number; tileHeight: number; columns: number; rows: number; source?: string };
  paletteOptions: Array<{ id: string; name: string; colors: string[] }>;
}> = ({ scene, layerId, targetTileIndex, frameTileIndex, tileset, paletteOptions }) => {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const layer = scene.backgrounds?.find(item => item.layerId === layerId);
  const tileMap = layer?.tileMap ?? (layerId === 0 ? scene.tileMap : undefined);
  const tilePaletteIds = layer?.tilePaletteIds;
  const tileMapCellOverrides = layer?.tileMapCellOverrides ?? [];
  const paletteIds = [...new Set((layer?.tilePaletteIds ?? []).flat().filter((id): id is string => Boolean(id && id !== '__original__')))].slice(0, 16);
  const paletteSignature = paletteIds.map(id => {
    const palette = paletteOptions.find(item => item.id === id);
    return `${id}:${palette?.colors.join(',') ?? ''}`;
  }).join('|');
  const [paletteImages, setPaletteImages] = useState<Record<string, HTMLCanvasElement>>({});

  useEffect(() => {
    let cancelled = false;
    if (!tileset.source || !paletteIds.length) {
      setPaletteImages({});
      return () => { cancelled = true; };
    }
    const load = async () => {
      const entries = await Promise.all(paletteIds.map(async id => {
        const palette = paletteOptions.find(item => item.id === id);
        if (!palette) return null;
        const image = await loadPaletteTransparentImage(tileset.source!, palette.colors);
        return image ? [id, image] as const : null;
      }));
      if (!cancelled) setPaletteImages(Object.fromEntries(entries.filter((entry): entry is readonly [string, HTMLCanvasElement] => Boolean(entry))));
    };
    void load();
    return () => { cancelled = true; };
  }, [paletteSignature, tileset.source]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context || !tileMap?.length) return;
    const sourceWidth = Math.max(1, tileMap[0]?.length ?? 1) * tileset.tileWidth;
    const sourceHeight = Math.max(1, tileMap.length) * tileset.tileHeight;
    const scale = Math.min(1, 256 / sourceWidth, 160 / sourceHeight);
    canvas.width = Math.max(1, Math.floor(sourceWidth * scale));
    canvas.height = Math.max(1, Math.floor(sourceHeight * scale));
    context.imageSmoothingEnabled = false;
    context.fillStyle = '#333';
    context.fillRect(0, 0, canvas.width, canvas.height);
    const perRow = Math.max(1, tileset.columns);
    tileMap.forEach((row, rowIndex) => row.forEach((tile, columnIndex) => {
      if (!Number.isFinite(tile) || tile < 0) return;
      const cellIndex = rowIndex * (tileMap[0]?.length ?? 0) + columnIndex;
      const cellOverride = tileMapCellOverrides.find(override => override.index === cellIndex);
      const authoredTile = cellOverride?.tileIndex ?? tile;
      const effectiveTile = authoredTile === targetTileIndex ? frameTileIndex : authoredTile;
      const sourceColumn = effectiveTile % perRow;
      const sourceRow = Math.floor(effectiveTile / perRow);
      const paletteId = tilePaletteIds?.[rowIndex]?.[columnIndex];
      const paletteImage = paletteId && paletteId !== '__original__' ? paletteImages[paletteId] : undefined;
      const destinationX = columnIndex * tileset.tileWidth * scale;
      const destinationY = rowIndex * tileset.tileHeight * scale;
      const destinationWidth = tileset.tileWidth * scale;
      const destinationHeight = tileset.tileHeight * scale;
      const horizontalFlip = cellOverride?.horizontalFlip === true;
      const verticalFlip = cellOverride?.verticalFlip === true;
      context.save();
      context.translate(
        horizontalFlip ? destinationX + destinationWidth : destinationX,
        verticalFlip ? destinationY + destinationHeight : destinationY,
      );
      context.scale(horizontalFlip ? -1 : 1, verticalFlip ? -1 : 1);
      context.drawImage(
        paletteImage ?? tileset.image,
        sourceColumn * tileset.tileWidth,
        sourceRow * tileset.tileHeight,
        tileset.tileWidth,
        tileset.tileHeight,
        0,
        0,
        destinationWidth,
        destinationHeight,
      );
      context.restore();
    }));
  }, [frameTileIndex, targetTileIndex, tileMap, tilePaletteIds, tileMapCellOverrides, tileset, paletteImages]);

  if (!tileMap?.length) return <Typography.Text style={{ color: '#aaa', fontSize: 11 }}>No tile map for this layer</Typography.Text>;
  return <div style={{ marginTop: 6 }}>
    <Typography.Text style={{ color: '#aaa', fontSize: 11 }}>Map preview (destination tile {targetTileIndex})</Typography.Text>
    <canvas ref={canvasRef} aria-label={`Tile map preview for layer ${layerId}`} style={{ display: 'block', marginTop: 4, maxWidth: '100%', imageRendering: 'pixelated', background: '#333' }} />
    {paletteIds.length > 0 && <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }} aria-label="Tile map palette metadata">
      {paletteIds.map(id => {
        const palette = paletteOptions.find(item => item.id === id);
        return <Tag key={id} color="default" style={{ margin: 0 }}>
          <span style={{ display: 'inline-flex', width: 12, height: 12, marginRight: 4, verticalAlign: '-2px', background: palette?.colors?.[0] ?? '#666' }} />
          {palette?.name ?? id}
        </Tag>;
      })}
    </div>}
  </div>;
};

const TilePreview: React.FC<{ image: HTMLImageElement | HTMLCanvasElement; tileIndex: number; tileWidth: number; tileHeight: number; columns: number }> = ({ image, tileIndex, tileWidth, tileHeight, columns }) => {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || (!(image instanceof HTMLCanvasElement) && !image.complete)) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, canvas.width, canvas.height);
    const column = Math.max(0, tileIndex % columns);
    const row = Math.max(0, Math.floor(tileIndex / columns));
    context.drawImage(image, column * tileWidth, row * tileHeight, tileWidth, tileHeight, 0, 0, canvas.width, canvas.height);
  }, [image, tileIndex, tileWidth, tileHeight, columns]);
  return <canvas ref={canvasRef} width={64} height={64} aria-label={`Tile ${tileIndex} preview`} style={{ width: 64, height: 64, imageRendering: 'pixelated' }} />;
};

export default TileAnimationEditor;
