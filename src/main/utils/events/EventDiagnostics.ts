import { EVENT_CATALOG_BY_CODE } from '../../../shared/events/eventCatalog';

const eventName = (event: any) => {
  const customName = typeof event?.args?.__name === 'string' ? event.args.__name.trim() : '';
  const name = typeof event?.name === 'string' ? event.name.trim() : '';
  return String(customName || name || EVENT_CATALOG_BY_CODE[event?.command]?.label || event?.command || 'Event');
};
export class ScriptEventError extends Error {
  readonly eventId: string;
  readonly command: string;
  readonly displayName: string;
  readonly reason: string;
  constructor(event: any, cause: unknown) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    const name = eventName(event), command = String(event?.command ?? '<unknown>'), id = String(event?.id ?? '<unknown>');
    super(`${reason}\nEvent: ${JSON.stringify(name)} (${command}; ${id})`);
    this.reason = reason; this.displayName = name; this.command = command; this.eventId = id;
  }
}
export const withEventContext = (event: unknown, error: unknown): Error => error instanceof ScriptEventError ? error : new ScriptEventError(event, error);

type Diagnostic = { id: string; command: string; name: string; location: string; references: string[]; parameters: Map<string, string> };
/** Keep editor names separately from the emitted runtime resource/ABI. */
export class EventDiagnosticIndex {
  private readonly events = new Map<string, Diagnostic[]>();
  private readonly names = new Map<string, string>();
  remember(resource: any): void {
    if (!resource || resource._deleted) return;
    const rootType = resource._resourceType === 'scene' ? 'Scene' : resource._resourceType === 'scripts' ? 'Scripts' : String(resource._resourceType ?? 'Resource');
    const root = `${rootType}${resource.name ? ' ' + JSON.stringify(resource.name) : resource.id ? ' ' + resource.id : ''}`;
    const labels: Record<string, string> = { script: 'On Init', events: 'Events', onInitScript: 'On Init', onInteractScript: 'On Interact', onUpdateScript: 'On Update', onEnterScript: 'On Enter', onLeaveScript: 'On Leave', then: 'Then', else: 'Else', eventGraphs: 'Graph' };
    const walk = (value: any, location: string, key = '', parameters = new Map<string, string>()): void => {
      if (!value || typeof value !== 'object') return;
      if (Array.isArray(value)) { for (const child of value) walk(child, location, key, parameters); return; }
      if (['actors', 'triggers', 'scripts'].includes(key)) {
        const type = key === 'actors' ? 'Actor' : key === 'triggers' ? 'Trigger' : 'Script';
        location += ` / ${type} ${JSON.stringify(value.name || value.id || '?')}`;
      }
      if (Array.isArray(value.parameters)) parameters = new Map(value.parameters.map((parameter: any) => [parameter.id, parameter.alias ?? parameter.name]));
      if (typeof value.id === 'string' && typeof value.name === 'string' && value.name.trim() && !('command' in value) && key !== 'parameters') this.names.set(value.id, value.name);
      if ('command' in value && typeof value.id === 'string') {
        const references = ['actorId', 'actor_id', 'sceneId', 'scriptId', 'variableId'].map(field => value.args?.[field]).filter((id): id is string => typeof id === 'string' && !!id);
        const diagnostic = { id: value.id, command: String(value.command ?? '<unknown>'), name: eventName(value), location, references, parameters };
        const entries = this.events.get(value.id) ?? [];
        if (!entries.some(entry => entry.command === diagnostic.command && entry.location === location && entry.name === diagnostic.name)) entries.push(diagnostic);
        this.events.set(value.id, entries);
      }
      for (const [field, child] of Object.entries(value)) {
        if (child && typeof child === 'object') walk(child, labels[field] ? `${location} / ${labels[field]}` : location, field, parameters);
      }
    };
    walk(resource, root);
  }
  format(error: unknown): string {
    const message = String(error);
    const entries = error instanceof ScriptEventError
      ? (this.events.get(error.eventId) ?? []).filter(entry => entry.command === error.command)
      : [...this.events].filter(([id]) => id.length >= 8 && message.includes(id)).flatMap(([, entries]) => entries);
    const displayNames = (text: string): string => {
      const labels = new Map<string, string>();
      for (const [id, name] of this.names) {
        labels.set(name, name);
        labels.set(name.toLowerCase().replace(/ /g, '_').replaceAll('-', '_'), name);
        labels.set(id, name);
      }
      if (!labels.size) return text;
      const alternatives = [...labels.keys()].sort((a, b) => b.length - a.length)
        .map(value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
      // Replace once so names containing another resource ID remain intact.
      const pattern = new RegExp(`(?<![\\w.-])["']?(${alternatives})["']?(?![\\w.-])`, 'g');
      return text.replace(pattern, (_match, key: string) => JSON.stringify(labels.get(key)));
    };
    if (!entries.length) return displayNames(message);
    const reason = error instanceof ScriptEventError ? error.reason : message;
    return displayNames(reason) + entries.map(entry => {
      const names = [...new Set(entry.references.map(id => entry.parameters.get(id) ?? this.names.get(id)).filter(Boolean))];
      return `\nEvent: ${JSON.stringify(entry.name)} (${entry.command})\nLocation: ${entry.location}${names.length ? '\nReferences: ' + names.map(name => JSON.stringify(name)).join(', ') : ''}`;
    }).join('\n');
  }
}
