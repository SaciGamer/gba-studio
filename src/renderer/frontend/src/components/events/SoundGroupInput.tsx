import { useEffect, useState } from 'react';
import { Input } from 'antd';
import { useI18n } from '@/i18n/I18n';

/** Keep keystrokes out of project state and group discovery until editing ends. */
export default function SoundGroupInput({ eventId, value = '', onCommit }: { eventId: string; value?: string; onCommit: (group: string) => void }) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft(value); }, [eventId, value]);
  return <Input aria-label={t('events.sound.group')} value={draft} placeholder={t('events.sound.optionalGroup')}
    onChange={event => setDraft(event.target.value)}
    onBlur={() => { if (draft !== value) onCommit(draft); }}
    onPressEnter={event => { if (!event.nativeEvent.isComposing) event.currentTarget.blur(); }} />;
}
