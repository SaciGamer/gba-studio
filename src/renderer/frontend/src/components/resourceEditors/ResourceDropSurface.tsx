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
}

type DroppedFile = File & { path?: string };

export default function ResourceDropSurface({ children, onFiles, onText, hint = 'Drop compatible files here', dropTargets }: ResourceDropSurfaceProps) {
  const { token } = theme.useToken();
  const [active, setActive] = useState(false);
  const dragDepth = useRef(0);

  const clearDragState = () => {
    dragDepth.current = 0;
    setActive(false);
  };

  const isInternalEditorDrag = (event: React.DragEvent<HTMLDivElement>) =>
    Array.from(event.dataTransfer.types).includes('application/x-gba-studio-frame');

  const handleDrop = (event: React.DragEvent<HTMLDivElement>, targetId?: string) => {
    event.preventDefault();
    if (isInternalEditorDrag(event)) {
      event.stopPropagation();
      clearDragState();
      return;
    }
    clearDragState();
    const files = Array.from(event.dataTransfer.files)
      .map(file => (file as DroppedFile).path)
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
      style={{ position: 'relative', width: '100%', height: '100%', minHeight: 180 }}
      onDragEnter={event => {
        if (isInternalEditorDrag(event)) return;
        event.preventDefault();
        dragDepth.current += 1;
        setActive(true);
      }}
      onDragOver={event => {
        if (isInternalEditorDrag(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
        setActive(true);
      }}
      onDragLeave={event => {
        if (isInternalEditorDrag(event)) return;
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        const bounds = event.currentTarget.getBoundingClientRect();
        const pointerIsInside = event.clientX >= bounds.left && event.clientX <= bounds.right && event.clientY >= bounds.top && event.clientY <= bounds.bottom;
        if (!pointerIsInside) clearDragState();
      }}
      onDragEnd={clearDragState}
      onDrop={handleDrop}
    >
      {children}
      {active && <Flex style={{ position: 'absolute', inset: 8, zIndex: 20, border: `2px dashed ${token.colorPrimary}`, background: token.colorBgContainer, opacity: 0.96, overflow: 'hidden' }}>
        {dropTargets?.length ? dropTargets.map(target => <Flex
          key={target.id}
          vertical
          align="center"
          justify="center"
          gap={8}
          style={{ flex: 1, minWidth: 0, cursor: 'copy', borderLeft: target.id === dropTargets[0].id ? 'none' : `1px solid ${token.colorBorderSecondary}` }}
          onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; }}
          onDrop={event => { event.stopPropagation(); handleDrop(event, target.id); }}
        >
          <InboxOutlined style={{ fontSize: 32, color: token.colorPrimary }} />
          <Typography.Text strong style={{ textAlign: 'center', paddingInline: 12 }}>{target.label}</Typography.Text>
        </Flex>) : <Flex vertical align="center" justify="center" gap={8} style={{ flex: 1, pointerEvents: 'none' }}>
          <InboxOutlined style={{ fontSize: 32, color: token.colorPrimary }} />
          <Typography.Text strong>{hint}</Typography.Text>
        </Flex>}
      </Flex>}
    </div>
  );
}
