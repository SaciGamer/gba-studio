import ActorMotionSpeedControl from './ActorMotionSpeedControl';

export default function MotionSpeedControl({ enabled, speed, onChange }: {
  enabled: boolean; speed: number; onChange: (patch: { animated?: boolean; speed?: number }) => void;
}) {
  return <ActorMotionSpeedControl enabled={enabled} speed={speed} animationSpeed={-1}
    showAnimationSpeed={false} maxSpeed={16}
    onChange={({ animated, speed: nextSpeed }) => onChange({
      ...(animated === undefined ? {} : { animated }),
      ...(nextSpeed === undefined ? {} : { speed: nextSpeed }),
    })} />;
}
