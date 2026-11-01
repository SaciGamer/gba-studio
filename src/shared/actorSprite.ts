/** A current actor ID identifies the entity, not its optional sprite asset. */
export function actorSpriteId(actor: { id?: unknown; actorId?: unknown; spriteId?: unknown }): string {
  if ('spriteId' in actor) return typeof actor.spriteId === 'string' ? actor.spriteId : '';
  // Older resources used actorId as the asset reference. Preserve only that
  // distinct reference; clearing spriteId must never restore a legacy asset.
  return typeof actor.actorId === 'string' && actor.actorId !== actor.id ? actor.actorId : '';
}
