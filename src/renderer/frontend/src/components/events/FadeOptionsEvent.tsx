import { IScriptsElement } from '@/providers/contexts/interfaces/ISceneElement';
import { Select } from 'antd';
import { Content } from 'antd/es/layout/layout';
import { IFadeOptions } from './interfaces/IFade';

interface FadeOptionsEventProps {
  event: IScriptsElement | undefined;
  onValueChange: (eventId: string, eventArgs: IFadeOptions) => void;
}

export default function FadeOptionsEvent({ event, onValueChange }: FadeOptionsEventProps) {
  const args = event?.args as IFadeOptions;

  return (
    <Content>
      <Select
        value={args?.color ?? 'black'}
        style={{ width: '100%' }}
        options={[{ value: 'black', label: 'Black fade' }, { value: 'white', label: 'White fade' }]}
        onChange={color => onValueChange(event?.id!, { ...event?.args, color })}
      />
    </Content>
  );
}

FadeOptionsEvent.defaultValue = (): IFadeOptions => ({ color: 'black' });
