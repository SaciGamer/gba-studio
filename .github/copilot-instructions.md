# Copilot Instructions for GBA Studio

Keep changes concise, consistent, and aligned with the existing architecture.

## General rules
- This project is Electron + React + Vite. Main process code lives in src/main/ and renderer code in src/renderer/frontend/.
- Prefer existing providers, components, and typed preload helpers exposed via window.electronAPI.
- Keep UI work in the renderer and main-process work in the main process; avoid bypassing the preload layer when a helper already exists.
- When loading or updating project data, batch related state changes instead of applying many small updates.

## Reference docs
- [frontend.md](copilot/frontend.md)
- [ipc.md](copilot/ipc.md)
- [workflows.md](copilot/workflows.md)
- [butano-templates.md](copilot/butano-templates.md)

If a convention is unclear, ask which window or context should handle the change.
