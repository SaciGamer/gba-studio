# Copilot Instructions for GBA Studio

## Architecture Overview
- **Electron + React + Vite**: Desktop app with Electron (main process) and React (renderer process) using Vite for frontend builds.
- **Main Process**: Located in `src/main/`. Handles window management, IPC, filesystem, and project orchestration.
- **Renderer Process**: Located in `src/renderer/frontend/`. React components use Ant Design, context providers, and communicate with Electron via `window.electronAPI` (exposed in `preload.ts`).
- **Project Data Flow**: Project files, scenes, backgrounds, and settings are loaded/saved via IPC calls. State is managed in React Contexts and updated in batch (see `Engine.tsx`).
- **Build Output**: Main and renderer are built to `dist/main` and `dist/renderer`. Electron loads these in production.

## Developer Workflows
- **Start Dev**: Run `yarn dev` or `npm run dev` from project root. This starts Vite and Electron together (see `package.json` scripts).
- **Build**: Use `yarn build` or `npm run build` to build both main and renderer, then package with electron-builder.
- **Debug**: Use VS Code launch configs. For frontend, start Vite and attach Chrome/Edge debugger. For backend, debug Electron main process. See `.vscode/launch.json` and `.vscode/tasks.json`.
- **GBA Build**: Run `yarn build-gba` to build the GBA ROM via Makefile in `gba-project/`.

## Patterns & Conventions
- **Context Providers**: State for scenes, backgrounds, settings, etc. is managed via React Contexts in `src/renderer/frontend/src/providers/`. Always use context setters for updates.
- **IPC Communication**: Renderer communicates with main via `window.electronAPI.*` methods. All backend actions (file, settings, preferences) go through IPC.
- **Batch State Updates**: When loading project data, batch updates to context state (see `Engine.tsx` for example: parse all objects, then set state once per context).
- **Ant Design**: UI uses Ant Design components. Avoid nesting heading tags (e.g., `<h4>` inside `<h4>`) in custom titles for AntD components.
- **File Structure**: Major features are split into pages/components (e.g., `pages/engine/Engine.tsx`, `pages/launcher/Launcher.tsx`).
- **Global Styles**: CSS in `src/renderer/frontend/src/components/themes/globalStyles.css`.
- **Preload Script**: All secure IPC exposure is done in `src/main/preload/preload.ts`.

## Integration Points
- **Electron IPC**: All cross-process communication is via IPC. See `preload.ts` and main handlers in `src/main/handlers/`.
- **GBA Project**: Native GBA build via Makefile in `gba-project/`.
- **Ant Design**: UI library for all major components.
- **External APIs**: No direct external API calls; all backend logic is handled via Electron IPC.

## Examples
- **Batch Context Update**:
  ```tsx
  // In Engine.tsx
  setScenes(prev => [...prev, ...scenesFromFile]);
  setBackgrounds(prev => [...prev, ...backgroundsFromFile]);
  setSettings(settingsFromFile);
  setProject(projectFromFile);
  ```
- **IPC Usage**:
  ```tsx
  window.electronAPI.loadSettings(projectFilePath);
  window.electronAPI.send('open-project-window', null);
  ```
- **AntD Title Convention**:
  ```tsx
  <List.Item.Meta title={<span>{item.title}</span>} />
  ```

## Key Files & Directories
- `src/main/` - Electron main process
- `src/renderer/frontend/` - React renderer process
- `src/renderer/frontend/src/providers/` - Context providers
- `src/main/preload/preload.ts` - IPC exposure
- `gba-project/` - GBA ROM build system
- `.vscode/launch.json` & `.vscode/tasks.json` - Debug/task configs

---
**For unclear or missing conventions, ask the user for clarification or examples.**
