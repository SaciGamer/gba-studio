import { Button, Flex, Typography } from 'antd';
import { useI18n } from '@/i18n/I18n';
import NumericEventInput from '../NumericEventInput';
import { coordinateScale } from '../../../../../shared/events/coordinateUnits';

export default function CoordinateInputs({ args, onChange, fields = ['x', 'y'], min, max, defaults = [0, 0], enabled }: {
  args: Record<string, any>; onChange: (patch: Record<string, any>) => void;
  fields?: [string, string]; min?: [number, number]; max?: [number, number]; defaults?: [number, number]; enabled?: [boolean, boolean];
}) {
  const { t } = useI18n();
  return <Flex gap={8} style={{ width: '100%' }}>
    {fields.map((field, index) => <Flex key={field} vertical gap={4} style={{ flex: 1, minWidth: 0 }}>
      <Flex align="center" gap={4}>
        <Typography.Text style={{ fontSize: 12 }}>{index === 0 ? 'X' : 'Y'}</Typography.Text>
        <Button type="text" size="small" disabled={enabled?.[index] === false} aria-label={t('events.actor.coordinateUnit', { axis: index === 0 ? 'X' : 'Y' })}
          title={t('events.actor.tileUnitHint')} style={{ height: 20, paddingInline: 4, fontSize: 11 }}
          onClick={() => onChange({ [field + 'Unit']: args[field + 'Unit'] === 'tiles' ? 'pixels' : 'tiles' })}>
          {args[field + 'Unit'] === 'tiles' ? t('events.actor.tiles') : 'px'}
        </Button>
      </Flex>
      <NumericEventInput value={args[field] ?? defaults[index]} disabled={enabled?.[index] === false}
        min={min ? Math.ceil(min[index] / coordinateScale(args, field)) : undefined}
        max={max ? Math.floor(max[index] / coordinateScale(args, field)) : undefined}
        onChange={value => onChange({ [field]: value })} />
    </Flex>)}
  </Flex>;
}
