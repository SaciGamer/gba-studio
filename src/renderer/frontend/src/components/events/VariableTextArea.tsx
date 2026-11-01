import { resolveTextTemplate } from '../../../../../shared/textTemplate';
import { Input, theme } from 'antd';
import { useEffect, useId, useRef, useState } from 'react';
import type { TextAreaRef } from 'antd/es/input/TextArea';
import { useI18n } from '@/i18n/I18n';
import { isActiveProjectEntry } from '../../../../../shared/projectCollectionEntries';
import { DIALOGUE_MAX_BYTES, utf8ByteLength } from '@/utils/dialogueText';

type Props = { value: string; rows: number; variables: any[]; onChange: (value: string) => void; onFocus?: () => void; onBlur?: () => void };

export default function VariableTextArea({ value, rows, variables, onChange, onFocus, onBlur }: Props) {
  const { t } = useI18n();
  const { token } = theme.useToken();
  const input = useRef<TextAreaRef>(null);
  const listId = useId();
  const [caret, setCaret] = useState(value.length);
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [active, setActive] = useState(0);
  useEffect(() => {
    const compact = value.replace(/\$\{([^}]+)\}/g, (reference, id) => {
      const variable = variables?.find(entry => isActiveProjectEntry(entry) && entry.id === id);
      return variable?.symbol && !id.startsWith('__PARAM__:') ? '${' + String(variable.symbol).replace(/^\$/, '') + '}' : reference;
    });
    if (compact !== value) onChange(compact);
  }, [value, variables, onChange]);
  const match = value.slice(0, caret).match(/\$(?:\{)?([A-Za-z0-9_]*)$/);
  const suggestions = focused && !dismissed && match ? (variables ?? []).filter(isActiveProjectEntry)
    .filter(variable => `${variable.symbol ?? ''} ${variable.name ?? ''}`.toLowerCase().includes(match[1].toLowerCase())) : [];
  const selected = Math.min(active, Math.max(0, suggestions.length - 1));
  const insert = (variable: any) => {
    if (!match) return;
    const reference = String(variable.id?.startsWith('__PARAM__:') ? variable.id : variable.symbol || variable.id).replace(/^\$/, '');
    const start = caret - match[0].length;
    // Replace the rest of a partially typed token while preserving surrounding prose.
    const tail = value.slice(caret).match(/^[A-Za-z0-9_]*\}?/)?.[0].length ?? 0;
    const replacement = '${' + reference + '}';
    const next = value.slice(0, start) + replacement + value.slice(caret + tail);

    const position = start + replacement.length;
    onChange(next);
    setCaret(position);
    setDismissed(true);
    requestAnimationFrame(() => { input.current?.focus(); input.current?.resizableTextArea?.textArea.setSelectionRange(position, position); });
  };
  return <div style={{ position: 'relative' }}>
    <Input.TextArea ref={input} aria-label="Text" rows={rows} status={utf8ByteLength(resolveTextTemplate(value, variables)) > DIALOGUE_MAX_BYTES ? 'error' : undefined}
      aria-autocomplete="list" aria-controls={suggestions.length ? listId : undefined}
      showCount={{ formatter: ({ value: text }) => `${utf8ByteLength(resolveTextTemplate(text, variables))}/${DIALOGUE_MAX_BYTES} bytes` }} value={value}
      onFocus={() => { setFocused(true); onFocus?.(); }} onBlur={() => { setFocused(false); onBlur?.(); }}
      onSelect={event => { const position = event.currentTarget.selectionStart; if (position !== caret) { setCaret(position); setDismissed(false); } }}
      onChange={event => { setCaret(event.target.selectionStart); setActive(0); setDismissed(false); onChange(event.target.value); }}
      onKeyDown={event => {
        if (!suggestions.length || event.nativeEvent.isComposing) return;
        if (event.key === 'Escape') { event.preventDefault(); setDismissed(true); }
        else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setActive((selected + (event.key === 'ArrowDown' ? 1 : suggestions.length - 1)) % suggestions.length); }
        else if (event.key === 'Enter' || event.key === 'Tab') { event.preventDefault(); insert(suggestions[selected]); }
      }} />
    {suggestions.length > 0 && <div id={listId} role="listbox" aria-label={t('values.selectVariable')}
      style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 1100, maxHeight: 240, overflowY: 'auto', background: token.colorBgElevated, boxShadow: token.boxShadowSecondary, border: `1px solid ${token.colorBorder}`, borderRadius: token.borderRadius, padding: 4 }}>
      {suggestions.map((variable, index) => <div key={variable.id} role="option" aria-selected={index === selected}
        onMouseDown={event => event.preventDefault()} onMouseEnter={() => setActive(index)} onClick={() => insert(variable)}
        style={{ padding: '5px 8px', cursor: 'pointer', color: token.colorText, borderRadius: token.borderRadiusSM, background: index === selected ? token.controlItemBgActive : undefined }}>
        {variable.name || variable.symbol} <span style={{ color: token.colorTextSecondary }}>{'${' + (variable.symbol || variable.id) + '}'}</span>
      </div>)}
    </div>}
  </div>;
}
