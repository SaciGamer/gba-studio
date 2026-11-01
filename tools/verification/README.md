# Project verification tools

Run commands from the repository root. Build the main process first with
`corepack yarn build:main`. ROM checks require an installed devkitPro toolchain;
browser and emulator checks use the project Playwright/Electron dependencies.

- `node tools/verification/verify-generated-template.mjs --build`: generate a
  representative ROM and check its ELF memory placement and static headroom.
- `node tools/verification/verify-gba-memory.mjs <project.elf>`: inspect an ELF.
- `node tools/verification/verify-runtime-project.mjs <project-directory> --build`:
  transcode and build an authored project; additional emulator checks are optional.
- `node tools/verification/verify-scene-performance.mjs`: exercise actor capacity
  and scene performance scenarios; see the script arguments for build options.
- `verify-actor-offscreen.mjs`, `verify-affine-background.mjs`,
  `verify-background-animation.mjs`, `verify-default-palettes-rom.mjs` and
  `verify-input-performance.mjs`: focused generated-project scenarios.
- `verify-sample-project.mjs`, `verify-template-engine-game.mjs` and
  `verify-shooter-game-build.mjs`: check the bundled examples.
- `verify-site-event-catalog.mjs`, `verify-site-doc-assets.mjs`,
  `verify-site-build.mjs` and `verify-site-content.mjs`: check the separate
  sibling `gba-studio-site` checkout; build that site before checking output.

Fixtures under `fixtures/` support the actor-capacity and scene-performance
checks. Music regression tests use assets already included with the sample.
No local AI workspace or private reference project is required by the tests.

`reconstruct-shooter-game.mjs <source-project-directory>` rebuilds the bundled
shooter from an explicitly supplied graphics/audio source directory. It writes
project files, so use it only when intentionally regenerating the example.
