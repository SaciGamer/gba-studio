import { parseNumericFormula } from './numericFormula';
export const NUMERIC_OPERATIONS = {
  add: { group: 'math', symbol: '+', arity: 2 }, subtract: { group: 'math', symbol: '-', arity: 2 },
  multiply: { group: 'math', symbol: '*', arity: 2 }, divide: { group: 'math', symbol: '/', arity: 2 },
  modulo: { group: 'math', symbol: '%', arity: 2 }, min: { group: 'math', symbol: 'min', arity: 2 },
  max: { group: 'math', symbol: 'max', arity: 2 }, abs: { group: 'math', symbol: 'abs', arity: 1 },
  atan2: { group: 'math', symbol: 'atan2', arity: 2 }, sqrt: { group: 'math', symbol: 'sqrt', arity: 1 },
  random: { group: 'math', symbol: 'random', arity: 2 },
  and: { group: 'boolean', symbol: '&&', arity: 2 }, or: { group: 'boolean', symbol: '||', arity: 2 },
  not: { group: 'boolean', symbol: '!', arity: 1 },
  equal: { group: 'comparison', symbol: '==', arity: 2 }, notEqual: { group: 'comparison', symbol: '!=', arity: 2 },
  greater: { group: 'comparison', symbol: '>', arity: 2 }, greaterEqual: { group: 'comparison', symbol: '>=', arity: 2 },
  less: { group: 'comparison', symbol: '<', arity: 2 }, lessEqual: { group: 'comparison', symbol: '<=', arity: 2 },
  shiftLeft: { group: 'bitwise', symbol: '<<', arity: 2 }, shiftRight: { group: 'bitwise', symbol: '>>', arity: 2 },
  bitAnd: { group: 'bitwise', symbol: '&', arity: 2 }, bitOr: { group: 'bitwise', symbol: '|', arity: 2 },
  bitXor: { group: 'bitwise', symbol: '^', arity: 2 }, bitNot: { group: 'bitwise', symbol: '~', arity: 1 },
} as const;
export type NumericOperation = keyof typeof NUMERIC_OPERATIONS;
export const NUMERIC_CONSTANTS = { screenWidth: 240, screenHeight: 160, tileSize: 8, sceneTileSize: 16, true: 1, false: 0 } as const;
export const NUMERIC_PROPERTIES = ['x', 'y', 'direction', 'frame', 'animationSpeed', 'xTiles', 'yTiles', 'xPixels', 'yPixels'] as const;
export const NUMERIC_TRIGGER_PROPERTIES = ['x', 'y', 'width', 'height', 'enabled'] as const;
export const NUMERIC_ENGINE_FIELDS = ['cameraX', 'cameraY', 'sceneWidth', 'sceneHeight', 'moveSpeed', 'animationSpeed', 'frameCount'] as const;
export const NUMERIC_DIRECTIONS = { up: 0, right: 1, down: 2, left: 3 } as const;
export const NUMERIC_MAX_DEPTH = 8;
export const NUMERIC_MAX_NODES = 127;

export type NumericValue =
  | { kind: 'formula'; source: string; variables?: Record<string, string> }
  | { kind: 'number'; value: number }
  | { kind: 'variable'; variableId: string }
  | { kind: 'constant'; constant: keyof typeof NUMERIC_CONSTANTS }
  | { kind: 'property'; actorId: string; property: typeof NUMERIC_PROPERTIES[number] }
  | { kind: 'trigger'; triggerId: string; property: typeof NUMERIC_TRIGGER_PROPERTIES[number] }
  | { kind: 'engine'; field: typeof NUMERIC_ENGINE_FIELDS[number] }
  | { kind: 'direction'; direction: keyof typeof NUMERIC_DIRECTIONS }
  | { kind: 'expression'; operation: NumericOperation; left: NumericValue; right?: NumericValue };

