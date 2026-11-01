import { Alert, Checkbox, Tooltip } from 'antd';
import { useI18n } from '@/i18n/I18n';

export default function ActorOffscreenControl({ value, onChange }: { value?: boolean; onChange: (value: boolean) => void }) {
  const { t } = useI18n();
  return <Alert type="info" style={{ marginBottom: 12 }}
    message={<Tooltip title={<span style={{ whiteSpace: 'pre-line' }}>{t('actors.keepRunningWhileOffscreenHelp')}</span>} trigger={['hover', 'focus']}>
      <Checkbox aria-label={t('actors.keepRunningWhileOffscreen')} checked={value === true} onChange={event => onChange(event.target.checked)}>{t('actors.keepRunningWhileOffscreen')}</Checkbox>
    </Tooltip>} />;
}
