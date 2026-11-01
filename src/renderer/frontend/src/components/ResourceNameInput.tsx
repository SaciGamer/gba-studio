import React, { useRef, useState } from 'react';
import { Input, theme } from 'antd';

export default function ResourceNameInput({ name, defaultName, label, onChange }: {
  name: string; defaultName: string; label: string; onChange: (name: string) => void;
}) {
  const { token } = theme.useToken();
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(name);
  const [hovered, setHovered] = useState(false);
  const cancelOnBlur = useRef(false);
  return <div style={{ width: '100%', minWidth: 0, height: 44, padding: '5px 10px', boxSizing: 'border-box' }}>
    <Input aria-label={label} value={focused ? draft : name} placeholder={defaultName}
      onChange={event => setDraft(event.target.value)}
      onFocus={() => { setDraft(name); setFocused(true); }}
      onBlur={() => { setFocused(false); if (cancelOnBlur.current) { cancelOnBlur.current = false; setDraft(name); return; } const next = draft.trim() ? draft : defaultName; if (next !== name) onChange(next); }}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancelOnBlur.current = true; setDraft(name); event.currentTarget.blur(); } }}
      onPressEnter={event => event.currentTarget.blur()}
      style={{ width: '100%', minWidth: 0, height: 34, fontSize: token.fontSizeHeading5, fontWeight: 'bold',
        backgroundColor: focused ? undefined : 'transparent',
        borderColor: focused ? undefined : hovered ? token.colorPrimaryHover : 'transparent',
        boxShadow: focused ? undefined : 'none' }} />
  </div>;
}
