export type ScriptGraphNode = { id: string; command: string; args?: Record<string, unknown>; children?: { then?: ScriptGraphNode[]; else?: ScriptGraphNode[] } };
export type ScriptGraph = { version: 1; entryNodeId: string | null; nodes: ScriptGraphNode[]; edges: Array<{ id: string; source: string; sourceHandle: 'next' | 'then' | 'else'; target: string }> };

export type CompiledScriptGraph = { nodes: ScriptGraphNode[]; sourceMap: ReadonlyMap<string, number> };

export function compileScriptGraph(graph: ScriptGraph): ScriptGraphNode[] {
  if (graph.version !== 1) throw new Error(`Unsupported script graph version ${graph.version}`);
  const byId = new Map(graph.nodes.map(node => [node.id, node]));
  if (graph.entryNodeId !== null && !byId.has(graph.entryNodeId)) throw new Error('Script graph entry node does not exist');
  const outgoing = new Map<string, Array<{ sourceHandle: string; target: string }>>();
  for (const edge of graph.edges) {
    if (!byId.has(edge.source) || !byId.has(edge.target)) throw new Error(`Script graph edge ${edge.id} references a missing node`);
    const list = outgoing.get(edge.source) ?? [];
    if (list.some(item => item.sourceHandle === edge.sourceHandle)) throw new Error(`Duplicate script graph handle on ${edge.source}`);
    list.push(edge); outgoing.set(edge.source, list);
  }
  const result: ScriptGraphNode[] = [], visiting = new Set<string>(), visited = new Set<string>();
  const visit = (id: string | null): void => {
    if (!id || visited.has(id)) return;
    if (visiting.has(id)) throw new Error(`Script graph cycle at ${id}`);
    const node = byId.get(id); if (!node) return;
    visiting.add(id); result.push(node);
    for (const edge of outgoing.get(id) ?? []) visit(edge.target);
    visiting.delete(id); visited.add(id);
  };
  visit(graph.entryNodeId);
  return result;
}

export function compileScriptGraphWithSourceMap(graph: ScriptGraph): CompiledScriptGraph {
  const nodes = compileScriptGraph(graph);
  return { nodes, sourceMap: new Map(nodes.map((node, index) => [node.id, index])) };
}
