import { Flex, Form, InputNumber, Select, Switch, Tooltip, Typography } from 'antd';
import { useState } from 'react';
import useAppContexts from '@/providers/contexts/AppContexts';
import { useI18n } from '@/i18n/I18n';
import type { IArgs, IScriptsElement } from '@/providers/contexts/interfaces/ISceneElement';
import { ANIMATION_SPEED_OPTIONS } from '@/utils/movementSpeedOptions';
import useActorSelf from './useActorSelf';

export default function ActorAnimationEvent({ event, onValueChange }: { event: IScriptsElement; onValueChange: (id: string, args: IArgs) => void }) {
  const { elementSelected, settings, spriteResources } = useAppContexts();
  const { t } = useI18n();
  const self = useActorSelf();
  const [speedOpen, setSpeedOpen] = useState(false);
  const args = event.args as { actorId?: string; action?: string; stateId?: string; animationId?: string; speed?: number; frame?: number; reverse?: boolean };
  const actors: any[] = elementSelected?.actors ?? [];
  const actor = actors.find(item => item.id === self.resolveId(args.actorId)) ?? (args.actorId === '__SELF__' ? self.actor : undefined);
  const spriteId = args.actorId === '__PLAYER__' ? settings?.playerSpriteId : actor?.spriteId ?? actor?.actorId;
  const sprite = spriteResources.find(item => item.id === spriteId);
  const states = sprite?.playerAnimationStates ?? [];
  const state = states.find(item => item.id === args.stateId);
  const animations = state?.animations ?? [];
  const animation = animations.find(item => item.id === args.animationId);
  const action = args.action ?? 'speed';
  const speedLabel = (value: number) => value === 0 ? t('events.motion.none')
    : t(value === 1 ? 'events.motion.speedSlower' : value === 8 ? 'events.motion.speedFaster' : 'events.motion.speedLevel', { speed: value });
  const update = (patch: Record<string, unknown>) => onValueChange(event.id, { ...event.args, ...patch });
  return <Form layout="vertical">
    <Form.Item label={t('events.actorAnimation.actor')}><Select aria-label={t('events.actorAnimation.actor')} showSearch optionFilterProp="label" allowClear value={args.actorId || undefined}
      options={[...self.options, { value: '__PLAYER__', label: t('values.player') }, ...actors.filter(item => item.id).map(item => ({ value: item.id, label: item.name || item.id }))]}
      placeholder={t('events.actorAnimation.selectActor')} onChange={actorId => {
        const selectedActor = actors.find(item => item.id === self.resolveId(actorId)) ?? (actorId === '__SELF__' ? self.actor : undefined);
        const selectedSpriteId = actorId === '__PLAYER__' ? settings?.playerSpriteId : selectedActor?.spriteId ?? selectedActor?.actorId;
        const firstState = spriteResources.find(item => item.id === selectedSpriteId)?.playerAnimationStates?.[0];
        update({ actorId: actorId ?? '', stateId: firstState?.id ?? '', animationId: firstState?.animations?.[0]?.id ?? '', frame: 0 });
      }} /></Form.Item>
    <Form.Item label={t('events.actorAnimation.action')}><Select aria-label={t('events.actorAnimation.action')} value={action} onChange={nextAction => update({ action: nextAction })} options={[
      { value: 'speed', label: t('events.actorAnimation.speed') }, { value: 'loop', label: t('events.actorAnimation.loop') },
      { value: 'once', label: t('events.actorAnimation.once') }, { value: 'stop', label: t('events.actorAnimation.stop') },
      { value: 'frame', label: t('events.actorAnimation.frame') },
    ]} /></Form.Item>
    {action !== 'stop' && action !== 'speed' && <>
      <Form.Item label={t('events.actorAnimation.state')}><Select status={!args.stateId ? 'error' : undefined} aria-label={t('events.actorAnimation.state')} showSearch optionFilterProp="label" value={args.stateId || undefined} disabled={!args.actorId}
        options={states.map(item => ({ value: item.id, label: item.name || item.id }))} placeholder={t('events.actorAnimation.selectState')} onChange={stateId => update({ stateId: stateId ?? '', animationId: states.find(item => item.id === stateId)?.animations?.[0]?.id ?? '', frame: 0 })} /></Form.Item>
      <Form.Item label={t('events.actorAnimation.animation')}><Select status={!args.animationId ? 'error' : undefined} aria-label={t('events.actorAnimation.animation')} showSearch optionFilterProp="label" value={args.animationId || undefined} disabled={!args.stateId}
        options={animations.map(item => ({ value: item.id, label: item.name || item.id }))} placeholder={t('events.actorAnimation.selectAnimation')} onChange={animationId => update({ animationId: animationId ?? '', frame: 0 })} /></Form.Item>
    </>}
    {(action === 'loop' || action === 'once' || action === 'speed') && <Form.Item label={t('settings.animationSpeed')}><Select aria-label={t('settings.animationSpeed')} value={args.speed ?? 6} showSearch optionFilterProp="label" onOpenChange={setSpeedOpen}
      onChange={speed => update({ speed })} options={ANIMATION_SPEED_OPTIONS.map(option => ({ value: option.value, label: `${speedLabel(option.value)} ${option.fps}`, display: speedLabel(option.value), rate: option.fps }))}
      labelRender={({ value }) => speedLabel(Number(value))} optionRender={option => <Flex justify="space-between" gap={8}><span>{option.data.display}</span>{speedOpen && <Typography.Text type="secondary">{option.data.rate}</Typography.Text>}</Flex>} /></Form.Item>}
    {(action === 'loop' || action === 'once') && <Form.Item><Tooltip title={t('events.actorAnimation.reverse')}><Switch aria-label={t('events.actorAnimation.reverse')} checked={args.reverse === true} onChange={reverse => update({ reverse })} /></Tooltip></Form.Item>}
    {action === 'frame' && <Form.Item label={t('events.actorAnimation.frame')}><InputNumber aria-label={t('events.actorAnimation.frame')} min={0} max={Math.max(0, ((animation?.frames?.length || animation?.canvasFrames?.length) ?? 1) - 1)} precision={0} value={args.frame ?? 0} disabled={!animation} onChange={frame => update({ frame: frame ?? 0 })} style={{ width: '100%' }} /></Form.Item>}
  </Form>;
}
