import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '@/i18n/I18n';
import useAppContexts from '@/providers/contexts/AppContexts';
import type { IScriptsElement } from '@/providers/contexts/interfaces/ISceneElement';
import { floatingPreviewTop } from '@/utils/floatingPreviewPosition';
import useEventPreviewArea from './useEventPreviewArea';
import useActorSelf from './useActorSelf';
import { facingTargetPreview, type FacingPreviewActor } from './facingTargetPreviewModel';

export default function FacingTargetPreview({ event, children }: { event: IScriptsElement; children: ReactNode }) {
  const { t } = useI18n();
  const { elementSelected, settings } = useAppContexts();
  const self = useActorSelf();
  const body = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const close = () => setAnchor(null);
  const area = useEventPreviewArea(body, event.id, element => {
    window.dispatchEvent(new CustomEvent('gba-studio:event-preview-open', { detail: { eventId: event.id } }));
    setAnchor(element.getBoundingClientRect());
  }, close, event.args?.__collapse);
  useEffect(() => { close(); }, [event.id, event.args?.__collapse, elementSelected?.id]);
  useEffect(() => {
    const opened = (value: Event) => { if ((value as CustomEvent).detail?.eventId !== event.id) close(); };
    window.addEventListener('gba-studio:event-preview-open', opened);
    return () => window.removeEventListener('gba-studio:event-preview-open', opened);
  }, [event.id]);
  useEffect(() => {
    if (!anchor) return;
    const reposition = () => {
      const rect = area.current?.getBoundingClientRect();
      setAnchor(current => current && rect && rect.bottom > 0 && rect.top < window.innerHeight ? rect : null);
    };
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => { window.removeEventListener('scroll', reposition, true); window.removeEventListener('resize', reposition); };
  }, [Boolean(anchor)]);
  const args = event.args ?? {};
  const resolve = (id: string): FacingPreviewActor | null => {
    if (id === '__PLAYER__') return settings?.startSceneId === elementSelected?.id ? {
      x: Number(settings.startX ?? 0) * 16, y: Number(settings.startY ?? 0) * 16,
      direction: settings.startDirection ?? 'right', name: t('values.player'),
    } : null;
    const actor = id === '__SELF__' ? self.actor : elementSelected?.actors?.find((item: any) => item.id === id);
    return actor ? { x: Number(actor.x ?? 0), y: Number(actor.y ?? 0), direction: actor.direction ?? 'right', name: actor.name || t('values.actor') } : null;
  };
  const source = resolve(String(args.actorId ?? '__SELF__'));
  const target = resolve(String(args.targetActorId ?? '__PLAYER__'));
  const model = facingTargetPreview(args, source, target);
  const direction = source?.direction ?? 'right';
  const arrows: Record<string, string> = { up: '↑', right: '→', down: '↓', left: '←' };
  const color = model.matches === false ? '#ff7875' : model.matches === true ? '#95de64' : '#91caff';
  const status = model.dynamic ? 'dynamic' : model.matches === null ? 'unavailable' : model.matches ? 'matches' : 'misses';
  const grid = Math.max(8, 16 * model.scale);
  const limit = (enabled: boolean, value: number | null) => !enabled ? '—' : value === null ? '?' : value === 0 ? '∞' : `${value} px`;
  return <div ref={body}>{children}{anchor && createPortal(
    <div role="region" aria-label={t('events.facing.preview')} data-testid="facing-preview" data-result={status}
      style={{ position: 'fixed', left: Math.max(8, anchor.left - 252), top: floatingPreviewTop(anchor.top, 260), width: 240, pointerEvents: 'none', zIndex: 2000, background: '#202833', color: '#fff', boxShadow: '0 2px 12px #0008' }}>
      <div style={{ padding: '6px 8px', fontSize: 12 }}>{t('events.facing.preview')}</div>
      <div style={{ padding: '0 8px 6px', fontSize: 10 }}>X: {limit(args.lookX !== false, model.distanceX)} · Y: {limit(args.lookY !== false, model.distanceY)}</div>
      <svg width="240" height="160" viewBox="0 0 240 160" aria-label={t('events.facing.area')}
        style={{ display: 'block', outline: '1px solid #91caff', outlineOffset: -1, backgroundImage: 'linear-gradient(#ffffff10 1px, transparent 1px), linear-gradient(90deg, #ffffff10 1px, transparent 1px)', backgroundSize: `${grid}px ${grid}px` }}>
        <path d="M120 0V160M0 80H240" stroke="#ffffff40" strokeDasharray="3 3" />
        {model.points && <polygon data-testid="facing-preview-area" points={model.points} fill="#73d13d30" stroke="#73d13d" />}
        {source && target && <line x1="120" y1="80" x2={120 + model.dx * model.scale} y2={80 + model.dy * model.scale} stroke={color} strokeDasharray="3 3" />}
        <circle cx="120" cy="80" r="5" fill="#ffd666" stroke="#111" />
        <text x="120" y="68" textAnchor="middle" fill="#ffd666" fontSize="20">{arrows[direction]}</text>
        <text x="120" y="101" textAnchor="middle" fill="#fff" fontSize="10">{(source?.name || t('events.facing.source')).slice(0, 18)}</text>
        {source && target && <g data-testid="facing-preview-target" transform={`translate(${120 + model.dx * model.scale} ${80 + model.dy * model.scale})`}>
          <circle r="5" fill={color} stroke="#111" /><text y="-9" textAnchor="middle" fill={color} fontSize="10">{target.name.slice(0, 18)}</text>
        </g>}
      </svg>
      <div style={{ padding: '6px 8px', fontSize: 11, color }}>{t(`events.facing.${status}`)}</div>
      <div style={{ padding: '0 8px 6px', fontSize: 10, opacity: 0.75 }}>{t(source ? 'events.facing.editorPositions' : 'events.facing.illustration')}</div>
    </div>, document.body,
  )}</div>;
}
