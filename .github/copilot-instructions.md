# Copilot Instructions for GBA Studio

These notes describe project conventions, IPC patterns and common workflows so Copilot-style assistants can produce code consistent with the repository.

## Architecture Overview
- Electron (main) + React (renderer) + Vite for frontend development.
- Main process code lives in `src/main/` and is responsible for window lifecycle, builds, toolchain invocation and IPC handlers.
- Renderer code lives in `src/renderer/frontend/`. UI uses React + Ant Design; state is organised with Context providers under `src/renderer/frontend/src/providers/`.
- IPC exposure to the renderer is implemented via the preload script at `src/main/preload/preload.ts`. Use the helpers exposed on `window.electronAPI` instead of directly using `ipcRenderer`.

## Developer Workflows
- Start development: from project root run `yarn dev` (starts Vite + Electron in dev mode). See `package.json` scripts for options.
- Build: run `yarn build` to produce production bundles for main and renderer; packaging is handled separately (electron-builder or project scripts).
- Debug: use the VS Code launch configurations in `.vscode/` to attach to the renderer (Vite) or main process.
- GBA build: the native GBA build is orchestrated using the Makefile under `gba-project/`. Use `yarn build-gba` where provided.

## Patterns & Conventions
- Context Providers: keep domain state (scenes, backgrounds, palettes, settings) in Context providers and use provided setters to update state.
- IPC: prefer the typed helpers in the preload layer (`window.electronAPI`) over raw `send`/`invoke` calls when a helper is available. Helpers return Promises for `invoke`-style calls and expose `on` for event listeners.
- Batch updates: when loading a project, parse all resources then set context state in a small number of batched updates (see `Engine.tsx`).
- Ant Design: follow AntD accessibility and composition patterns; avoid nesting heading tags inside AntD components.
- File structure: keep pages under `src/renderer/frontend/src/components/pages/` and reuse existing providers and components.

## IPC / Preload (how to use)
Use the helpers on `window.electronAPI`. The preload exposes a mix of `invoke`-style methods (returning promises) and `on`/`send` helpers for events and notifications.

Common examples:

Prefer specific helpers when available:

```tsx
// Load preferences (returns a Promise)
const prefs = await window.electronAPI.loadPreferences();

// Invoke load settings for a project file
await window.electronAPI.loadSettings(projectFilePath);

// Request a folder selection (returns { filePath })
const res = await window.electronAPI.selectFolder();
```

Use the generic `send` helper to trigger main-side handlers that do not return a value:

```tsx
// Ask the main process to open the native Open dialog and load a project
window.electronAPI.send('open-project-window');
```

Subscribe to events emitted by the main process:

```tsx
// Theme change listener
window.electronAPI.on('change-theme', (event, theme) => {
  /* update UI theme */
});

// Listen for requests to provide serialized project data
window.electronAPI.onRequestSerializedProject(async (request) => {
  const serialized = await serializeProjectForRun();
  window.electronAPI.responseSerializedProject(serialized);
});
```

If a helper exists in `preload.ts` prefer it (e.g., `getDevkitPath`, `setDevkitPath`, `compileProjectDemo`, `saveImage`, `fetchImages`, etc.).

## Examples

Batch state update (Engine.tsx):

```tsx
// After parsing project file
setScenes(parsed.scenes);
setBackgrounds(parsed.backgrounds);
setSettings(parsed.settings);
setProject(parsed.project);
```

IPC usage examples (use helpers where present):

```tsx
// Preferred: invoke helper exposed by preload
await window.electronAPI.loadSettings(projectFilePath);

// Generic: notify main to open native dialog
window.electronAPI.send('open-project-window');
```

AntD title convention:

```tsx
<List.Item.Meta title={<span>{item.title}</span>} />
```

## Key Files & Directories
- `src/main/` — Electron main process code and handlers
- `src/main/preload/preload.ts` — IPC exposure (helpers attached to `window.electronAPI`)
- `src/renderer/frontend/` — React renderer (Vite project)
- `src/renderer/frontend/src/providers/` — React Context providers
- `gba-project/` — native GBA build helpers and Makefile

---
If a convention or helper is unclear, ask for the exact behavior you want implemented and which window/context should handle it.
