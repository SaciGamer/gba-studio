import { PHYSICS_SETTING_EVENTS } from '../../../../../shared/events/physicsEvents';
import { Form, Select, Switch, Typography } from 'antd';
import PhysicsValueControl from './PhysicsValueControl';
import { type PhysicsValueField } from '@/utils/physicsValueOptions';
import useAppContexts from '@/providers/contexts/AppContexts';
import useActorSelf from './useActorSelf';
import { useI18n } from '@/i18n/I18n';
import { IArgs, IScriptsElement } from '@/providers/contexts/interfaces/ISceneElement';
import { EEvents } from './interfaces/IEvents';
import { EVENT_DEFAULTS } from '../../../../../shared/events/eventCatalog';

export default function PhysicsEvent({ event, onValueChange }: {
  event: IScriptsElement;
  onValueChange: (eventId: string, eventArgs: IArgs) => void;
}) {
  const { t } = useI18n();
  const { elementSelected } = useAppContexts();
  const self = useActorSelf();
  const args: any = { ...(EVENT_DEFAULTS[event.command] as Record<string, unknown> | undefined), ...event.args };
  const setting = PHYSICS_SETTING_EVENTS[event.command];
  const update = (patch: Record<string, unknown>) => onValueChange(event.id, { ...args, ...patch });
  const numberField = (field: PhysicsValueField) => <Form.Item key={field} label={t(`events.physics.${field}`)}>
    <PhysicsValueControl key={`${event.id}:${field}`} field={field} value={args[field]} onChange={value => update({ [field]: value })} />
  </Form.Item>;
  const targetField = <Form.Item label={t('events.state.actor')}><Select aria-label={t('events.state.actor')} showSearch optionFilterProp="label" value={args.actorId}
    options={setting?.playerOnly ? [{ value: '__PLAYER__', label: t('values.player') }] : [...self.options, { value: '__PLAYER__', label: t('values.player') }, ...(elementSelected?.actors ?? []).map((actor: any) => ({ value: actor.id, label: actor.name || actor.id }))]}
    onChange={actorId => update({ actorId })} /></Form.Item>;

  if (setting) return <Form layout="vertical">
    {targetField}
    <Typography.Paragraph type="secondary">{t('events.physics.singleSettingHint')}</Typography.Paragraph>
    {setting.field === 'allowDiagonal'
      ? <Form.Item label={t('events.physics.allowDiagonal')}><Switch aria-label={t('events.physics.allowDiagonal')} checked={args.allowDiagonal !== false} onChange={allowDiagonal => update({ allowDiagonal })} /></Form.Item>
      : numberField(setting.field)}
    {setting.field === 'airJumps' && <Typography.Paragraph type="secondary">{t('events.physics.airJumpsHint')}</Typography.Paragraph>}
  </Form>;
  if (event.command === EEvents.PHYSICS_RESET) return <Form layout="vertical">{targetField}<Typography.Paragraph type="secondary">{t('events.physics.resetHint')}</Typography.Paragraph></Form>;

  if(event.command === EEvents.STOP_PHYSICS) return <Form layout="vertical">{targetField}<Typography.Paragraph type="secondary">{t('events.physics.stopHint')}</Typography.Paragraph></Form>;

  if(event.command === EEvents.APPLY_VERTICAL_IMPULSE) return <Form layout="vertical">
    {targetField}
    <Typography.Paragraph type="secondary">{t('events.physics.impulseHint')}</Typography.Paragraph>
    {numberField('impulse')}
    <Form.Item label={t('events.physics.mode')}><Select aria-label={t('events.physics.mode')} value={args.mode} onChange={mode => update({ mode })} options={['replace', 'add'].map(value => ({ value, label: t(`events.physics.${value}`) }))} /></Form.Item>
  </Form>;

  return <Form layout="vertical">
    {targetField}
    <Typography.Paragraph type="secondary">{t('events.physics.scopeHint')}</Typography.Paragraph>
    <Form.Item label={t('events.physics.reset')}><Switch aria-label={t('events.physics.reset')} checked={args.reset} onChange={reset => update({ reset })} /></Form.Item>
    {!args.reset && <>
      {args.actorId === '__PLAYER__' && <Form.Item label={t('events.physics.allowDiagonal')}><Switch aria-label={t('events.physics.allowDiagonal')} checked={args.allowDiagonal} onChange={allowDiagonal => update({ allowDiagonal })} /></Form.Item>}
      <Typography.Paragraph type="secondary">{t('events.physics.platformerHint')}</Typography.Paragraph>
      {numberField('gravity')}
      {args.actorId === '__PLAYER__' && numberField('jumpSpeed')}
      {numberField('maxFallSpeed')}
      {args.actorId === '__PLAYER__' && numberField('airJumps')}
      {args.actorId === '__PLAYER__' && <Typography.Paragraph type="secondary">{t('events.physics.airJumpsHint')}</Typography.Paragraph>}
    </>}
  </Form>;
}
