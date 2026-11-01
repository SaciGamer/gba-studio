import CoordinateInputs from './CoordinateInputs';
import { IScriptsElement } from '@/providers/contexts/interfaces/ISceneElement';
import MotionSpeedControl from './MotionSpeedControl';

export default function CameraEvent({ event, onValueChange }: { event: IScriptsElement | undefined; onValueChange: (id: string, args: any) => void }) {
  const args: any = event?.args ?? {};
  const animated = args.animated ?? event?.command === 'EVENT_CAMERA_MOVE_TO';
  const dispatchPreview = (nextArgs: any) => window.dispatchEvent(new CustomEvent('gba-studio:camera-preview', {
    detail: {
      eventId: event?.id,
      x: (Number(typeof nextArgs.x === 'object' ? nextArgs.x?.value : nextArgs.x) || 0) * (nextArgs.xUnit === 'tiles' ? 16 : 1),
      y: (Number(typeof nextArgs.y === 'object' ? nextArgs.y?.value : nextArgs.y) || 0) * (nextArgs.yUnit === 'tiles' ? 16 : 1),
    },
  }));
  return <div
    onMouseEnter={() => dispatchPreview(args)}
    onMouseLeave={() => window.dispatchEvent(new CustomEvent('gba-studio:camera-preview', { detail: null }))}
    onPointerDown={event => event.stopPropagation()}
    onClick={event => event.stopPropagation()}
  >
    <CoordinateInputs args={args} onChange={patch => {
      const nextArgs = { ...args, ...patch };
      onValueChange(event?.id!, nextArgs);
      dispatchPreview(nextArgs);
    }} />
    <MotionSpeedControl enabled={animated} speed={args.speed ?? 1} onChange={patch => onValueChange(event?.id!, { ...args, ...patch })} />
  </div>;
}
