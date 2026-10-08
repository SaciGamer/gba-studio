import useAppContexts from '@/providers/contexts/AppContexts';
import { ETypeScene, IScriptsElement } from '@/providers/contexts/interfaces/ISceneElement';
import { Button, Col, Form, Row, Segmented, Select, Switch, Tooltip } from 'antd';
import { EEvents } from './interfaces/IEvents';
import { IChangePaletteBackgroundArgs, IVisibleBackgroundArgs } from './interfaces/ILayer';
import { useEffect, useRef, useState } from 'react';
import { loadPaletteLibrary } from '../resourceEditors/paletteLibrary';

interface BackgroundEventProps {
  event: IScriptsElement | undefined;
  onValueChange: (eventId: string, eventArgs: IVisibleBackgroundArgs | IChangePaletteBackgroundArgs) => void;
}

const getLayerOptions = (singleLayer: boolean) => (singleLayer ? [2] : [0, 1, 2, 3]).map(value => ({ value, label: `Layer ${value}` }));

function GreenSwapThumbnail({ src, width, height, alt }: { src: string; width: number; height: number; alt: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const image = new Image();
    image.onload = () => {
      const canvas = canvasRef.current;
      const context = canvas?.getContext('2d', { willReadFrequently: true });
      if (!canvas || !context) return;
      canvas.width = width;
      canvas.height = height;
      const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
      const sourceWidth = width / scale;
      const sourceHeight = height / scale;
      const sourceX = (image.naturalWidth - sourceWidth) / 2;
      const sourceY = (image.naturalHeight - sourceHeight) / 2;
      context.imageSmoothingEnabled = false;
      context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, width, height);
      const pixels = context.getImageData(0, 0, width, height);
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x + 1 < width; x += 2) {
          const first = (y * width + x) * 4;
          const second = first + 4;
          const firstGreen = pixels.data[first + 1] >> 3;
          const secondGreen = pixels.data[second + 1] >> 3;
          pixels.data[first + 1] = (secondGreen << 3) | (secondGreen >> 2);
          pixels.data[second + 1] = (firstGreen << 3) | (firstGreen >> 2);
        }
      }
      context.putImageData(pixels, 0, 0);
    };
    image.src = src;
    return () => { image.onload = null; };
  }, [src, width, height]);

  return <canvas ref={canvasRef} aria-label={`${alt} with green swap`} style={{ display: 'block', boxSizing: 'border-box', width, height, imageRendering: 'pixelated', border: '1px solid rgba(127,127,127,.35)' }} />;
}

export function CurrentBackgroundThumbnail({ eventId, layerId, width = 64, height = 40, greenSwap = false }: { eventId?: string; layerId: number; width?: number; height?: number; greenSwap?: boolean }) {
  const { elementSelected, backgrounds, settingUtils } = useAppContexts();
  const scripts = elementSelected?.script ?? [];
  const eventIndex = scripts.findIndex((script: IScriptsElement) => script.id === eventId);
  const previousBackgroundChange = (eventIndex < 0 ? scripts : scripts.slice(0, eventIndex))
    .slice()
    .reverse()
    .find((script: IScriptsElement) => script.args?.__comment !== true && script.command === EEvents.CHANGE_LAYER && (script.args as { layerId?: number })?.layerId === layerId);
  const backgroundId = (previousBackgroundChange?.args as { backgroundId?: string | null } | undefined)?.backgroundId
    ?? elementSelected?.backgrounds?.find((background: any) => background.layerId === layerId)?.backgroundId;
  const background = backgrounds.find(item => item.id === backgroundId && !item._deleted);

  if (!background) {
    return <div
      aria-label="No background preview"
      title="No background"
      style={{ boxSizing: 'border-box', width, height, border: '1px dashed rgba(127,127,127,.65)', background: 'repeating-conic-gradient(#ddd 0% 25%, #f5f5f5 0% 50%) 50% / 12px 12px', display: 'grid', placeItems: 'center', color: '#777', fontSize: 10 }}
    >Empty</div>;
  }

  const imageSource = `${background.hd ? settingUtils.localImagePathHD : settingUtils.localImagePath}/${background.filename}`;
  if (greenSwap) return <GreenSwapThumbnail src={imageSource} width={width} height={height} alt={background.name} />;
  return <img
    src={imageSource}
    alt={background.name}
    title={previousBackgroundChange ? `${background.name} (changed earlier in this script)` : background.name}
    style={{ display: 'block', boxSizing: 'border-box', width, height, objectFit: 'cover', imageRendering: 'pixelated', border: '1px solid rgba(127,127,127,.35)' }}
  />;
}

