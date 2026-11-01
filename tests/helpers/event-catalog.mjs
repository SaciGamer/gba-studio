import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

// Bundle the authoritative catalog and shared numeric-field contract together.
const result = await build({ entryPoints: [fileURLToPath(new URL('../../src/shared/events/eventCatalog.ts', import.meta.url))], bundle: true, write: false, format: 'esm', platform: 'node' });
export const catalog = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
