import useAppContexts from '@/providers/contexts/AppContexts';
import { IArgs, IScriptsElement } from '@/providers/contexts/interfaces/ISceneElement';
import { Select, Space, Typography } from 'antd';
import { useI18n } from '@/i18n/I18n';

export default function CallScriptEvent({ event, onValueChange }: { event: IScriptsElement; onValueChange: (id: string, args: IArgs) => void }) {
  const { scripts } = useAppContexts();
  const { t } = useI18n();
  const scriptId = (event.args as any)?.scriptId;
  const selectedScript = scripts.scripts.find(script => script.id === scriptId);
  return <Space direction="vertical" size={8} style={{ width: '100%' }}>
    <Select aria-label={t('scripts.selectScript')} placeholder={t('scripts.selectScript')} value={scriptId || undefined} onChange={scriptId => onValueChange(event.id, { ...(event.args ?? {}), scriptId })} options={scripts.scripts.map(script => ({ value: script.id, label: script.name }))} style={{ width: '100%' }} />
    {selectedScript?.description?.trim() && <Typography.Paragraph type="secondary" style={{ margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{selectedScript.description}</Typography.Paragraph>}
  </Space>;
}
