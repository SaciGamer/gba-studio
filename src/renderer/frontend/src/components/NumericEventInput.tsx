import React from 'react';
import NumericValueInput from './NumericValueInput';

/** Adapt legacy literal fields while retaining the shared AST for variations. */
export default function NumericEventInput({ value, onChange, ...props }: {
  value: unknown; onChange: (value: any) => void; label?: string; min?: number; max?: number; style?: React.CSSProperties; renderNumber?: (value: number, onChange: (value: number) => void) => React.ReactNode;
}) {
  return <NumericValueInput {...props} value={value} onChange={next => {
    if (next.kind === 'constant' && (next.constant === 'true' || next.constant === 'false') && value && typeof value === 'object' && 'kind' in value && value.kind === 'literal') {
      onChange({ kind: 'literal', type: 'boolean', value: next.constant === 'true' }); return;
    }
    if (next.kind !== 'number') { onChange(next); return; }
    if (value && typeof value === 'object' && 'kind' in value && value.kind === 'literal') onChange({ ...value, value: 'type' in value && value.type === 'boolean' ? next.value !== 0 : next.value });
    else if (value && typeof value === 'object' && 'type' in value && value.type === 'number') onChange({ ...value, value: next.value });
    else onChange(next.value);
  }} />;
}
