import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const appRoot = path.resolve(import.meta.dirname, '../..');
const siteRoot = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(appRoot, '..', 'gba-studio-site');
const catalogPath = path.join(appRoot, 'src', 'shared', 'events', 'eventCatalog.ts');
const docsPaths = [
  { locale: 'en', file: path.join(siteRoot, 'docs', 'reference', 'events.md') },
  { locale: 'pt', file: path.join(siteRoot, 'i18n', 'pt', 'docusaurus-plugin-content-docs', 'current', 'reference', 'events.md') },
  { locale: 'es', file: path.join(siteRoot, 'i18n', 'es', 'docusaurus-plugin-content-docs', 'current', 'reference', 'events.md') },
];
const source = ts.createSourceFile(catalogPath, fs.readFileSync(catalogPath, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
let catalog;
let defaultsNode;
const unwrap = node => ts.isSatisfiesExpression(node) || ts.isAsExpression(node) || ts.isTypeAssertionExpression(node) ? unwrap(node.expression) : node;
const literal = node => {
  if (!node) return undefined;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.MinusToken) return -Number(literal(node.operand));
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (node.kind === ts.SyntaxKind.NullKeyword) return null;
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'fill') {
    const array = node.expression.expression;
    if (ts.isCallExpression(array) && ts.isIdentifier(array.expression) && array.expression.text === 'Array') {
      const length = literal(array.arguments[0]);
      if (Number.isInteger(length) && length >= 0 && length <= 1024) return Array(length).fill(literal(node.arguments[0]));
    }
  }
  if (ts.isArrayLiteralExpression(node)) return node.elements.map(literal);
  if (ts.isObjectLiteralExpression(node)) return Object.fromEntries(node.properties.filter(ts.isPropertyAssignment).map(p => [p.name.getText(source).replace(/^['"]|['"]$/g, ''), literal(p.initializer)]));
  return undefined;
};
for (const statement of source.statements) {
  if (!ts.isVariableStatement(statement)) continue;
  for (const declaration of statement.declarationList.declarations) {
    if (ts.isIdentifier(declaration.name) && declaration.name.text === 'EVENT_DEFAULTS' && declaration.initializer) defaultsNode = unwrap(declaration.initializer);
  }
}

for (const statement of source.statements) {
  if (!ts.isVariableStatement(statement)) continue;
  for (const declaration of statement.declarationList.declarations) {
    if (ts.isIdentifier(declaration.name) && declaration.name.text === 'EVENT_CATALOG' && declaration.initializer) {
      const initializer = unwrap(declaration.initializer);
      if (!ts.isArrayLiteralExpression(initializer)) continue;
      catalog = initializer.elements.map((entry) => {
        const values = new Map();
        if (!ts.isObjectLiteralExpression(entry)) throw new Error('Unexpected event catalog entry shape.');
        for (const property of entry.properties) {
          if (!ts.isPropertyAssignment(property)) continue;
          const key = property.name.getText(source).replace(/^['"]|['"]$/g, '');
          values.set(key, property.initializer);
        }
        const payload = values.get('payload');
        const fields = ts.isObjectLiteralExpression(payload) ? payload.properties.filter(ts.isPropertyAssignment).map(property => {
          const definition = unwrap(property.initializer);
          const field = new Map(ts.isObjectLiteralExpression(definition) ? definition.properties.filter(ts.isPropertyAssignment).map(p => [p.name.getText(source).replace(/^['"]|['"]$/g, ''), p.initializer]) : []);
          return { name: property.name.getText(source).replace(/^['"]|['"]$/g, ''), type: literal(field.get('type')), required: literal(field.get('required')), min: literal(field.get('min')), max: literal(field.get('max')) };
        }) : [];
        const code = literal(values.get('code'));
        const defaults = ts.isObjectLiteralExpression(defaultsNode) ? defaultsNode.properties.find(p => ts.isPropertyAssignment(p) && p.name.getText(source).replace(/^['"]|['"]$/g, '') === code)?.initializer : undefined;
        return { code, version: literal(values.get('version')), category: literal(values.get('category')), execution: literal(values.get('execution')), payload: fields, defaults: literal(defaults) ?? {} };
      });
    }
  }
}

if (!catalog?.length) throw new Error(`Could not read EVENT_CATALOG in ${catalogPath}`);
const documentedByLocale = new Map();
for (const { locale, file } of docsPaths) {
  const markdown = fs.readFileSync(file, 'utf8');
  const documented = new Map();
  for (const line of markdown.split(/\r?\n/).filter(line => /^\| `EVENT_/.test(line))) {
    const cells = line.split('|').slice(1, -1).map(cell => cell.trim());
    if (cells.length !== 6) throw new Error(`Malformed ${locale} event table row: ${line}`);
    const fields = ['none', 'nenhum', 'ninguno'].includes(cells[4]) ? [] : cells[4].split(', ').map((value) => {
      const match = value.match(/^`([^`]+)`:([A-Za-z][A-Za-z0-9_-]*)(\*)?(?: \[([^…]+)…([^\]]+)\])?$/);
      if (!match) throw new Error(`Malformed ${locale} payload field contract: ${value}`);
      const range = value.match(/ \[([^…]+)…([^\]]+)\]$/);
      return { name: match[1], type: match[2], required: match[3] ? true : undefined, min: range ? range[1] : undefined, max: range ? range[2] : undefined };
    });
    const rangeValue = value => value === undefined || value === '−∞' || value === '-∞' || value === '∞' ? undefined : Number(value);
    const payload = fields.map(field => ({ ...field, min: rangeValue(field.min), max: rangeValue(field.max) }));
    documented.set(cells[0].replace(/`/g, ''), { version: Number(cells[1]), category: cells[2], execution: cells[3], payload, defaults: JSON.parse(cells[5].replace(/^`|`$/g, '')) });
  }
  documentedByLocale.set(locale, documented);
}
const errors = [];
for (const { locale } of docsPaths) {
  const documented = documentedByLocale.get(locale);
  for (const entry of catalog) {
    const actual = documented.get(entry.code);
    if (!actual) errors.push(`${locale}: missing ${entry.code}`);
    else {
      if (actual.version !== entry.version) errors.push(`${locale} ${entry.code}: version ${actual.version}, expected ${entry.version}`);
      if (actual.category !== entry.category) errors.push(`${locale} ${entry.code}: category ${actual.category}, expected ${entry.category}`);
      if (actual.execution !== entry.execution) errors.push(`${locale} ${entry.code}: execution ${actual.execution}, expected ${entry.execution}`);
      if (JSON.stringify(actual.payload) !== JSON.stringify(entry.payload)) errors.push(`${locale} ${entry.code}: payload fields differ from the catalog`);
      if (JSON.stringify(actual.defaults) !== JSON.stringify(entry.defaults)) errors.push(`${locale} ${entry.code}: defaults differ from the catalog`);
    }
  }
  for (const code of documented.keys()) if (!catalog.some(entry => entry.code === code)) errors.push(`${locale}: obsolete ${code}`);
}
if (errors.length) {
  console.error(`Event documentation differs from EVENT_CATALOG (${catalog.length} catalog entries):\n- ${errors.join('\n- ')}`);
  process.exitCode = 1;
} else {
  console.log(`Event documentation matches ${catalog.length} catalog codes, versions, categories, execution modes, payload fields and defaults across en, pt and es.`);
}
