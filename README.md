# GBA Studio

Este repositório contém o código-fonte do GBA Studio — uma aplicação desktop (Electron + React + Vite) para criação/gestão de projetos GBA e integração com ferramentas de compilação para gerar ROMs.

Este README explica o que é necessário para rodar e construir o projeto em desenvolvimento e em produção, e inclui dicas específicas para Windows, onde este repositório está sendo desenvolvido.

---

**Requisitos (essenciais)**

- Node.js LTS (recomenda-se Node 18 ou 20). Verifique com `node -v`.
- Yarn (opcional, mas usado nos scripts do projeto). Instale com `npm install -g yarn` ou use `corepack enable` nas versões modernas do Node.
- Git (para clonar o repositório).
- Ferramentas para build de GBA (devkitPro / devkitARM) para a parte de geração de ROMs — veja seção abaixo.
- (Opcional) mGBA ou outro emulador GBA para testes (uma cópia está disponível em `tools/mGBA` neste repositório).

**Requisitos específicos para Windows**

- PowerShell 5.1 (ou superior) já é o shell padrão — instruções abaixo usam PowerShell.
- Se for usar `devkitPro` do repositório local (fornecido em `tools/devkitPro`), defina as variáveis de ambiente `DEVKITPRO` e `DEVKITARM` apontando para as pastas corretas ou instale devkitPro normalmente (`devkitPro` install) e adicione `devkitARM` ao `PATH`.

Exemplo (PowerShell) para apontar para a cópia do repositório (ajuste o caminho se necessário):

```powershell
$env:DEVKITPRO = "X:\gba-studio\tools\devkitPro"
$env:DEVKITARM = "$env:DEVKITPRO\devkitARM"
$env:PATH = "$env:DEVKITARM\bin;$env:PATH"
```

Se preferir instalar devkitPro globalmente, siga as instruções oficiais em https://devkitpro.org.

---

**Instalação (dependências do projeto)**

1. Abra um terminal (PowerShell) na raiz do projeto:

```powershell
cd X:\gba-studio
```

2. Instale dependências Node/Yarn:

```powershell
yarn install
# ou, se preferir npm:
# npm install
```

Observação: o repositório contém subprojetos (por exemplo `src/main`, `src/renderer/frontend`); `yarn install` na raiz trata das dependências monorepo conforme os scripts do projeto.

---

**Rodando em desenvolvimento**

O projeto tem duas partes principais que normalmente rodam em paralelo:
- Frontend (Vite + React) em `src/renderer/frontend`
- Main (Electron) em `src/main`

Você pode usar as tasks configuradas no VS Code ou os scripts do `package.json`.

Exemplos (PowerShell, em terminais separados):

- Iniciar frontend (Vite):

```powershell
cd src/renderer/frontend
yarn dev
```

- Iniciar Electron (main) — dependendo do script disponível no `package.json`:

```powershell
# a partir da raiz do projeto
yarn dev:electron
# ou
yarn dev
```

Também há uma task pronta no workspace chamada `Start Vite Frontend` (veja a paleta de tarefas do VS Code ou `Run Task`).

---

**Build/Empacotamento**

- Build da aplicação (frontend + main):

```powershell
# na raiz do projeto
yarn build
```

- Build específico do main (separado):

```powershell
yarn build:main
```

- Empacotar instalador (electron-builder) — ver scripts do `package.json`:

```powershell
yarn dist
# ou
yarn build:package
```

- Build do GBA (gera ROM) — requer `devkitARM` e utilitários `make`:

```powershell
# exemplo genérico, pode haver um script específico:
# navegue até a pasta do projeto GBA e rode make
cd gba-project
make
# ou use o script do repo
yarn build-gba
```

Verifique `package.json` para os scripts exatos usados pelo projeto.

---

**Estrutura principal do repositório**

- `src/main/` — código do processo principal do Electron (window management, IPC, handlers)
- `src/renderer/frontend/` — frontend React + Vite
- `tools/` — ferramentas e bibliotecas empacotadas (ex.: `devkitPro`, `mGBA`, outras ferramentas auxiliares)
- `gba-project/` — (quando presente) Makefile e arquivos do projeto GBA que são compilados para gerar ROM
- `release/`, `icon/` e outros diretórios de empacotamento e assets

---

**Configurações e variáveis importantes**

- `DEVKITPRO` e `DEVKITARM`: apontam para o toolchain do devkitPro/devkitARM (necessário para compilação GBA).
- `PATH`: deve incluir `devkitARM\bin` para acesso a `arm-none-eabi-gcc`, `make`, etc.
- `NODE_ENV`: `development` ou `production` conforme necessário para builds.

