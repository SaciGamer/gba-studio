import { Flex } from 'antd';
import NumericEventInput from '../NumericEventInput';
import { IScriptsElement } from '@/providers/contexts/interfaces/ISceneElement';
import MotionSpeedControl from './MotionSpeedControl';

export default function CameraEvent({ event, onValueChange }: { event: IScriptsElement | undefined; onValueChange: (id: string, args: any) => void }) {
  const args: any = event?.args ?? {};
  const animated = args.animated ?? event?.command === 'EVENT_CAMERA_MOVE_TO';
  const value = (field: 'x' | 'y') => args[field] ?? 0;
  const dispatchPreview = (nextArgs: any) => window.dispatchEvent(new CustomEvent('gba-studio:camera-preview', {
    detail: {
      eventId: event?.id,
      x: Number(typeof nextArgs.x === 'object' ? nextArgs.x.value : nextArgs.x) || 0,
      y: Number(typeof nextArgs.y === 'object' ? nextArgs.y.value : nextArgs.y) || 0,
    },
  }));
  const update = (field: 'x' | 'y', next: any) => {
    const nextArgs = { ...args, [field]: next && typeof next === 'object' ? next : { type: 'number', value: Math.trunc(next ?? 0) } };
    onValueChange(event?.id!, nextArgs);
    dispatchPreview(nextArgs);
  };
  return <div
    onMouseEnter={() => dispatchPreview(args)}
    onMouseLeave={() => window.dispatchEvent(new CustomEvent('gba-studio:camera-preview', { detail: null }))}
    onPointerDown={event => event.stopPropagation()}
    onClick={event => event.stopPropagation()}
  >
    <Flex gap={8} style={{ width: '100%' }}>
      <NumericEventInput label="X" value={value('x')} onChange={next => update('x', next)} style={{ flex: 1, minWidth: 0 }} />
      <NumericEventInput label="Y" value={value('y')} onChange={next => update('y', next)} style={{ flex: 1, minWidth: 0 }} />
    </Flex>
    <MotionSpeedControl enabled={animated} speed={args.speed ?? 1} onChange={patch => onValueChange(event?.id!, { ...args, ...patch })} />
  </div>;
}