export function normalizeNumericValue(value: unknown): NumericValue {
  if (value && typeof value === 'object') {
    const object = value as any;
    if (['number', 'variable', 'constant', 'property', 'trigger', 'engine', 'direction', 'expression', 'formula'].includes(object.kind)) return object;
    if (object.kind === 'literal' || object.type === 'number') return { kind: 'number', value: Number(object.value) || 0 };
  }
  return { kind: 'number', value: Number(value) || 0 };
}

export function formatNumericValue(value: unknown, nameForId: (id: string) => string = id =>
  id === '__SELF__' ? 'Self' : typeof id === 'string' && id.length > 0 ? id.slice(0, 8) : '?'
): string {
  const format = (raw: unknown, depth: number): string => {
    if (depth > NUMERIC_MAX_DEPTH) return '…';
    const node = normalizeNumericValue(raw);
    switch (node.kind) {
      case 'formula': return node.source;
      case 'number': return String(node.value);
      case 'variable': return '$' + nameForId(node.variableId);
      case 'constant': return node.constant;
      case 'direction': return node.direction;
      case 'engine': return node.field;
      case 'property': return `${node.actorId === '__SELF__' ? 'self' : nameForId(node.actorId)}.${node.property}`;
      case 'trigger': return `${nameForId(node.triggerId)}.${node.property}`;
      case 'expression': {
        const symbol = NUMERIC_OPERATIONS[node.operation]?.symbol ?? '?';
        const left = format(node.left, depth + 1);
        return node.right ? `(${left} ${symbol} ${format(node.right, depth + 1)})` : `${symbol}(${left})`;
      }
    }
  };
  return format(value, 0);
}

export function validateNumericValue(value: unknown, options: { allowIncompleteFormula?: boolean; formulaTree?: boolean } = {}): asserts value is NumericValue {
  let nodes = 0;
  const walk = (node: any, depth: number) => {
    if (++nodes > NUMERIC_MAX_NODES || depth > (options.formulaTree ? 126 : NUMERIC_MAX_DEPTH)) throw new Error('Numeric expression exceeds its depth/node budget');
    if (!node || typeof node !== 'object') throw new Error('Invalid numeric value');
    switch (node.kind) {
      case 'formula': {
        if (typeof node.source !== 'string' || node.source.length > 2048) throw new Error('Invalid formula');
        if (!options.allowIncompleteFormula) parseNumericFormula(node.source, node.variables ?? {});
        break;
      }
      case 'number': if (!Number.isFinite(node.value) || !Number.isInteger(node.value) || node.value < -2147483648 || node.value > 2147483647) throw new Error('Numeric literals must be signed 32-bit integers'); break;
      case 'variable': if (typeof node.variableId !== 'string' || !node.variableId) throw new Error('Select a numeric variable'); break;
      case 'constant': if (!Object.prototype.hasOwnProperty.call(NUMERIC_CONSTANTS, node.constant)) throw new Error('Unknown numeric constant'); break;
      case 'property': if (typeof node.actorId !== 'string' || !node.actorId || !NUMERIC_PROPERTIES.includes(node.property)) throw new Error('Invalid actor property'); break;
      case 'trigger': if (typeof node.triggerId !== 'string' || !node.triggerId || !NUMERIC_TRIGGER_PROPERTIES.includes(node.property)) throw new Error('Invalid trigger property'); break;
      case 'engine': if (!NUMERIC_ENGINE_FIELDS.includes(node.field)) throw new Error('Unknown engine field'); break;
      case 'direction': if (!Object.prototype.hasOwnProperty.call(NUMERIC_DIRECTIONS, node.direction)) throw new Error('Unknown direction'); break;
      case 'expression': {
        const definition = NUMERIC_OPERATIONS[node.operation as NumericOperation];
        if (!Object.prototype.hasOwnProperty.call(NUMERIC_OPERATIONS, node.operation)) throw new Error('Unknown numeric operation');
        walk(node.left, depth + 1);
        if (definition.arity === 2) walk(node.right, depth + 1);
        else if (node.right !== undefined) throw new Error('Unary numeric operations accept one input');
        break;
      }
      default: throw new Error('Unknown numeric value type');
    }
  };
  walk(value, 0);
}

