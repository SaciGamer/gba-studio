# Refatoração GBA Build - Documentação

## Visão Geral

A refatoração moderniza o processo de build do GBA, substituindo concatenação de strings por passagem de parâmetros estruturada e integrando o template Butano como base para a compilação.

## Estrutura do Projeto

### Diretórios Criados

#### `src/main/utils/types/BuildTypes.ts`
Define interfaces TypeScript para tipagem forte:
- `TranscodeOptions` - Opções para transcodificação de projetos
- `TranscodeResult` - Resultado da transcodificação
- `CompileOptions` - Opções de compilação
- `CompileResult` - Resultado da compilação
- `TemplateConfig` - Configuração do template
- `BuildConfig` - Configuração de build

#### `src/main/utils/builders/TemplateBuilder.ts`
Gerencia a inicialização do diretório de build a partir do template Butano:
- `initializeBuildDirectory()` - Prepara estrutura do template
- `configureMakefile()` - Customiza Makefile com valores do projeto
- `addAssetDirectories()` - Adiciona diretórios de ativos ao Makefile
- Métodos getter para acessar paths configurados

#### `src/main/utils/builders/ResourceBuilder.ts`
Converte recursos `.gbasres` em arquivos C embarcados:
- `processResourceFiles()` - Processa todos os .gbasres de um diretório
- `processResource()` - Converte um recurso individual
- `generateCSource()` - Gera código C para um recurso
- `generateResourceHeader()` - Cria arquivo de declarações
- `createResourceRegistry()` - Cria registro de recursos

#### `src/main/utils/builders/AssetBuilder.ts`
Copia e organiza ativos (gráficos, áudio, etc):
- `copyAssets()` - Copia ativos preservando estrutura
- `copyGraphics()` / `copyAudio()` - Copia tipos específicos
- `getAssetDestination()` - Determina local de cópia por tipo

### Arquivos Refatorados

#### `src/main/utils/projectTranscoder/transcode-project.ts`
**Antes:**
```typescript
export async function transcodeProject(projectDir: string)
```

**Depois:**
```typescript
export async function transcodeProject(options: TranscodeOptions): Promise<TranscodeResult>
```

**Benefícios:**
- Interface estruturada com `TranscodeOptions`
- Retorno tipado com `TranscodeResult`
- Passagem de parâmetros em vez de strings concatenadas
- Suporta mais configurações (incluir/excluir ativos, nome customizado)

#### `src/main/utils/gbaCompiler/compile-gba.ts`
**Antes:**
```typescript
const compileGBA = (options?: { cwd?: string }): Promise<CompileResult>
```

**Depois:**
```typescript
const compileGBA = (options: CompileOptions | { cwd?: string }): Promise<CompileResult>
```

**Benefícios:**
- Suporta ambas as interfaces (nova e legada para compatibilidade)
- Passagem de parâmetros estruturados
- Funções auxiliares bem definidas:
  - `setupEnvironment()` - Configura variáveis de ambiente
  - `normalizeEnvForMake()` - Normaliza caminhos Windows
  - `buildMakeArgs()` - Constrói argumentos do make
  - `locateCompiledOutput()` - Encontra arquivos compilados

### Integração do Template

O template Butano (`tools/butano/template/`) agora é a base para todas as compilações:

```
Template Structure:
├── Makefile          (configurado pelo projeto)
├── src/             (onde código fonte vai)
├── include/         (headers)
├── graphics/        (assets gráficos)
└── audio/          (assets de áudio)
```

## Fluxo de Build

### 1. Transcodificação (`transcodeProject`)

```
Input: TranscodeOptions
  ├─ projectDir: caminho do projeto
  ├─ outputDir: opcional (temp padrão)
  ├─ projectName: opcional
  └─ includeAssets: boolean

Process:
  1. Validar diretório do projeto
  2. Extrair nome do projeto de configurações
  3. Localizar template
  4. Inicializar builder template
  5. Copiar estrutura template → build dir
  6. Processar .gbasres → .c files
  7. Copiar ativos (gráficos, áudio)
  8. Gerar main.c

Output: TranscodeResult
  ├─ success: boolean
  ├─ outputDir: caminho da saída
  ├─ sourceFiles: arquivos gerados
  └─ message: status/erro
```

### 2. Compilação (`compileGBA`)

```
Input: CompileOptions
  ├─ buildDir: diretório de build
  ├─ devkitPath: opcional
  ├─ devkitPro: opcional
  ├─ parallel: número de jobs
  └─ verbose: logging detalhado

Process:
  1. Validar diretório de build
  2. Configurar environment (DEVKITARM, DEVKITPRO, LIBGBA)
  3. Normalizar caminhos para make/msys
  4. Construir argumentos make
  5. Executar make rebuild
  6. Coletar stdout/stderr
  7. Localizar outputs (.gba, .elf, .map)

Output: CompileResult
  ├─ success: boolean
  ├─ stdout: saída do compilador
  ├─ stderr: erros do compilador
  ├─ gbaPath: caminho da ROM
  ├─ elfPath: caminho do debug
  └─ mapPath: arquivo de símbolos
```

## Uso em main.ts

### Run-Live
```typescript
const transRes = await transcodeProject({
  projectDir: tmpPath,
  includeAssets: true,
});

const compileRes = await compileGBA({ 
  buildDir: transRes.outputDir 
});
```

### Compile-Project
```typescript
const transRes = await transcodeProject({
  projectDir: directoryPathProject,
  includeAssets: true,
});

const compileRes = await compileGBA({ 
  buildDir: transRes.outputDir 
});
```

## Benefícios da Refatoração

1. **Tipagem Forte**: Interfaces TypeScript eliminam erros de passagem de parâmetros
2. **Separação de Responsabilidades**: Builders encapsulam lógica específica
3. **Reutilização**: Builders podem ser usados em diferentes contextos
4. **Testabilidade**: Funções puras são mais fáceis de testar
5. **Manutenibilidade**: Estrutura clara e parâmetros nomeados
6. **Compatibilidade**: Suporta interface legada para migração gradual
7. **Escalabilidade**: Fácil adicionar novos tipos de ativos/processamento

## Próximas Etapas

1. Adicionar suporte a gráficos (integrar grit/bntmx)
2. Adicionar suporte a áudio (maxmod/aas)
3. Criar builders para maps e sprites
4. Adicionar cache de compilação
5. Melhorar relatórios de erro
6. Adicionar validação de projeto

## Compatibilidade

- ✅ Suporta interface antiga `{ cwd?: string }` para compatibilidade
- ✅ Todas as funcionalidades existentes mantidas
- ✅ Sem breaking changes no IPC
- ✅ Progressivo - migração incremental possível
