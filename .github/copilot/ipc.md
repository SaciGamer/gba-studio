# IPC conventions

- Prefer window.electronAPI helpers in the renderer instead of calling ipcRenderer directly.
- Use invoke-style helpers for request/response flows and on/send helpers for event-driven communication.
- When a preload helper does not exist, add one in src/main/preload/preload.ts rather than introducing ad-hoc direct IPC usage.
- Keep IPC boundaries clear: the renderer requests work, the main process performs it, and the renderer updates state from the result.
