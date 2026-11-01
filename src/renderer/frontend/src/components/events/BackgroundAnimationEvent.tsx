import { floatingPreviewTop } from '../../utils/floatingPreviewPosition';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button, Dropdown, Flex, Form, Segmented, Select, Space, Switch, Tooltip, Typography } from 'antd';
import { DownOutlined, PauseOutlined, PlayCircleOutlined, ReloadOutlined } from '@ant-design/icons';
import { InputNumber } from '../StepInputNumber';
import useAppContexts from '@/providers/contexts/AppContexts';
import { ETypeScene, type IArgs, type IScriptsElement } from '@/providers/contexts/interfaces/ISceneElement';
import { useI18n } from '@/i18n/I18n';
import { loadPaletteTransparentImage } from '@/utils/paletteTransparency';
import { loadCachedImage } from '@/utils/imageCache';
import { backgroundSheetGeometry, backgroundAnimationTicks } from '../../../../../shared/events/backgroundSheetAnimation';
import { mergeEventArgs } from '../../../../../shared/events/sceneReferenceCleanup';
import useEventPreviewArea from './useEventPreviewArea';
import { AntdToken } from '../common/AntDToken';

export default function BackgroundAnimationEvent({ event, onValueChange }: { event: IScriptsElement; onValueChange: (id: string, args: IArgs) => void }) {
  const { t } = useI18n();
  const { token } = AntdToken();
  const { elementSelected, backgrounds, settingUtils } = useAppContexts();
  const args = event.args ?? {};
  const speedUnit = args.speedUnit === 'seconds' ? 'seconds' : 'frames';
  const duration = Number(args.durationFrames ?? 10);
  const speedValue = speedUnit === 'seconds' ? Number((duration / 60).toFixed(4)) : duration;
  const bitmap = elementSelected?.sceneType === ETypeScene.LOGO || elementSelected?.sceneType === ETypeScene.POINTNCLICK;
  const background = backgrounds.find(item => item.id === args.backgroundId && !item._deleted);
  const [image, setImage] = useState<HTMLImageElement | HTMLCanvasElement | null>(null);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const [paused, setPaused] = useState(false);
  const [restart, setRestart] = useState(0);
  const [assetRevision, setAssetRevision] = useState(0);
  const [customSpeed, setCustomSpeed] = useState(args.customSpeed === true || ![5, 10, 20].includes(duration));
  const [frame, setFrame] = useState(0);
  const frameRef = useRef(0);
  const body = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null);
  const update = (patch: Record<string, unknown>) => onValueChange(event.id, mergeEventArgs(args, { layerId: bitmap ? 2 : Number(args.layerId ?? 0), ...patch }));
  useEffect(() => {
    const reload = () => setAssetRevision(value => value + 1);
    window.addEventListener('gba-studio:assets-reloaded', reload);
    return () => window.removeEventListener('gba-studio:assets-reloaded', reload);
  }, []);
  useEffect(() => {
    let cancelled = false;
    setImage(null);
    if (background) {
      const path = `${background.hd ? settingUtils.localImagePathHD : settingUtils.localImagePath}/${background.filename}`;
      void (background.hd ? loadCachedImage(path) : loadPaletteTransparentImage(path)).then(value => { if (!cancelled) setImage(value); }).catch(() => undefined);
    }
    return () => { cancelled = true; };
  }, [background?.id, background?.filename, background?.hd, settingUtils.localImagePath, settingUtils.localImagePathHD, assetRevision]);
  useEffect(() => { setAnchor(null); setPaused(false); }, [event.id, event.args?.__collapse]);
  useEffect(() => setCustomSpeed(args.customSpeed === true || ![5, 10, 20].includes(duration)), [event.id, args.customSpeed]);
  useEffect(() => {
    const opened = (value: Event) => { if ((value as CustomEvent).detail?.eventId !== event.id) setAnchor(null); };
    window.addEventListener('gba-studio:event-preview-open', opened);
    return () => window.removeEventListener('gba-studio:event-preview-open', opened);
  }, [event.id]);
  useEffect(() => {
    if (!anchor) return;
    const reposition = () => {
      const rect = previewArea.current?.getBoundingClientRect();
      setAnchor(current => current && rect && rect.bottom > 0 && rect.top < window.innerHeight ? rect : null);
    };
    window.addEventListener('scroll', reposition, true); window.addEventListener('resize', reposition);
    return () => { window.removeEventListener('scroll', reposition, true); window.removeEventListener('resize', reposition); };
  }, [Boolean(anchor)]);
  let geometry: ReturnType<typeof backgroundSheetGeometry> | undefined;
  try {
    if (background) geometry = backgroundSheetGeometry(args, { ...background, imageWidth: image?.width ?? background.imageWidth, imageHeight: image?.height ?? background.imageHeight });
  } catch { /* The field warning and pre-validation describe invalid source/frame settings. */ }
  const geometryKey = JSON.stringify(geometry);
  useEffect(() => { frameRef.current = 0; setFrame(0); }, [event.id, geometryKey, image]);
  useEffect(() => {
    if (!anchor || !image || !geometry) return;
    const started = performance.now();
    let request = 0, previous = -1;
    const initial = frameRef.current;
    const paint = () => {
      const elapsed = paused ? frameRef.current : initial + Math.floor((performance.now() - started) * 60 / 1000 / geometry!.durationFrames);
      const current = geometry!.loop ? elapsed % geometry!.frameCount : Math.min(geometry!.frameCount - 1, elapsed);
      if (current !== previous) {
        previous = current; frameRef.current = current; setFrame(current);
        const context = canvas.current?.getContext('2d');
        if (context) {
          context.clearRect(0, 0, 240, 160); context.imageSmoothingEnabled = false;
          // Move the complete source through the viewport, like startup.
          const sourceFrame = geometry!.frameIndices[current];
          context.drawImage(image, geometry!.direction === 'horizontal' ? -sourceFrame * geometry!.step : 0, geometry!.direction === 'vertical' ? -sourceFrame * geometry!.step : 0);
        }
      }
      request = requestAnimationFrame(paint);
    };
    paint();
    return () => cancelAnimationFrame(request);
  }, [Boolean(anchor), image, geometryKey, paused, restart]);
  const previewArea = useEventPreviewArea(body, event.id, area => {
    window.dispatchEvent(new CustomEvent('gba-studio:event-preview-open', { detail: { eventId: event.id } }));
    setAnchor(area.getBoundingClientRect());
  }, () => setAnchor(null), args.__collapse);
  const number = (key: string, value: number, min: number, max: number) => <Form.Item label={t(`events.bgAnimation.${key}`)} style={{ flex: 1, minWidth: 0 }}><Tooltip mouseEnterDelay={0.6} title={t(`events.bgAnimation.help.${key}`)}><div><InputNumber aria-label={t(`events.bgAnimation.${key}`)} style={{ width: '100%' }} value={value} min={min} max={max} onChange={value => update({ [key]: Number(value ?? 0), ...(['startFrame', 'endFrame'].includes(key) ? { frameCount: 0 } : {}) })} /></div></Tooltip></Form.Item>;
  return <div ref={body}>
    <Form layout="vertical">
      <Form.Item label={t('events.bgTransform.layer')}><Segmented block value={bitmap ? 2 : Number(args.layerId ?? 0)} options={(bitmap ? [2] : [0, 1, 2, 3]).map(id => ({ value: id, label: `${t('events.bgTransform.layer')} ${id}` }))} onChange={layerId => update({ layerId })} /></Form.Item>
      <Form.Item label={t('events.bgAnimation.image')}><Select aria-label={t('events.bgAnimation.image')} showSearch optionFilterProp="label" value={args.backgroundId || undefined} onChange={backgroundId => update({ backgroundId })} options={[bitmap].map(hd => ({ label: t(hd ? 'events.bgAnimation.hd' : 'events.bgAnimation.normal'), options: backgrounds.filter(item => !item._deleted && Boolean(item.hd) === hd).map(item => ({ value: item.id, label: item.name, image: `${item.hd ? settingUtils.localImagePathHD : settingUtils.localImagePath}/${item.filename}` })) }))} optionRender={option => (option.data as { image?: string }).image ? <Space><img src={(option.data as { image?: string }).image} alt="" style={{ width: 40, height: 28, objectFit: 'contain', imageRendering: 'pixelated' }} />{option.label}</Space> : option.label} /></Form.Item>
      {background?.hd && !bitmap && <Typography.Paragraph type="secondary">{t('events.bgAnimation.regularHint')}</Typography.Paragraph>}
      <Form.Item label={t('events.bgAnimation.direction')}><Segmented block value={args.direction ?? 'horizontal'} options={['horizontal', 'vertical'].map(value => ({ value, label: t(`events.bgAnimation.${value}`) }))} onChange={direction => update({ direction })} /></Form.Item>
      <Flex gap={8} align="flex-end">{number('frameWidth', Number(args.frameWidth) || (background?.hd ? 240 : 256), 8, 512)}{number('frameHeight', Number(args.frameHeight) || (background?.hd ? 160 : 256), 8, 512)}</Flex>
      <Flex gap={8} align="flex-end">{number('step', Number(args.step) || (args.direction === 'vertical' ? Number(args.frameHeight) || (background?.hd ? 160 : 256) : Number(args.frameWidth) || (background?.hd ? 240 : 256)), 1, 16384)}</Flex>
      <Flex gap={8} align="flex-end">{number('startFrame', Number(args.startFrame ?? 1), 1, 512)}{number('endFrame', Number(args.endFrame) || Number(args.frameCount) || 0, 0, 512)}</Flex>
      <Typography.Paragraph type="secondary">{t('events.bgAnimation.rangeHint')}</Typography.Paragraph>
      <Form.Item label={t('events.bgAnimation.reverse')}><Tooltip mouseEnterDelay={0.6} title={t('events.bgAnimation.help.reverse')}><Switch aria-label={t('events.bgAnimation.reverse')} checked={args.reverse === true} onChange={reverse => update({ reverse })} /></Tooltip></Form.Item>
      <Form.Item label={t('events.bgAnimation.speed')}>
        <Space.Compact block>
          {customSpeed ? <Dropdown trigger={['click']} menu={{ items: ['frames', 'seconds'].map(unit => ({ key: unit, label: t(unit === 'frames' ? 'events.bgAnimation.framesUnit' : `events.bgAnimation.${unit}`), onClick: () => update({ speedUnit: unit, customSpeed: true }) })) }}>
            <span style={{ display: 'inline-flex' }}><Button aria-label={t('events.bgAnimation.timeUnit')} style={{ backgroundColor: token.colorBgBase }}>{t(speedUnit === 'frames' ? 'events.bgAnimation.framesUnit' : `events.bgAnimation.${speedUnit}`)}</Button></span>
          </Dropdown> : <span style={{ display: 'inline-flex' }}><Button disabled aria-label={t('events.bgAnimation.timeUnit')} style={{ backgroundColor: token.colorBgBase }}>{t('events.bgAnimation.framesUnit')}</Button></span>}
          <Tooltip mouseEnterDelay={0.6} title={t('events.bgAnimation.speedHelp')}>
            {customSpeed ? <InputNumber autoFocus aria-label={t('events.bgAnimation.speed')} style={{ flex: 1, minWidth: 0 }} min={speedUnit === 'seconds' ? 1 / 60 : 1} max={speedUnit === 'seconds' ? 10 : 600} step={speedUnit === 'seconds' ? 1 / 60 : 1} precision={speedUnit === 'seconds' ? 4 : 0} value={speedValue} onChange={value => { if (value !== null) update({ durationFrames: backgroundAnimationTicks(Number(value), speedUnit), customSpeed: true }); }} />
              : <Select aria-label={t('events.bgAnimation.speed')} style={{ flex: 1, minWidth: 0 }} value={[5, 10, 20].includes(duration) ? duration : 'custom'} labelRender={({ value }) => value === 'custom' ? `${t('events.bgAnimation.custom')} (${speedValue})` : t(value === 5 ? 'events.bgAnimation.fast' : value === 20 ? 'events.bgAnimation.slow' : 'events.bgAnimation.medium')} options={[{ value: 20, label: t('events.bgAnimation.slow') }, { value: 10, label: t('events.bgAnimation.medium') }, { value: 5, label: t('events.bgAnimation.fast') }, { value: 'custom', label: t('events.bgAnimation.custom') }]} onSelect={value => { if (value === 'custom') { setCustomSpeed(true); update({ customSpeed: true }); } else update({ durationFrames: Number(value), customSpeed: false }); }} />}
          </Tooltip>
          {customSpeed && <Dropdown trigger={['click']} menu={{ items: [20, 10, 5].map(value => ({ key: String(value), label: t(value === 5 ? 'events.bgAnimation.fast' : value === 20 ? 'events.bgAnimation.slow' : 'events.bgAnimation.medium'), onClick: () => { setCustomSpeed(false); update({ durationFrames: value, customSpeed: false }); } })) }}><Tooltip mouseEnterDelay={0.6} title={t('events.bgAnimation.choosePresets')}><Button aria-label={t('events.bgAnimation.choosePresets')} icon={<DownOutlined />} /></Tooltip></Dropdown>}
        </Space.Compact>
      </Form.Item>
      <Form.Item label={t('events.bgAnimation.loop')}><Tooltip mouseEnterDelay={0.6} title={t('events.bgAnimation.help.loop')}><Switch aria-label={t('events.bgAnimation.loop')} checked={args.loop !== false} onChange={loop => update({ loop })} /></Tooltip></Form.Item>
      <Space>{[<Button key="play" type="text" icon={paused ? <PlayCircleOutlined /> : <PauseOutlined />} aria-label={t(paused ? 'events.bgAnimation.play' : 'events.bgAnimation.pause')} onClick={() => setPaused(value => !value)} />, <Button key="restart" type="text" icon={<ReloadOutlined />} aria-label={t('events.bgAnimation.restart')} onClick={() => { frameRef.current = 0; setFrame(0); setPaused(false); setRestart(value => value + 1); }} />].map((button, index) => <Tooltip key={index} mouseEnterDelay={0.6} title={t(index ? 'events.bgAnimation.restart' : paused ? 'events.bgAnimation.play' : 'events.bgAnimation.pause')}>{button}</Tooltip>)}{geometry && <Typography.Text type="secondary">{t('events.bgAnimation.frames', { count: geometry.frameCount })}</Typography.Text>}</Space>
      {background && !geometry && <Typography.Paragraph type="warning">{t('events.bgAnimation.invalid')}</Typography.Paragraph>}
    </Form>
    {anchor && geometry && image && createPortal(<div aria-label={t('events.bgAnimation.preview')} data-frame={frame} data-source-frame={geometry.frameIndices[frame] + 1} style={{ position: 'fixed', left: Math.max(8, anchor.left - 252), top: floatingPreviewTop(anchor.top, 184), zIndex: 2000, pointerEvents: 'none', background: '#222', boxShadow: '0 2px 12px #0008' }}><canvas ref={canvas} width={240} height={160} style={{ display: 'block', width: 240, height: 160, imageRendering: 'pixelated', background: '#000' }} /><div style={{ padding: '2px 6px', color: '#fff', fontSize: 11 }}>{t('events.bgAnimation.previewFrame', { frame: geometry.frameIndices[frame] + 1, current: frame + 1, count: geometry.frameCount })}</div></div>, document.body)}
  </div>;
}
