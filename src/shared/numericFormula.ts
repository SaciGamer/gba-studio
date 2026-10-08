import { NUMERIC_OPERATIONS, validateNumericValue, type NumericOperation, type NumericValue } from './numericValues';

const binary: Record<string, [NumericOperation, number]> = {
  '||': ['or', 1], '&&': ['and', 2], '|': ['bitOr', 3], '^': ['bitXor', 4], '&': ['bitAnd', 5],
  '==': ['equal', 6], '!=': ['notEqual', 6], '>': ['greater', 7], '>=': ['greaterEqual', 7], '<': ['less', 7], '<=': ['lessEqual', 7],
  '<<': ['shiftLeft', 8], '>>': ['shiftRight', 8], '+': ['add', 9], '-': ['subtract', 9], '*': ['multiply', 10], '/': ['divide', 10], '%': ['modulo', 10],
};
/** Parse a bounded expression, never JavaScript/eval. Variable names bind to IDs. */
export function parseNumericFormula(source: string, variables: Record<string, string> = {}): NumericValue {
  if (typeof source !== 'string' || source.length > 2048) throw new Error('Formula is too long');
  const tokens: string[] = [];
  let remaining = source;
  while (remaining.trim()) {
    remaining = remaining.trimStart();
    const token = remaining.match(/^(?:\$\[[^\]\r\n]+\]|\$(?:[A-Za-z_][A-Za-z0-9_]*|[0-9]+)|[0-9]+|[A-Za-z_][A-Za-z0-9_]*|<<|>>|<=|>=|==|!=|&&|\|\||[()+\-*/%,!~&|^<>])/);
    if (!token) throw new Error('Invalid formula token');
    tokens.push(token[0]);remaining = remaining.slice(token[0].length);
    if (tokens.length > 256) throw new Error('Formula is too complex');
  }
  let cursor = 0, nodes = 0, nesting = 0;
  const node = (value: NumericValue): NumericValue => { if (++nodes > 127) throw new Error('Formula is too complex');return value; };
  const expect = (token: string) => { if (tokens[cursor++] !== token) throw new Error(`Expected ${token}`); };
  const primary = (): NumericValue => {
    if (++nesting > 12) throw new Error('Formula nesting exceeds the limit');
    try {
      const token = tokens[cursor++];if (!token) throw new Error('Expected a value');
      if (token === '(') { const value = expression(0);expect(')');return value; }
      if (token === '+' || token === '-' || token === '!' || token === '~') {
        const operand = primary();
        if (token === '+') return operand;
        if (token === '-') {
          if (operand.kind === 'number') return node({kind:'number',value:-operand.value});
          return node({kind:'expression',operation:'subtract',left:node({kind:'number',value:0}),right:operand});
        }
        return node({kind:'expression',operation:token === '!' ? 'not' : 'bitNot',left:operand});
      }
      if (/^[0-9]+$/.test(token)) return node({kind:'number',value:Number(token)});
      if (token.startsWith('$')) {
        const name = token.startsWith('$[') ? token.slice(2,-1) : token.slice(1);
        const key = Object.keys(variables).find(key => key.toLowerCase() === name.toLowerCase());
        const variableId = key === undefined ? undefined : variables[key];
        if (!variableId) throw new Error(`Unknown variable: $${name}`);
        return node({kind:'variable',variableId});
      }
      if (token === 'true' || token === 'false') return node({kind:'number',value:token === 'true' ? 1 : 0});
      const operation = Object.keys(NUMERIC_OPERATIONS).find(key => key.toLowerCase() === token.toLowerCase()) as NumericOperation | undefined;
      if (!operation) throw new Error(`Unknown function: ${token}`);
      expect('(');const left = expression(0);
      let right: NumericValue | undefined;
      if (NUMERIC_OPERATIONS[operation].arity === 2) { expect(',');right = expression(0); }
      expect(')');return node({kind:'expression',operation,left,...(right ? {right} : {})});
    } finally { --nesting; }
  };
  const expression = (minimum: number): NumericValue => {
    let left = primary();
    while (binary[tokens[cursor]] && binary[tokens[cursor]][1] >= minimum) {
      const [operation, precedence] = binary[tokens[cursor++]];
      left = node({kind:'expression',operation,left,right:expression(precedence + 1)});
    }
    return left;
  };
  const result = expression(0);
  if (cursor !== tokens.length) throw new Error('Unexpected formula token');
  validateNumericValue(result, { formulaTree: true });
  const stackSize = (value: NumericValue): number => value.kind === 'expression'
    ? Math.max(stackSize(value.left), value.right ? 1 + stackSize(value.right) : 1) : 1;
  if (stackSize(result) > 16) throw new Error('Formula exceeds the runtime stack budget');
  return result;
}
