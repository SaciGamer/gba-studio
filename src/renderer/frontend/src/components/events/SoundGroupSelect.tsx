import { useMemo } from 'react';
import { Select } from 'antd';
import useAppContexts from '@/providers/contexts/AppContexts';
import { useI18n } from '@/i18n/I18n';
import { collectSoundGroups } from '../../../../../shared/events/soundGroups';

export default function SoundGroupSelect({ value, onChange }: { value?: string; onChange: (group: string) => void }) {
  const { scenes, scripts, prefabs, elementSelected } = useAppContexts();
  const { t } = useI18n();
  const groups = useMemo(() => collectSoundGroups(scenes, scripts?.scripts, prefabs?.prefabs, elementSelected), [scenes, scripts?.scripts, prefabs?.prefabs, elementSelected]);
  const options = [...groups];
  // Preserve an authored selection even if its Play Sound was removed or is not loaded.
  if (value && !options.includes(value)) options.push(value);
  return <Select aria-label={t('events.sound.group')} showSearch allowClear optionFilterProp="label" value={value || ''}
    options={[{ value: '', label: t('events.sound.allSounds') }, ...options.map(group => ({ value: group, label: group }))]}
    onChange={group => onChange(group ?? '')} />;
}