const PaletteSwatch = ({ colors }: { colors: string[] }) =>
  <span style={{ width: 26, height: 26, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gridTemplateRows: 'repeat(4, 1fr)', overflow: 'hidden', border: '1px solid rgba(127,127,127,.5)', borderRadius: 2 }}>
    {colors.slice(0, 16).map((color, index) => <i key={index} style={{ background: color }} />)}
  </span>;

const UnavailablePaletteSlot = () => <span aria-label="Unavailable palette slot" style={{ width: 26, height: 26, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gridTemplateRows: 'repeat(4, 1fr)', overflow: 'hidden', border: '1px solid rgba(127,127,127,.5)', borderRadius: 2 }}>
  {Array.from({ length: 16 }, (_, index) => <i key={index} style={{ background: index % 2 ? 'rgba(127,127,127,.18)' : 'rgba(127,127,127,.3)' }} />)}
</span>;

const EmptyPaletteSlot = ({ index }: { index: number }) => <span aria-label={`Empty palette slot ${index + 1}`} style={{ width: 26, height: 26, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gridTemplateRows: 'repeat(4, 1fr)', overflow: 'hidden', border: '1px dashed rgba(127,127,127,.6)', borderRadius: 2 }}>
  {Array.from({ length: 16 }, (_, cell) => <i key={cell} style={{ background: cell % 2 ? 'rgba(127,127,127,.05)' : 'rgba(127,127,127,.12)' }} />)}
</span>;

export function VisibleBackgroundEvent({ event, onValueChange }: BackgroundEventProps) {
  const { elementSelected } = useAppContexts();
  const args = event?.args as IVisibleBackgroundArgs;
  const singleLayer = elementSelected?.sceneType === ETypeScene.LOGO || elementSelected?.sceneType === ETypeScene.POINTNCLICK;
  const layerId = singleLayer ? 2 : args?.layerId ?? 0;
  const update = (changes: Partial<IVisibleBackgroundArgs>) => onValueChange(event?.id!, { ...args, layerId, visible: args?.visible ?? true, ...changes });

  return <Form layout="vertical">
    <Form.Item label="Current background">
      <Segmented value={layerId} onChange={(value) => update({ layerId: value as number })} options={getLayerOptions(singleLayer)} />
    </Form.Item>
    <CurrentBackgroundThumbnail eventId={event?.id} layerId={layerId} />
    <Form.Item label="Visible" style={{ marginTop: 12 }}>
      <Switch checked={args?.visible ?? true} onChange={(visible) => update({ visible })} />
    </Form.Item>
  </Form>;
}

