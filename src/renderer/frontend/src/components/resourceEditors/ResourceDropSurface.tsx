import { InboxOutlined } from '@ant-design/icons';
import { Flex, theme, Typography } from 'antd';
import React, { ReactNode, useRef, useState } from 'react';

interface DropTarget {
  id: string;
  label: string;
}

interface ResourceDropSurfaceProps {
  children: ReactNode;
  onFiles: (files: string[], targetId?: string) => void;
  onText?: (text: string) => void;
  hint?: string;
  dropTargets?: DropTarget[];
  onAssetPath?: (path: string) => void;
  acceptFiles?: boolean;
  musicWorkspace?: boolean;
}

type DroppedFile = File & { path?: string };

export default function ResourceDropSurface({ children, onFiles, onText, onAssetPath, acceptFiles = true, hint = 'Drop compatible files here', dropTargets, musicWorkspace = false }: ResourceDropSurfaceProps) {
  const { token } = theme.useToken();
  const [active, setActive] = useState(false);
  const [hoveredTarget, setHoveredTarget] = useState<string | null>(null);
  const dragDepth = useRef(0);

  const clearDragState = () => {
    dragDepth.current = 0;
    setActive(false);
    setHoveredTarget(null);
  };

  const isInternalEditorDrag = (event: React.DragEvent<HTMLDivElement>) =>
    Array.from(event.dataTransfer.types).some(type => type === 'application/x-gba-studio-frame' || type === 'application/x-gba-studio-music-order');
  const isInternalAssetDrag = (event: React.DragEvent<HTMLDivElement>) =>
    Array.from(event.dataTransfer.types).includes('application/x-gba-studio-asset-path');
  const isRejectedAssetDrag = (event: React.DragEvent<HTMLDivElement>) => isInternalAssetDrag(event) && !onAssetPath;

  // Images rendered by the engine are draggable in Chromium by default. They
  // are previews, not import sources; dropping one back into the Images
  // editor must never create a duplicate asset. Real file drops still carry
  // the `Files` data type and remain accepted.
  const isInternalPreviewDrag = (event: React.DragEvent<HTMLDivElement>) => {
    const types = Array.from(event.dataTransfer.types);
    return !types.includes('Files') && !types.includes('application/x-gba-studio-asset-path') && (types.includes('text/uri-list') || types.includes('text/html'));
  };
  const isRejectedFileDrag = (event: React.DragEvent<HTMLDivElement>) => !acceptFiles && Array.from(event.dataTransfer.types).includes('Files');

  const handleDrop = (event: React.DragEvent<HTMLDivElement>, targetId?: string) => {
    event.preventDefault();
    if (isInternalEditorDrag(event) || isInternalPreviewDrag(event) || isRejectedFileDrag(event) || isRejectedAssetDrag(event)) {
      event.stopPropagation();
      clearDragState();
      return;
    }
    clearDragState();
    if (isInternalAssetDrag(event)) {
      event.stopPropagation();
      const path = event.dataTransfer.getData('application/x-gba-studio-asset-path');
      if (path) onAssetPath?.(path);
      return;
    }
    const files = Array.from(event.dataTransfer.files)
      .map(file => {
        try {
          return window.electronAPI.getPathForFile?.(file) || (file as DroppedFile).path;
        } catch {
          return (file as DroppedFile).path;
        }
      })
      .filter((filePath): filePath is string => Boolean(filePath));
    if (files.length > 0) {
      onFiles(files, targetId);
      return;
    }
    const text = event.dataTransfer.getData('text/plain').trim();
    if (text && onText) onText(text);
  };

  return (
    <div
      data-music-workspace={musicWorkspace ? 'true' : undefined}
      style={{ position: 'relative', width: '100%', height: '100%', minHeight: 180 }}
      onDragEnter={event => {
        if (isInternalEditorDrag(event) || isInternalPreviewDrag(event) || isRejectedFileDrag(event) || isRejectedAssetDrag(event)) return;
        event.preventDefault();
        dragDepth.current += 1;
        setActive(true);
      }}
      onDragOver={event => {
        if (isInternalEditorDrag(event) || isInternalPreviewDrag(event) || isRejectedFileDrag(event) || isRejectedAssetDrag(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
        setActive(true);
      }}
      onDragLeave={event => {
        if (isInternalEditorDrag(event) || isInternalPreviewDrag(event)) return;
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        const bounds = event.currentTarget.getBoundingClientRect();
        const pointerIsInside = event.clientX >= bounds.left && event.clientX <= bounds.right && event.clientY >= bounds.top && event.clientY <= bounds.bottom;
        if (!pointerIsInside) clearDragState();
      }}
      onDragEnd={clearDragState}
      onDrop={handleDrop}
    >
      {children}
      {active && <div style={{ position: 'absolute', inset: 8, zIndex: 20, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gridTemplateRows: 'repeat(2, minmax(100px, 1fr))', gap: 12, padding: 12, border: `2px dashed ${token.colorPrimary}`, background: token.colorBgContainer, opacity: 0.96, overflow: 'hidden' }}>
        {dropTargets?.length ? dropTargets.map(target => <Flex
          key={target.id}
          vertical
          align="center"
          justify="center"
          gap={8}
          style={{ minWidth: 0, minHeight: 100, cursor: 'copy', border: `1px solid ${hoveredTarget === target.id ? token.colorPrimary : token.colorBorderSecondary}`, borderRadius: token.borderRadius, background: hoveredTarget === target.id ? token.colorFillSecondary : token.colorBgContainer, boxShadow: hoveredTarget === target.id ? `0 4px 16px ${token.colorPrimary}55` : undefined, transform: hoveredTarget === target.id ? 'scale(1.04)' : 'scale(1)', transition: 'transform 160ms ease, background 160ms ease, border-color 160ms ease, box-shadow 160ms ease', transformOrigin: 'center', zIndex: hoveredTarget === target.id ? 1 : 0 }}
          onDragEnter={event => { event.preventDefault(); setHoveredTarget(target.id); }}
          onDragLeave={event => { const next = event.relatedTarget; if (!(next instanceof Node) || !event.currentTarget.contains(next)) setHoveredTarget(null); }}
          onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; setHoveredTarget(target.id); }}
          onDrop={event => { event.stopPropagation(); handleDrop(event, target.id); }}
        >
          <InboxOutlined style={{ fontSize: 32, color: token.colorPrimary }} />
          <Typography.Text strong style={{ textAlign: 'center', paddingInline: 12 }}>{target.label}</Typography.Text>
        </Flex>) : <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, pointerEvents: 'none' }}>
          <InboxOutlined style={{ fontSize: 32, color: token.colorPrimary }} />
          <Typography.Text strong>{hint}</Typography.Text>
        </div>}
      </div>}
    </div>
  );
}
