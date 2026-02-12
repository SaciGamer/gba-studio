/**
 * Exemplos de uso dos novos builders e interfaces refatoradas
 * Este arquivo demonstra como usar a nova arquitetura de build
 */

import transcodeProject from './projectTranscoder/transcode-project';
import compileGBA from './gbaCompiler/compile-gba';
import TemplateBuilder from './builders/TemplateBuilder';
import ResourceBuilder from './builders/ResourceBuilder';
import AssetBuilder from './builders/AssetBuilder';
import type { TranscodeOptions, CompileOptions, GameConfig, ResourceFile } from './types/BuildTypes';

/**
 * Exemplo 1: Usar transcodeProject com opções estruturadas
 */
async function example1_TranscodeWithOptions() {
  const options: TranscodeOptions = {
    projectDir: '/path/to/project',
    outputDir: '/path/to/build',
    projectName: 'My Game',
    includeAssets: true,
  };

  const result = await transcodeProject(options);

  if (result.success) {
    console.log('Transcodificação completada!');
    console.log('Diretório de saída:', result.outputDir);
    console.log('Arquivos gerados:', result.sourceFiles);
  } else {
    console.error('Erro:', result.message);
  }
}

/**
 * Exemplo 2: Compilar com opções estruturadas
 */
async function example2_CompileWithOptions() {
  const options: CompileOptions = {
    buildDir: '/path/to/build',
    parallel: 4,
    verbose: true,
  };

  try {
    const result = await compileGBA(options);

    if (result.success) {
      console.log('Compilação bem-sucedida!');
      console.log('ROM:', result.gbaPath);
      console.log('ELF:', result.elfPath);
      console.log('Map:', result.mapPath);
    }
  } catch (err) {
    console.error('Erro de compilação:', err);
  }
}

/**
 * Exemplo 3: Usar TemplateBuilder diretamente
 */
async function example3_TemplateBuilder() {
  const builder = new TemplateBuilder({
    templateDir: '/path/to/tools/butano/template',
    buildDir: '/path/to/build',
    romTitle: 'MY GAME',
    romCode: 'GAME',
  });

  // Inicializar diretório de build
  await builder.initializeBuildDirectory({
    projectDir: '/path/to/project',
    projectName: 'My Game',
    targetDir: '/path/to/build',
    romTitle: 'MY GAME',
    romCode: 'GAME',
  });

  // Adicionar diretórios de ativos
  builder.addAssetDirectories(['graphics/sprites', 'graphics/backgrounds'], ['audio/music']);

  // Acessar paths configurados
  const srcDir = builder.getSrcDir();
  const includeDir = builder.getIncludeDir();
  const outputDir = builder.getOutputDir();

  console.log('Source:', srcDir);
  console.log('Include:', includeDir);
  console.log('Output:', outputDir);
}

/**
 * Exemplo 4: Usar ResourceBuilder para processar .gbasres
 */
async function example4_ResourceBuilder() {
  const builder = new ResourceBuilder('/path/to/build/src', '/path/to/tools/butano/template');
  const config: GameConfig = {
    projectName: 'My Game',
    authorName: 'Game Dev',
    version: '1.0.0',
    useThreads: false,
    useAudio: true,
    useGraphics: true,
  };

  // Processar todos os .gbasres em um diretório
  const resourceFiles = await builder.processResourceFiles('/path/to/project/resources');

  console.log(`Processados ${resourceFiles.length} recursos`);

  // Gerar header com declarações
  if (resourceFiles.length > 0) {
    await builder.writeResourceHeader(resourceFiles);

    // Gerar registro de recursos
    await builder.generateResourceRegistryClass(resourceFiles, config);

    console.log('Arquivos de recurso criados');
  }
}

/**
 * Exemplo 5: Usar AssetBuilder para copiar ativos
 */
async function example5_AssetBuilder() {
  const builder = new AssetBuilder('root/dir', '/path/to/build');
  const resourceFiles: ResourceFile[] = [
    // Suponha que estes foram obtidos do ResourceBuilder
    { resourceName: 'bg1', resourceType: 'gbares', headerContent: Buffer.from('...'), jsonContent: { _resourceType: 'background' } },
    { resourceName: 'sprite1', resourceType: 'gbares', headerContent: Buffer.from('...'), jsonContent: { _resourceType: 'sprite' } },
  ];

  // Copiar todos os ativos
  const stats = await builder.copyAssets('/path/to/project/assets', resourceFiles, {
    overwrite: true,
    preserveStructure: true,
    verbose: true,
  });

  console.log(`${stats.copiedCount} ativos copiados`);
  console.log(`${stats.skippedCount} ativos ignorados`);

  // Ou copiar tipos específicos
  await builder.copyGraphics('/path/to/project/graphics');
  await builder.copyAudio('/path/to/project/audio');
}

/**
 * Exemplo 6: Pipeline completo (Transcode + Compile)
 */
async function example6_CompletePipeline() {
  const projectDir = '/path/to/project';
  const buildDir = '/tmp/gba-build';

  try {
    // Passo 1: Transcodificar
    console.log('🔄 Transcodificando...');
    const transcodeResult = await transcodeProject({
      projectDir,
      outputDir: buildDir,
      includeAssets: true,
    });

    if (!transcodeResult.success) {
      throw new Error(`Transcodificação falhou: ${transcodeResult.message}`);
    }

    console.log('✅ Transcodificação completa');

    // Passo 2: Compilar
    console.log('🔨 Compilando...');
    const compileResult = await compileGBA({
      buildDir: transcodeResult.outputDir!,
      parallel: 4,
      verbose: false,
    });

    if (!compileResult.success) {
      throw new Error(`Compilação falhou: ${compileResult.stderr}`);
    }

    console.log('✅ Compilação completa');
    console.log(`📦 ROM gerada: ${compileResult.gbaPath}`);
    console.log(`🔍 Debug info: ${compileResult.elfPath}`);

    return compileResult.gbaPath;
  } catch (err) {
    console.error('❌ Erro no pipeline:', err);
    throw err;
  }
}

/**
 * Exemplo 7: Compatibilidade com interface legada
 */
async function example7_LegacyInterface() {
  // A nova função suporta a interface antiga para compatibilidade
  const result = await compileGBA({
    cwd: '/path/to/build', // Interface antiga
  });

  console.log('Funciona com interface legada:', result.gbaPath);
}

export {
  example1_TranscodeWithOptions,
  example2_CompileWithOptions,
  example3_TemplateBuilder,
  example4_ResourceBuilder,
  example5_AssetBuilder,
  example6_CompletePipeline,
  example7_LegacyInterface,
};
