import type { CSSProperties, ReactNode } from 'react';
import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Badge, Tooltip, theme } from 'antd';
import { useI18n } from '@/i18n/I18n';

export default function WarningIndicator({ message, count, onClick }: { message: string; count?: number; onClick?: () => void }) {
  const { token } = theme.useToken();
  return <Tooltip title={message} trigger={['hover', 'focus']} zIndex={10000} getPopupContainer={() => document.body}>
    <span role={onClick ? 'button' : 'img'} aria-disabled={onClick ? false : undefined} aria-label={message} tabIndex={0} onClick={event => { event.stopPropagation(); onClick?.(); }} onKeyDown={event => {
      if (onClick && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); event.stopPropagation(); onClick(); }
    }} style={{ position: 'relative', zIndex: 5, display: 'flex', alignItems: 'flex-start', lineHeight: 0, width: 0, height: 0, flexShrink: 0, overflow: 'visible', pointerEvents: 'auto', cursor: onClick ? 'pointer' : 'help' }}>
      <Badge count={count !== undefined && count > 0 ? count : '!'} title="" size="small" color={token.colorWarning} style={{ zIndex: 5 }}><span style={{ display: 'block', width: 0, height: 0 }} /></Badge>
    </span>
  </Tooltip>;
}

export function AttentionLabel({ label, count }: { label: ReactNode; count: number }) {
  const { t } = useI18n();
  return <span className="gba-attention-label" style={{ display: 'inline-block', position: 'relative', zIndex: 2, marginRight: count > 0 ? 8 : 0 }}>{label}{count > 0 && <span className="gba-attention-anchor" style={{ position: 'absolute', top: 2, right: 0, zIndex: 5 }}><WarningIndicator message={t('events.hierarchyWarning')} count={count} /></span>}</span>;
}

export function WarningField({ warning, message, children, style, overlay = false }: { warning: boolean; message: string; children: ReactNode; style?: CSSProperties; overlay?: boolean }) {
  const anchor = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  useLayoutEffect(() => {
    if (!warning || !overlay || !anchor.current) return;
    const element = anchor.current;
    const update = () => {
      const rect = element.getBoundingClientRect();
      const visible = rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight;
      setPosition(previous => visible
        ? previous?.top === rect.top && previous.left === rect.right ? previous : { top: rect.top, left: rect.right }
        : null);
    };
    update();
    let frame: number;
    const trackPosition = () => { update(); frame = requestAnimationFrame(trackPosition); };
    frame = requestAnimationFrame(trackPosition);
    const observer = new ResizeObserver(update);
    observer.observe(element);
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [warning, overlay]);
  return <div ref={anchor} style={{ position: 'relative', width: '100%', overflow: 'visible', ...style }}>{children}{warning && (overlay
    ? position && createPortal(<span data-warning-overlay style={{ position: 'fixed', ...position, width: 0, height: 0, zIndex: 10001, overflow: 'visible' }}><WarningIndicator message={message} /></span>, document.body)
    : <span style={{ position: 'absolute', top: 0, right: 0, zIndex: 5 }}><WarningIndicator message={message} /></span>)}</div>;
}
