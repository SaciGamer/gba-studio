import { Space } from 'antd';
import StepInputNumber from '../StepInputNumber';
import { IScriptsElement } from '@/providers/contexts/interfaces/ISceneElement';

export default function CameraEvent({ event, onValueChange }: { event: IScriptsElement | undefined; onValueChange: (id: string, args: any) => void }) {
  const args: any = event?.args ?? {};
  const value = (field: 'x' | 'y') => typeof args[field] === 'object' ? args[field].value : args[field] ?? 0;
  const dispatchPreview = (nextArgs: any) => window.dispatchEvent(new CustomEvent('gba-studio:camera-preview', {
    detail: {
      eventId: event?.id,
      x: Number(typeof nextArgs.x === 'object' ? nextArgs.x.value : nextArgs.x) || 0,
      y: Number(typeof nextArgs.y === 'object' ? nextArgs.y.value : nextArgs.y) || 0,
    },
  }));
  const update = (field: 'x' | 'y', next: number | null) => {
    const nextArgs = { ...args, [field]: { type: 'number', value: Math.trunc(next ?? 0) } };
    onValueChange(event?.id!, nextArgs);
    dispatchPreview(nextArgs);
  };
  return <div
    onMouseEnter={() => dispatchPreview(args)}
    onMouseLeave={() => window.dispatchEvent(new CustomEvent('gba-studio:camera-preview', { detail: null }))}
    onPointerDown={event => event.stopPropagation()}
    onClick={event => event.stopPropagation()}
  >
    <Space.Compact block>
      <StepInputNumber addonBefore="X" value={value('x')} onChange={next => update('x', next)} style={{ width: '50%' }} />
      <StepInputNumber addonBefore="Y" value={value('y')} onChange={next => update('y', next)} style={{ width: '50%' }} />
    </Space.Compact>
  </div>;
}
