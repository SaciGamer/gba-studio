import { IArgs, IScriptsElement } from '@/providers/contexts/interfaces/ISceneElement';
import useAppContexts from '@/providers/contexts/AppContexts';
import { Form, Select } from 'antd';
import StepInputNumber, { InputNumber } from '../StepInputNumber';
import NumericEventInput from '../NumericEventInput';
import React from 'react';

interface AnimationSpeedEventProps {
  event: IScriptsElement;
  onValueChange: (eventId: string, eventArgs: IArgs) => void;
}

const AnimationSpeedEvent: React.FC<AnimationSpeedEventProps> = ({ event, onValueChange }) => {
  const { elementSelected } = useAppContexts();
  const args: any = event.args ?? {};
  const actors = [{ value: '__PLAYER__', label: 'Player' }, ...(elementSelected?.actors ?? [])
    .filter(actor => Boolean(actor.id))
    .map(actor => ({ value: actor.id, label: actor.name ?? actor.actorId ?? actor.id }))];
  const update = (patch: Record<string, unknown>) => onValueChange(event.id, { ...args, ...patch });
  return <Form layout="vertical">
    <Form.Item label="Actor ID"><Select showSearch allowClear style={{ width: '100%' }} value={args.actorId || undefined} options={actors} onChange={actorId => update({ actorId })} placeholder="Select actor" /></Form.Item>
    <Form.Item label="Animation speed"><NumericEventInput min={0} max={60} value={args.speed ?? 4} onChange={value => update({ speed: value ?? 0 })} /></Form.Item>
  </Form>;
};

export default AnimationSpeedEvent;
