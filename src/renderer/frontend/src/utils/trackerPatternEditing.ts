import type { MusicCompositionDocument } from './trackerComposition';
import { createTrackerUuid } from './trackerIdentity';

export const trackerPatternLimits = { MOD: [128, 128], XM: [256, 256], S3M: [255, 255], IT: [200, 254] } as const;

// Jump operands address order positions, not pattern numbers. Keep their
// destinations attached to the same order entries when the sequence changes.
function replaceOrder(project: MusicCompositionDocument, order: MusicCompositionDocument['order']): MusicCompositionDocument {
  const positions = new Map(order.map((entry, index) => [entry.id, index]));
  return { ...project, order: order.map((entry, index) => ({ ...entry, index })),
    patterns: project.patterns.map(pattern => ({ ...pattern, commands: pattern.commands.map(command => {
      if (!/^(MOD|XM):effect-b$|^(S3M|IT):effect-2$/.test(command.command)) return command;
      const destination = project.order[command.parameter];
      if (!destination) return command;
      const next = positions.get(destination.id);
      return { ...command, parameter: next ?? Math.min(command.parameter, order.length - 1) };
    }) })) };
}

export function appendMusicPattern(project: MusicCompositionDocument, sourceIndex?: number): MusicCompositionDocument {
  const [patterns, orders] = trackerPatternLimits[project.targetFormat];
  if (project.patterns.length >= patterns || project.order.length >= orders) return project;
  const source = project.patterns.find(pattern => pattern.index === sourceIndex);
  const pattern = { id: createTrackerUuid(), index: project.patterns.length,
    name: `Pattern ${project.patterns.length + 1}`, rows: source?.rows ?? 64,
    notes: source?.notes.map(note => ({ ...note, id: createTrackerUuid() })) ?? [],
    commands: source?.commands.map(command => ({ ...command, id: createTrackerUuid() })) ?? [] };
  return { ...project, patterns: [...project.patterns, pattern],
    order: [...project.order, { id: createTrackerUuid(), index: project.order.length, patternId: pattern.id }] };
}

export function deleteMusicPattern(project: MusicCompositionDocument, index: number): MusicCompositionDocument {
  const target = project.patterns.find(pattern => pattern.index === index);
  if (!target || project.patterns.length <= 1) return project;
  const patterns = project.patterns.filter(pattern => pattern !== target).map((pattern, index) => ({ ...pattern, index }));
  let order = project.order.filter(entry => entry.patternId !== target.id);
  if (!order.length) order = [{ id: createTrackerUuid(), index: 0, patternId: patterns[0].id }];
  return replaceOrder({ ...project, patterns }, order);
}

export function moveMusicOrder(project: MusicCompositionDocument, from: number, to: number): MusicCompositionDocument {
  if (from === to || !project.order[from] || !project.order[to]) return project;
  const order = [...project.order];
  order.splice(to, 0, order.splice(from, 1)[0]);
  return replaceOrder(project, order);
}

export function resizeMusicPattern(project: MusicCompositionDocument, index: number, rows: number): MusicCompositionDocument {
  if (!['XM', 'IT'].includes(project.targetFormat) || !Number.isInteger(rows) || rows < 1 || rows > 256) return project;
  return { ...project, patterns: project.patterns.map(pattern => pattern.index !== index ? pattern : {
    ...pattern, rows, notes: pattern.notes.filter(note => note.row < rows).map(note => ({ ...note, durationRows: Math.min(note.durationRows, rows - note.row) })),
    commands: pattern.commands.filter(command => command.row < rows),
  }) };
}
