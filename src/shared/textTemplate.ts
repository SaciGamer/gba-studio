import { isActiveProjectEntry } from './projectCollectionEntries';

type TextVariable = { id: string; symbol?: string; type?: string; initialValue?: unknown; _deleted?: boolean };

/** Editor previews use the initial value; the runtime substitutes the live value. */
export function resolveTextTemplate(source: string, variables: readonly TextVariable[]): string {
  return source.replace(/\$\{([^}]*)\}/g, (_reference, key: string) => {
    const variable = variables.find(entry => isActiveProjectEntry(entry) && (entry.id === key || entry.symbol === key));
    return variable ? String(variable.initialValue ?? (variable.type === 'boolean' ? false : variable.type === 'number' ? 0 : '')) : '';
  });
}

export function textTemplateLiterals(source: string): string {
  return source.replace(/\$\{[^}]*\}/g, '');
}
