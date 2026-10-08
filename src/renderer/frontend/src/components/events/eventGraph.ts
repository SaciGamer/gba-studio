import { IScriptGraph, IScriptGraphEdge, IScriptsElement } from '@/providers/contexts/interfaces/ISceneElement';
import { v4 as uuidv4 } from 'uuid';
import { EEvents } from './interfaces/IEvents';

type EventMigrator = (event: IScriptsElement) => IScriptsElement;

/** Explicit schema migrators. Keep each version boundary deterministic. */
const EVENT_MIGRATORS: Record<number, EventMigrator> = {
  0: (event) => ({
    ...event,
    version: 1,
    children: event.children
      ? { then: event.children.then ?? [], else: event.children.else ?? [] }
      : undefined,
  }),
};

/** Normalize persisted event records before they enter the canonical graph. */
export function migrateScriptEvent(event: IScriptsElement): IScriptsElement {
  const version = event.version;
  if (version === undefined || version === 1) {
    if (event.command === EEvents.UI_ANIMATE && event.args && !event.args.uiId) {
      return { ...event, version: 1, args: { ...event.args, uiId: '__LAST_UI__', animation: 'move', speed: 2 } };
    }
    return { ...event, version: 1 };
  }
  const migrator = EVENT_MIGRATORS[version];
  if (!migrator) {
    throw new Error(`Unsupported event schema version ${version} for ${event.command}`);
  }
  const migrated = migrator(event);
  if (migrated.version !== 1) {
    throw new Error(`Event migration for ${event.command} did not produce schema version 1`);
  }
  return migrated;
}

export function migrateScriptsToGraph(scripts: IScriptsElement[]): IScriptGraph {
  const nodes: IScriptsElement[] = [];
  const edges: IScriptGraphEdge[] = [];
  const addEdge = (source: string, sourceHandle: IScriptGraphEdge['sourceHandle'], target?: string) => target && edges.push({ id: uuidv4(), source, sourceHandle, target, targetHandle: 'input' });
  const visit = (items: IScriptsElement[], continuation?: string, depth = 0): string | undefined => {
    if (!items.length) return continuation;
    items.forEach((event, index) => {
      const next = items[index + 1]?.id ?? continuation;
      const position = typeof event.args?.__x === 'number' && typeof event.args?.__y === 'number' ? { x: event.args.__x, y: event.args.__y } : event.position ?? { x: 80 + depth * 360, y: 90 + nodes.length * 145 };
      const migrated = migrateScriptEvent(event);
      nodes.push({ ...migrated, children: undefined, position });
      if (event.command === EEvents.IF) {
        addEdge(event.id, 'then', visit(event.children?.then ?? [], next, depth + 1));
        addEdge(event.id, 'else', visit(event.children?.else ?? [], next, depth + 1));
      } else addEdge(event.id, 'next', next);
    });
    return items[0].id;
  };
  visit(scripts);
  return { version: 1, entryNodeId: scripts[0]?.id ?? null, nodes, edges };
}

export function mergeNewScriptNodes(graph: IScriptGraph, scripts: IScriptsElement[]): IScriptGraph {
  const known = new Set(graph.nodes.map(node => node.id));
  const additions = migrateScriptsToGraph(scripts).nodes.filter(node => !known.has(node.id)).map((node, index) => ({ ...node, position: { x: 80, y: 100 + (graph.nodes.length + index) * 145 } }));
  return additions.length ? { ...graph, nodes: [...graph.nodes, ...additions] } : graph;
}

export function reachableNodeIds(graph: IScriptGraph): Set<string> {
  const reached = new Set<string>(), pending = graph.entryNodeId ? [graph.entryNodeId] : [];
  while (pending.length) { const current = pending.pop()!; if (reached.has(current)) continue; reached.add(current); graph.edges.filter(edge => edge.source === current).forEach(edge => pending.push(edge.target)); }
  return reached;
}

export function wouldCreateCycle(graph: IScriptGraph, source: string, target: string): boolean {
  if (source === target) return true;
  const pending = [target], visited = new Set<string>();
  while (pending.length) { const current = pending.pop()!; if (current === source) return true; if (visited.has(current)) continue; visited.add(current); graph.edges.filter(edge => edge.source === current).forEach(edge => pending.push(edge.target)); }
  return false;
}

export function validateScriptGraph(graph: IScriptGraph): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const node of graph.nodes) {
    if (ids.has(node.id)) errors.push(`duplicate node id: ${node.id}`);
    ids.add(node.id);
  }
  if (graph.entryNodeId !== null && !ids.has(graph.entryNodeId)) errors.push('entry node does not exist');
  for (const edge of graph.edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target)) errors.push(`orphan edge: ${edge.id}`);
    if (!['next', 'then', 'else'].includes(edge.sourceHandle) || edge.targetHandle !== 'input') errors.push(`invalid edge handles: ${edge.id}`);
  }
  for (const edge of graph.edges) {
    if (ids.has(edge.source) && ids.has(edge.target) && wouldCreateCycle({ ...graph, edges: graph.edges.filter(candidate => candidate.id !== edge.id) }, edge.source, edge.target)) {
      errors.push(`cycle edge: ${edge.id}`);
    }
  }
  return errors;
}

const outgoing = (graph: IScriptGraph, nodeId: string, handle?: IScriptGraphEdge['sourceHandle']) => graph.edges.find(edge => edge.source === nodeId && (!handle || edge.sourceHandle === handle))?.target;
const distances = (graph: IScriptGraph, start?: string) => {
  const result = new Map<string, number>(), pending: Array<[string, number]> = start ? [[start, 0]] : [];
  while (pending.length) { const [id, distance] = pending.shift()!; if (result.has(id)) continue; result.set(id, distance); graph.edges.filter(edge => edge.source === id).forEach(edge => pending.push([edge.target, distance + 1])); }
  return result;
};
const nearestJoin = (graph: IScriptGraph, left?: string, right?: string) => {
  if (!left || !right) return undefined;
  const a = distances(graph, left), b = distances(graph, right);
  return [...a.keys()].filter(id => b.has(id)).sort((x, y) => (a.get(x)! + b.get(x)!) - (a.get(y)! + b.get(y)!))[0];
};

export function graphToScripts(graph: IScriptGraph): IScriptsElement[] {
  const byId = new Map(graph.nodes.map(node => [node.id, node]));
  const build = (start?: string, stop?: string, ancestry = new Set<string>()): IScriptsElement[] => {
    const result: IScriptsElement[] = [], path = new Set(ancestry); let current = start;
    while (current && current !== stop && !path.has(current)) {
      path.add(current); const source = byId.get(current); if (!source) break;
      const event = { ...source, args: { ...source.args, __x: source.position?.x, __y: source.position?.y }, children: undefined };
      if (source.command === EEvents.IF) {
        const thenTarget = outgoing(graph, source.id, 'then'), elseTarget = outgoing(graph, source.id, 'else'), join = nearestJoin(graph, thenTarget, elseTarget);
        result.push({ ...event, children: { then: build(thenTarget, join, path), else: build(elseTarget, join, path) } }); current = join;
      } else { if (source.args?.__comment !== true) result.push(event); current = outgoing(graph, source.id, 'next'); }
    }
    return result;
  };
  return build(graph.entryNodeId ?? undefined);
}
