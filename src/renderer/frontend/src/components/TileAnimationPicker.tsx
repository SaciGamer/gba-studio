import { Button, Flex, Modal, Space, Typography, theme } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@/i18n/I18n';

export interface AnimationTileset {
  id: string;
  name: string;
  image: HTMLImageElement | HTMLCanvasElement;
  tileWidth: number; tileHeight: number; columns: number; rows: number; source?: string;
}

export default function TileAnimationPicker({ tilesets, tilesetId, value, title, onSelect, onClose }: {
  tilesets: AnimationTileset[]; tilesetId: string; value: number; title: string;
  onSelect: (tile: number, tilesetId: string) => void; onClose: () => void;
}) {
  const { t } = useI18n();
  const { token } = theme.useToken();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selectedTilesetId, setSelectedTilesetId] = useState(tilesetId);
  useEffect(() => setSelectedTilesetId(tilesetId), [tilesetId]);
  const tileset = tilesets.find(item => item.id === selectedTilesetId) ?? tilesets[0];
  const count = Math.min(1024, Math.max(0, tileset?.columns * tileset?.rows || 0));
  const columns = Math.max(1, tileset.columns);
  const rows = Math.ceil(count / columns);
  const cellSize = 40;
  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if(!canvas || !context || !tileset || !count) return;
    canvas.width = columns * tileset.tileWidth;
    canvas.height = rows * tileset.tileHeight;
    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(tileset.image, 0, 0);
  }, [tileset, count, columns, rows]);

  return <Modal open title={title} onCancel={onClose} footer={null} width={720} destroyOnClose>
    <Typography.Paragraph type="secondary">{t('tileAnimations.pickerHint')}</Typography.Paragraph>
    <Space direction="vertical" size={8} style={{ display: 'flex' }}>
      <Flex role="group" aria-label={t('tileAnimations.sourceTileset')} gap={4} wrap>
        {tilesets.map(item => <Button key={item.id} size="small" type={tileset?.id === item.id ? 'primary' : 'default'} aria-pressed={tileset?.id === item.id} onClick={() => setSelectedTilesetId(item.id)}>{item.name}</Button>)}
      </Flex>
      <div style={{ maxHeight: 'min(55vh, 420px)', overflow: 'auto', border: `1px solid ${token.colorBorder}`, borderRadius: token.borderRadius, background: token.colorFillTertiary }}>
      <div style={{ position: 'relative', width: columns * cellSize, height: rows * cellSize }}>
        <canvas ref={canvasRef} aria-label={t('tileAnimations.tilesetPreview')} style={{ display: 'block', width: columns * cellSize, height: rows * cellSize, imageRendering: 'pixelated' }} />
        <div style={{ position: 'absolute', inset: 0, display: 'grid', gridTemplateColumns: `repeat(${columns}, ${cellSize}px)`, gridAutoRows: cellSize }}>
          {Array.from({ length: count }, (_, tile) => <button key={tile} type="button" aria-label={t('tileAnimations.chooseTile', { tile })} aria-pressed={value === tile}
            onClick={() => { onSelect(tile, tileset.id); onClose(); }} title={t('tileAnimations.tileNumber', { tile })}
            style={{ position: 'relative', padding: 0, cursor: 'pointer', border: `1px solid ${token.colorBorderSecondary}`, background: 'transparent', outline: value === tile ? `3px solid ${token.colorPrimary}` : undefined, outlineOffset: -3 }}>
            <span style={{ position: 'absolute', bottom: 0, right: 0, paddingInline: 2, fontSize: 9, lineHeight: '12px', color: token.colorTextLightSolid, background: 'rgba(0,0,0,.65)' }}>{tile}</span>
          </button>)}
        </div>
      </div>
      </div>
    </Space>
  </Modal>;
}
