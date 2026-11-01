import { Checkbox, Typography, theme } from 'antd';
import { useI18n } from '@/i18n/I18n';
import { InputGroups, resolveInputGroups, INPUT_GROUP_PHYSICAL_BUTTONS } from '../../../../../../shared/inputGroups';

export default function InputGroupsTable({ value, onChange }: { value?: InputGroups; onChange?: (value: InputGroups) => void }) {
  const { t } = useI18n();
  const { token } = theme.useToken();
  const buttonsByGroup = resolveInputGroups(value);
  const groups = Object.keys(buttonsByGroup);
  const cell = { padding: '8px 12px', borderBottom: `1px solid ${token.colorBorderSecondary}` };
  return <section>
    <Typography.Title level={5} style={{ marginTop: 0 }}>{t('controls.groups.title')}</Typography.Title>
    <Typography.Paragraph type="secondary">{t('controls.groups.description')}</Typography.Paragraph>
    <div style={{ maxWidth: '100%', overflowX: 'auto' }}>
      <table aria-label={t('controls.groups.title')} style={{ width: '100%', minWidth: 440, borderCollapse: 'collapse', color: token.colorText }}>
        <thead style={{ background: token.colorFillAlter }}><tr>
          <th scope="col" style={{ ...cell, textAlign: 'left' }}>{t('controls.groups.button')}</th>
          {groups.map(group => <th key={group} scope="col" style={cell}>{t(`controls.groups.${group}`)}</th>)}
        </tr></thead>
        <tbody>{INPUT_GROUP_PHYSICAL_BUTTONS.map(button => <tr key={button}>
          <th scope="row" style={{ ...cell, textAlign: 'left', fontWeight: 400 }}>{button}</th>
          {groups.map(group => <td key={group} style={{ ...cell, textAlign: 'center' }}>
            <Checkbox checked={buttonsByGroup[group].includes(button)} disabled={group === 'all' || !onChange}
              onChange={event => onChange?.({ ...value, [group]: event.target.checked
                ? [...buttonsByGroup[group], button] : buttonsByGroup[group].filter(entry => entry !== button) })}
              aria-label={`${button} · ${t(`controls.groups.${group}`)}`} />
          </td>)}
        </tr>)}</tbody>
      </table>
    </div>
  </section>;
}
