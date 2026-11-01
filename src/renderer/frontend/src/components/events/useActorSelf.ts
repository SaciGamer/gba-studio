import useAppContexts from '@/providers/contexts/AppContexts';
import { useI18n } from '@/i18n/I18n';

export default function useActorSelf() {
  const { elementSelected, settingUtils } = useAppContexts();
  const { t } = useI18n();
  const owner = settingUtils.activeSceneObject;
  const sceneActor = owner?.type === 'actor' && owner.sceneId === elementSelected?.id
    ? elementSelected?.actors?.find((actor: any) => actor.id === owner.id) : undefined;
  const prefabActor = elementSelected?._resourceType === 'prefab' && elementSelected.type === 'actor'
    ? { ...(elementSelected.actor ?? {}), id: elementSelected.id, actorId: elementSelected.id, name: elementSelected.name } : undefined;
  const actor = sceneActor ?? prefabActor;
  const isPrefabSelf = !sceneActor && !!prefabActor;
  return {
    actor,
    options: actor ? [{ value: '__SELF__', label: t('events.actor.self', { name: actor.name || actor.actorId || actor.id }) }] : [],
    resolveId: (id: string | undefined) => id === '__SELF__' ? (isPrefabSelf ? prefabActor?.id : actor?.id) : id,
  };
}
