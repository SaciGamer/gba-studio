import React, { memo, useEffect, useState } from 'react';

// Keep viewport state here so scrolling never rerenders the editor and inspector.
export default memo(function TrackerRollNoteLayer({ scrollRef, gridWidth, children }: {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  gridWidth: number;
  children: React.ReactElement<{ style: React.CSSProperties; className: string }>[];
}) {
  const [window, setWindow] = useState({ start: 0, end: gridWidth * 64 });
  useEffect(() => {
    const scroll = scrollRef.current;
    if (!scroll) return;
    let frame: number | null = null;
    const update = () => {
      frame = null;
      const block = gridWidth * 32;
      const start = Math.max(0, (Math.floor(scroll.scrollLeft / block) - 1) * block);
      const end = (Math.ceil((scroll.scrollLeft + scroll.clientWidth) / block) + 1) * block;
      setWindow(previous => previous.start === start && previous.end === end ? previous : { start, end });
    };
    const schedule = () => { if (frame === null) frame = requestAnimationFrame(update); };
    update();
    scroll.addEventListener('scroll', schedule, { passive: true });
    const observer = new ResizeObserver(schedule);
    observer.observe(scroll);
    return () => {
      scroll.removeEventListener('scroll', schedule);
      observer.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [scrollRef, gridWidth]);
  return <>{children.filter(child => {
    const { style, className } = child.props;
    const left = Number(style.left);
    // Retain selected/dragged sources to preserve focus and pointer capture.
    return className.includes('selected') || className.includes('note-preview-source')
      || left < window.end && left + Number(style.width) > window.start;
  })}</>;
});
