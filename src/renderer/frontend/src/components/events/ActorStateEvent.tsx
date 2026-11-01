import { Form, Select } from 'antd';
import useAppContexts from '@/providers/contexts/AppContexts';
import { useI18n } from '@/i18n/I18n';
import useActorSelf from './useActorSelf';
import type { IArgs, IScriptsElement } from '@/providers/contexts/interfaces/ISceneElement';

export default function ActorStateEvent({ event, onValueChange }: { event: IScriptsElement; onValueChange: (id: string, args: IArgs) => void }) {
  const { elementSelected, settings, spriteResources } = useAppContexts();
  const { t } = useI18n();
  const self = useActorSelf();
  const args = event.args as { actorId?: string; stateId?: string };
  const actors: any[] = elementSelected?.actors ?? [];
  const actor = actors.find(actor => actor.id === self.resolveId(args?.actorId)) ?? (args?.actorId === '__SELF__' ? self.actor : undefined);
  const spriteId = args?.actorId === '__PLAYER__' ? settings?.playerSpriteId : (actor as any)?.spriteId ?? actor?.actorId;
  const sprite = spriteResources.find(sprite => sprite.id === spriteId);
  const states = sprite?.playerAnimationStates ?? [];
  const update = (patch: Record<string, unknown>) => onValueChange(event.id, { ...event.args, ...patch });
  return <Form layout="vertical">
    <Form.Item label={t('events.state.actor')}><Select aria-label={t('events.state.actor')} showSearch optionFilterProp="label" allowClear value={args?.actorId || undefined} placeholder={t('events.state.selectActor')}
      options={[...self.options, { value: '__PLAYER__', label: t('values.player') }, ...actors.map(actor => ({ value: actor.id, label: actor.name || actor.id }))]} onChange={actorId => update({ actorId: actorId ?? '', stateId: '' })} /></Form.Item>
    <Form.Item label={t('events.state.main')}><Select aria-label={t('events.state.main')} showSearch optionFilterProp="label" allowClear value={args?.stateId || undefined} disabled={!args?.actorId} placeholder={t('events.state.selectState')}
      options={states.map(state => ({ value: state.id, label: state.name || state.id }))} onChange={stateId => update({ stateId: stateId ?? '' })} /></Form.Item>
  </Form>;
}
