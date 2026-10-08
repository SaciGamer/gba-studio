import { EVENT_CATALOG_BY_CODE, EVENT_DEFAULTS } from './eventCatalog';
import { NUMERIC_OPERATIONS } from '../numericValues';

const isBlank = (value: unknown): boolean => value == null || (typeof value === 'string' && !value.trim());

const isIncompleteValue = (value: unknown, depth = 0): boolean => {
  if (isBlank(value)) return true;
  if (Array.isArray(value)) return !value.length || value.some(item => isIncompleteValue(item, depth + 1));
  if (typeof value !== 'object') return false;
  if (depth > 16) return true;
  const node = value as Record<string, unknown>;
  switch (node.kind) {
    case 'variable': return isBlank(node.variableId);
    case 'property': return isBlank(node.actorId) || isBlank(node.property);
    case 'formula': return isBlank(node.source);
    case 'constant': return isBlank(node.constant);
    case 'engine': return isBlank(node.field);
    case 'direction': return isBlank(node.direction);
    case 'literal':
    case 'number': return isBlank(node.value);
    case 'expression': {
      const operation = NUMERIC_OPERATIONS[node.operation as keyof typeof NUMERIC_OPERATIONS];
      return !operation || isIncompleteValue(node.left, depth + 1) ||
        (operation.arity === 2 && isIncompleteValue(node.right, depth + 1));
    }
    default: return Object.keys(node).length === 0;
  }
};

/** Editor-only missing-input hints; defaults such as zero and false are valid. */
export function getEventPendingFields(command: string, args: Record<string, unknown> = {}): string[] {
  if (args.__comment === true) return [];
  const definition = EVENT_CATALOG_BY_CODE[command];
  if (!definition) return [];
  const values = { ...(EVENT_DEFAULTS[command] as Record<string, unknown> | undefined), ...args };
  return Object.entries(definition.payload).filter(([field, schema]) => {
    // Multi-selection replaces the legacy single-selection field.
    if (field === 'variableId' && ['EVENT_SAVE_WRITE', 'EVENT_SAVE_LOAD'].includes(command) &&
        Array.isArray(values.variableIds) && values.variableIds.length) return values.variableIds.some(isBlank);
    if (field === 'button' && Array.isArray(values.buttons) && values.buttons.length) return values.buttons.some(isBlank);
    if (!schema.required) return schema.numericValue && values[field] != null && isIncompleteValue(values[field]);
    return isIncompleteValue(values[field]);
  }).map(([field]) => field);
}
