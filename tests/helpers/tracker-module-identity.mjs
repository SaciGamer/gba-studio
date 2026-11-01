import fs from 'node:fs';
import ts from 'typescript';
import { buildSync } from 'esbuild';

const identitySource = fs.readFileSync('src/renderer/frontend/src/utils/trackerIdentity.ts', 'utf8');
const identityCompiled = ts.transpileModule(identitySource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const identityUrl = `data:text/javascript;base64,${Buffer.from(identityCompiled).toString('base64')}`;
const legacyFactoryCompiled = ts.transpileModule(fs.readFileSync('src/renderer/frontend/src/utils/trackerLegacyInstrumentLibrary.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const legacyFactoryUrl = `data:text/javascript;base64,${Buffer.from(legacyFactoryCompiled).toString('base64')}`;
const tuningCompiled = buildSync({entryPoints:['src/renderer/frontend/src/utils/trackerFactoryTuning.ts'],bundle:true,write:false,platform:'node',format:'esm'}).outputFiles[0].text;
const tuningUrl = `data:text/javascript;base64,${Buffer.from(tuningCompiled).toString('base64')}`;

export const inlineTrackerIdentity = source => source.replaceAll(
  "from './trackerIdentity';",
  `from '${identityUrl}';`,
).replaceAll("from './trackerLegacyInstrumentLibrary';", `from '${legacyFactoryUrl}';`)
 .replaceAll("from './trackerFactoryTuning';", `from '${tuningUrl}';`);
