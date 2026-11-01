import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '@/i18n/I18n';
import type { IScriptsElement } from '@/providers/contexts/interfaces/ISceneElement';
import { floatingPreviewTop } from '@/utils/floatingPreviewPosition';
import useEventPreviewArea from './useEventPreviewArea';

/** Uses the same event hover/focus area and lateral placement as dialogue previews. */
export default function CameraFollowPreview({ event, children }: { event: IScriptsElement; children: ReactNode }) {
  const { t } = useI18n();
  const body = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const close = () => setAnchor(null);
  const area = useEventPreviewArea(body, event.id, element => {
    window.dispatchEvent(new CustomEvent('gba-studio:event-preview-open', { detail: { eventId: event.id } }));
    setAnchor(element.getBoundingClientRect());
  }, close, event.args?.__collapse);
  useEffect(() => { close(); }, [event.id, event.args?.__collapse]);
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
  const width = Math.max(0, Math.min(240, Number(event.args?.deadZoneWidth) || 0));
  const height = Math.max(0, Math.min(160, Number(event.args?.deadZoneHeight) || 0));
  return <div ref={body}>{children}{anchor && createPortal(
    <div role="region" aria-label={t('events.cameraFollow.preview')} style={{ position: 'fixed', left: Math.max(8, anchor.left - 252), top: floatingPreviewTop(anchor.top, 192), width: 240, pointerEvents: 'none', zIndex: 2000, background: '#202833', color: '#fff', boxShadow: '0 2px 12px #0008' }}>
      <div style={{ height: 32, padding: '6px 8px', boxSizing: 'border-box', fontSize: 12 }}>{t('events.cameraFollow.preview')} · {width} × {height} px</div>
      <div data-testid="camera-follow-viewport" style={{ position: 'relative', width: 240, height: 160, overflow: 'hidden', outline: '1px solid #91caff', outlineOffset: -1, backgroundImage: 'linear-gradient(#ffffff10 1px, transparent 1px), linear-gradient(90deg, #ffffff10 1px, transparent 1px)', backgroundSize: '16px 16px' }}>
        <div style={{ position: 'absolute', left: 120, top: 0, height: 160, borderLeft: '1px dashed #ffffff40' }} />
        <div style={{ position: 'absolute', top: 80, left: 0, width: 240, borderTop: '1px dashed #ffffff40' }} />
        <div data-testid="camera-follow-central-area" data-width={width} data-height={height} style={{ position: 'absolute', left: (240 - width) / 2, top: (160 - height) / 2, width: Math.max(1, width), height: Math.max(1, height), boxSizing: 'border-box', border: '1px solid #73d13d', background: '#73d13d30' }} />
        {event.args?.actorId && <div style={{ position: 'absolute', left: 117, top: 77, width: 6, height: 6, background: '#ffd666', borderRadius: '50%', boxShadow: '0 0 0 1px #111' }} />}
      </div>
    </div>, document.body,
  )}</div>;
}