export type NumericInstruction = { operation: 'number' | 'variable' | 'property' | 'engine' | NumericOperation; value?: number; reference?: string; argument?: number };
/** Convert coordinate offsets to pixels without scaling world-position properties. */
export function numericCoordinateInstructions(value: NumericValue, scale: number): NumericInstruction[] {
  validateNumericValue(value);
  const scaled = (instructions: NumericInstruction[]) => scale === 1 ? instructions : [...instructions,
    { operation: 'number' as const, value: scale }, { operation: 'multiply' as const }];
  const walk = (node: NumericValue): { instructions: NumericInstruction[]; pixels: boolean } => {
    if (node.kind !== 'expression') {
      const instructions = numericInstructions(node);
      const position = node.kind === 'property' && ['x', 'y', 'xPixels', 'yPixels', 'xTiles', 'yTiles'].includes(node.property);
      // Explicit property units belong to the property, independently of the
      // destination field's units. Convert tile properties to pixels here.
      const tilePosition = node.kind === 'property' && ['xTiles', 'yTiles'].includes(node.property);
      return { instructions: tilePosition ? [...instructions, { operation: 'number', value: 16 }, { operation: 'multiply' }] as NumericInstruction[] : instructions,
        pixels: position || node.kind === 'trigger' && (node.property === 'x' || node.property === 'y') };
    }
    const left = walk(node.left);
    const right = node.right ? walk(node.right) : null;
    let a = left.instructions, b = right?.instructions ?? [];
    const coordinateResult = ['add', 'subtract', 'min', 'max'].includes(node.operation);
    const pixels = coordinateResult ? left.pixels || Boolean(right?.pixels)
      : node.operation === 'abs' ? left.pixels
      : node.operation === 'multiply' ? left.pixels !== Boolean(right?.pixels)
      : node.operation === 'divide' ? left.pixels && !right?.pixels : false;
    if (coordinateResult && pixels) {
      if (!left.pixels) a = scaled(a);
      if (right && !right.pixels) b = scaled(b);
    }
    return { instructions: [...a, ...b, { operation: node.operation }], pixels };
  };
  const result = walk(value);
  const instructions = result.pixels ? result.instructions : scaled(result.instructions);
  if (instructions.length > NUMERIC_MAX_NODES) throw new Error('Actor tile coordinate exceeds the numeric instruction limit');
  return instructions;
}
export function numericInstructions(value: NumericValue): NumericInstruction[] {
  validateNumericValue(value);
  const result: NumericInstruction[] = [];
  const walk = (node: NumericValue) => {
    switch (node.kind) {
      case 'formula': walk(parseNumericFormula(node.source, node.variables ?? {})); break;
      case 'number': result.push({ operation: 'number', value: node.value }); break;
      case 'variable': result.push({ operation: 'variable', reference: node.variableId }); break;
      case 'constant': result.push({ operation: 'number', value: NUMERIC_CONSTANTS[node.constant] }); break;
      case 'direction': result.push({ operation: 'number', value: NUMERIC_DIRECTIONS[node.direction] }); break;
      case 'property': result.push({ operation: 'property', reference: node.actorId, argument: NUMERIC_PROPERTIES.indexOf(node.property) }); break;
      case 'trigger': result.push({ operation: 'property', reference: '__TRIGGER__:' + node.triggerId, argument: NUMERIC_TRIGGER_PROPERTIES.indexOf(node.property) }); break;
      case 'engine': result.push({ operation: 'engine', argument: NUMERIC_ENGINE_FIELDS.indexOf(node.field) }); break;
      case 'expression': walk(node.left); if (node.right) walk(node.right); result.push({ operation: node.operation }); break;
    }
  };
  walk(value);
  return result;
}
