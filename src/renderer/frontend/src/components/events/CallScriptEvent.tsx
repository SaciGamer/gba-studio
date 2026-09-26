import useAppContexts from '@/providers/contexts/AppContexts';
import { IArgs, IScriptsElement } from '@/providers/contexts/interfaces/ISceneElement';
import { Select } from 'antd';

export default function CallScriptEvent({ event, onValueChange }: { event: IScriptsElement; onValueChange: (id: string, args: IArgs) => void }) {
  const { scripts } = useAppContexts();
  return <Select placeholder="Select script" value={(event.args as any)?.scriptId || undefined} onChange={scriptId => onValueChange(event.id, { ...(event.args ?? {}), scriptId })} options={scripts.scripts.map(script => ({ value: script.id, label: script.name }))} style={{ width: '100%' }} />;
}
