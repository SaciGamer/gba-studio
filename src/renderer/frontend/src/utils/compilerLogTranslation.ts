type Translate = (key: string, params?: Record<string, string | number>) => string;

export function translateCompilerLog(payload: any, t: Translate): string {
  if (payload?.messageKey) return `>> ${t(payload.messageKey, payload.messageParams)}\n`;
  const message = payload?.message ? String(payload.message) : JSON.stringify(payload);
  return message.split('\n').map(line => {
    const header = line.match(/^\s*.+? (?:item header|file) written in (.+?)(\s+\(graphics size: (.+?)\))?\s*$/);
    if (header) return t('compiler.headerWritten', { file: header[1], details: header[3] ? ` (${t('compiler.graphicsSize', { size: header[3] })})` : '' });
    const size = line.match(/^\s*Processed (audio|graphics) size: (.+?)\s*$/);
    if (size) return t('compiler.processed', { kind: t(`compiler.${size[1]}`), size: size[2] });
    return line;
  }).join('\n');
}
