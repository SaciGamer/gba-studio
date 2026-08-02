# Development workflows

- Use yarn dev for local development.
- Use yarn build for production bundles.
- Use the VS Code launch configurations in .vscode/ for debugging the renderer or main process.
- For GBA builds, use the Makefile under gba-project/ and the provided build script when relevant.
- When loading a project, parse resources first and then apply state updates in a small number of batched operations.
