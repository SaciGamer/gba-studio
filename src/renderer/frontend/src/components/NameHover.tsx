import React from 'react';
import { Input, theme } from 'antd';
import type { InputProps } from 'antd';
import './NameHover.css';

export function useNameHoverStyle(): React.CSSProperties {
  const { token } = theme.useToken();
  return { '--name-hover-color': token.colorPrimaryHover, '--name-hover-radius': `${token.borderRadius}px` } as React.CSSProperties;
}

export default function NameInput({ className, style, ...props }: InputProps) {
  const hoverStyle = useNameHoverStyle();
  return <Input {...props} className={`editable-name-input ${className ?? ''}`} style={{ ...hoverStyle, ...style }} />;
}