---

**Dicas de depuração e resolução de problemas**

- Se `yarn build:main` falhar (ex.: erro no processo de transpile TypeScript ou rollup/electron-builder), verifique a saída completa do erro e procure por dependências nativas faltando ou por caminhos incorretos.
- Erros relacionados ao toolchain GBA geralmente indicam que `DEVKITARM` não está no `PATH` ou que `make` não está disponível.
- Para problemas com o frontend, abra `http://localhost:5173` (ou a porta indicada) para verificar se Vite está servindo o app.
- Se ver erros de IPC entre renderer e main, verifique `src/main/preload/preload.ts` e os handlers em `src/main/handlers/`.

---

**Sistema de Resources (GBA)**

O projeto utiliza um sistema automático de geração de headers C/C++ a partir de arquivos de recurso (`.gbasres`). Este sistema integra-se com Butano e devkitARM para compilação de ROMs.

**Fluxo de Resources**

1. **Arquivo de Recurso** (`.gbasres`): Arquivo JSON que define um recurso (Settings, Background, Scene, etc.)
   
2. **Header C/C++** (`.h`): O `ResourceBuilder` processa cada arquivo `.gbasres` e gera um header com constantes estáticas
   - Exemplo: `settings_res.h`, `scene_0_res.h`, `castle_novo_res.h`

3. **Resource Registry** (`resource_registry.cpp/.h`): Array central que registra todos os recursos com suas metadatas
   - Função: `get_resource_by_name(const char* name)` — busca por nome
   - Função: `get_resource_by_id(const bn::string<64>& id)` — busca por ID
   - Função: `get_resource_by_id_and_type(id, type)` — busca por ID e tipo

4. **Graphics Manager** (`graphics_manager.cpp`): Utiliza o registry para carregar recursos
   - Fluxo: Settings → Scene (por STARTSCENEID) → Background (por BACKGROUNDID) → Carregamento visual

**Estrutura de Recursos**

Cada recurso tem um tipo (`ResourceType`) e campos correspondentes:

- **Settings**: configurações iniciais do jogo
  - Campos: `STARTSCENEID`, `STARTX`, `STARTY`, `STARTMOVESPEED`, `STARTANIMSPEED`, `STARTDIRECTION`
  
- **Background**: imagens de fundo
  - Campos: `ID`, `AUTOCOLOR`, `FILENAME`, `NAME`
  
- **Scene**: cenas do jogo
  - Campos: `ID`, `NAME`, `BACKGROUNDID` (referência para o background)

**Geração de Headers**

Durante o build:

```powershell
yarn build:main
```

O `ResourceBuilder` (em `src/main/utils/builders/ResourceBuilder.ts`):
1. Lê todos os arquivos `.gbasres` de `sample_project_example/project/`
2. Extrai tipo (`__RESOURCETYPE`) e constantes de cada arquivo
3. Gera headers correspondentes em `include/`
4. Constrói o array `RESOURCES[]` em `resource_registry.cpp`

**Exemplo de uso em C++**

```cpp
// Buscar configurações
const Resource* settings = get_resource_by_name("settings");

// Extrair ID da cena inicial
bn::string<64> scene_id(SETTINGS_STARTSCENEID);

// Buscar cena pelo ID
const Resource* scene = get_resource_by_id_and_type(scene_id, ResourceType::Scene);

// Extrair e buscar background
const Resource* bg = get_resource_by_id_and_type(scene->background_id, ResourceType::Background);

// Criar background visual
auto bg_item = bn::regular_bg_items::castle_novo;
auto bg_ptr = bn::regular_bg_ptr::create(bg_item);
```

---



Se o repositório incluir testes (ver `package.json`), rode:

```powershell
yarn test
```

Caso não haja uma suíte de testes, use os passos de desenvolvimento para garantir que o aplicativo abre e se comporta corretamente.

---

**Contribuindo**

- Faça um branch por feature/fix. Este repositório usa branches (ex.: `feature/xxx`).
- Abra PRs com descrição clara e passos para reproduzir.
- Atualize documentação (`README.md`, `tasks.md`) ao alterar scripts ou adicionar novas dependências.

---

**Recursos e links úteis**

- devkitPro: https://devkitpro.org
- electron-builder: https://www.electron.build/
- Vite: https://vitejs.dev/
- React: https://reactjs.org/

---

Se algo aqui não bater com sua configuração local (por exemplo, scripts com nomes diferentes em `package.json`), diga-me que eu ajusto o README com os comandos exatos — posso também extrair automaticamente os scripts do `package.json` e atualizar o README se você quiser.