export function ChangePaletteBackgroundEvent({ event, onValueChange }: BackgroundEventProps) {
  const { palettes, elementSelected, backgrounds, settingUtils } = useAppContexts();
  const availablePalettes = palettes.palettes.length ? palettes.palettes : loadPaletteLibrary();
  const args = event?.args as IChangePaletteBackgroundArgs;
  const singleLayer = elementSelected?.sceneType === ETypeScene.LOGO || elementSelected?.sceneType === ETypeScene.POINTNCLICK;
  const layerId = singleLayer ? 2 : args?.layerId ?? 0;
  const scripts = elementSelected?.script ?? [];
  const eventIndex = scripts.findIndex((script: IScriptsElement) => script.id === event?.id);
  const previousBackgroundChange = (eventIndex < 0 ? scripts : scripts.slice(0, eventIndex)).slice().reverse().find((script: IScriptsElement) => script.args?.__comment !== true && script.command === EEvents.CHANGE_LAYER && (script.args as { layerId?: number })?.layerId === layerId);
  const currentBackgroundId = (previousBackgroundChange?.args as { backgroundId?: string | null } | undefined)?.backgroundId
    ?? elementSelected?.backgrounds?.find((background: any) => background.layerId === layerId)?.backgroundId;
  const currentBackground = backgrounds.find(background => background.id === currentBackgroundId && !background._deleted);
  const [paletteSlotCount, setPaletteSlotCount] = useState(16);
  const restorePalette = args?.restorePaletteLayerDefault === true;

  useEffect(() => {
    if (!currentBackground?.filename) { setPaletteSlotCount(16); return; }
    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) return;
        context.drawImage(image, 0, 0);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        const colors = new Set<string>();
        for (let index = 0; index < pixels.length; index += 4) {
          if (pixels[index + 3] === 0) continue;
          colors.add(`${pixels[index]},${pixels[index + 1]},${pixels[index + 2]}`);
          if (colors.size > 256) break;
        }
        if (!cancelled) setPaletteSlotCount(Math.max(1, Math.min(16, Math.ceil(colors.size / 16))));
      } catch {
        if (!cancelled) setPaletteSlotCount(16);
      }
    };
    image.onerror = () => { if (!cancelled) setPaletteSlotCount(16); };
    image.src = `${currentBackground.hd ? settingUtils.localImagePathHD : settingUtils.localImagePath}/${currentBackground.filename}`;
    return () => { cancelled = true; };
  }, [currentBackground?.filename, currentBackground?.hd, settingUtils.localImagePath, settingUtils.localImagePathHD]);

  const update = (changes: Partial<IChangePaletteBackgroundArgs>) => onValueChange(event?.id!, {
    ...args,
    layerId,
    paletteIds: args?.paletteIds ?? Array(16).fill(null),
    restorePaletteLayerDefault: restorePalette,
    ...changes,
  });

  return <Form layout="vertical">
    <Form.Item label="Current background">
      <Segmented value={layerId} onChange={(value) => update({ layerId: value as number })} options={getLayerOptions(singleLayer)} />
    </Form.Item>
    <CurrentBackgroundThumbnail eventId={event?.id} layerId={layerId} />
      <Form.Item label="Restore Palette Layer Default" style={{ marginTop: 12 }}>
        <Switch checked={restorePalette} onChange={value => update({ restorePaletteLayerDefault: value, paletteIds: value ? Array(16).fill(null) : (args?.paletteIds ?? Array(16).fill(null)) })} />
      </Form.Item>
      <Form.Item label={`Palette overrides (${paletteSlotCount} slots)`}>
        <Row gutter={[8, 8]}>{Array.from({ length: 16 }, (_, index) => {
        const paletteId = args?.paletteIds?.[index] ?? undefined;
        const unavailable = restorePalette || index >= paletteSlotCount;
        const selectedPalette = availablePalettes.find(palette => palette.id === paletteId);
        const tooltip = unavailable ? undefined : (selectedPalette?.name ?? 'Select Palette');
        return <Col span={6} key={index}><Tooltip title={tooltip} placement="left"><div><Select disabled={unavailable} allowClear placeholder={unavailable ? <UnavailablePaletteSlot /> : <EmptyPaletteSlot index={index} />} value={paletteId} onChange={nextPaletteId => { const paletteIds = [...(args?.paletteIds ?? Array(16).fill(null))]; paletteIds[index] = nextPaletteId ?? null; update({ paletteIds }); }} options={availablePalettes.map(palette => ({ value: palette.id, label: <PaletteSwatch colors={palette.colors} /> }))} optionRender={option => { const palette = availablePalettes.find(item => item.id === option.value); return palette ? <Tooltip title={palette.name} placement="left"><div style={{ width: '100%', minHeight: 26, display: 'flex', alignItems: 'center' }}><PaletteSwatch colors={palette.colors} /></div></Tooltip> : option.label; }} style={{ width: '100%', height: 34 }} styles={{ root: { minHeight: 34, height: 34, display: 'flex', alignItems: 'center' } }} /></div></Tooltip></Col>;
      })}</Row>
    </Form.Item>
  </Form>;
}
