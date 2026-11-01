# Changelog

All notable changes to GBA Studio are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Versioned development verification tools and regression fixtures, with tests
  using bundled music assets instead of private reference projects.
- Eight numeric local variables (Local A-H) per actor or trigger, shared across
  the instance's event tabs, with a Reset Local Variables event.
- Reusable script parameters with typed values and reference arguments.
- Variables Save and Variables Load events for selected or all global variables,
  independently of scene and player restoration.
- Independent Input Map configuration for each scene type and editable Gameplay,
  Menu and Interaction input groups; All always includes every button.
- Actor direction, main state, animation, position, visibility, rotation, scale
  and timed color-overlay controls, including player and Self targets.
- Actor-facing conditions with independent X/Y checks, distance limits and a
  scene preview, plus controls for actors that keep running while offscreen.
- Separate physics events for movement settings and vertical motion, alongside
  Stop Physics, collision-aware actor movement, pathfinding and ladder support.
- Pixel/tile unit selection for coordinate inputs, including Change Scene,
  Pan Camera and Scroll Background.
- Numeric inputs supporting variables, actor/player properties, constants,
  formulas, nested mathematical and logical operations, and expression copy/paste.
- Dialogue and UI text variable insertion with resolved initial-value previews.
- SFX generation and custom volume, speed and pan dials in Play Sound, with sound
  group selection in Stop Sounds and descriptions of priority and channel limits.
- Tracker composition tools with pattern, piano-roll, score, sample and instrument
  editing, envelopes, effect controls, undo/redo and project music saving.
- MOD/XM/S3M/IT inspection, format-aware previews, edited module export and
  Maxmod playback verification through the emulator.
- Runtime resource-monitor window integrated with the emulator.
- Autotile selection, Blob-47 terrain painting, mixed tileset/autotile editing
  and regular-background tile animation controls with timeline previews.
- Sprite canvas preparation that assembles editable pieces into animation frames
  without modifying the source spritesheets.
- Required-input indicators, script descriptions in Call Script and navigation
  to referenced scene actors and triggers.
- Shooter, combat, spawner, rumble and UI lifecycle events, plus expanded bundled
  sample and shooter projects with authored menus, credits and scene flow.

### Changed

- Generated TypeScript build caches and project backup files are excluded from
  version control.
- Game Data Save and Game Data Load execute their own action branches; the
  separate legacy On Load event is no longer offered for new scripts.
- Reset All Variables restores configured global defaults; local variables and
  reusable script parameters are unaffected.
- Dialogue: Show continues the script immediately and remains visible until
  explicitly hidden; player interaction does not reveal or dismiss its text.
- Dialogue and menu initial selections display zero-based values, matching the
  value stored in the result variable.
- Settings places Input Map and Input Groups alongside each other and exposes
  scene-specific actions through the scene-type selector.
- Nested event previews take precedence over parent previews during hover,
  scrolling and interaction with child controls.
- Sprite and state names use the same hover editing outline as scene and project
  names; offscreen behavior descriptions are shown in tooltips.
- Camera and actor movement share speed presets and destination-aware titles;
  coordinate, layer and asset selectors use consistent controls.
- Sprite Effect is hidden from new-event menus; existing scripts remain supported
  alongside the separate actor effect events.
- Bundled projects live under templateEngineGame; cartridge artwork is packaged
  with the application.
- Panel sizes, expansion states, per-object scroll positions and sprite preview
  settings persist across editing sessions.
- Build preparation uses project-specific native modules, validates references
  and reports localized asset and compiler stages.
- Current event and runtime-monitor contracts consistently use schema version 1.

### Fixed

- The Boy Picture sample uses zero-based menu results consistently in its While
  condition and Switch branches.
- Local variable selections no longer disappear during automatic reference repair.
- Deleted variables and scripts are excluded from hierarchy and event selectors,
  and removed from project files when saving.
- Prefab events cannot be edited from scene instances unless editing is enabled
  or the instance is detached.
- Variable interpolation identifiers do not consume dialogue/UI text capacity;
  previews account for the resolved variable value instead.
- Hide Dialogue closes the active dialogue, including when called from triggers.
- Play Sound group typing no longer updates the shared group list on every keypress.
- Emulator FPS/CPU indicators do not leave black placeholders before measurements.
- Change Scene passes independent X/Y units correctly; coordinate expressions
  preserve pixel/tile conversions and property offsets.
- Actor interaction uses configured collider contact, while collider preview
  visibility persists with each scene actor.
- Running trigger scripts continue across waits independently of activation,
  cooldown and once settings; actor and trigger script instances retain ownership.
- Scene transitions cancel stale continuations and input bindings while preserving
  the destination scene's initialization.
- Large graphics and script state stays in EWRAM, and physics resets respect the
  generated actor capacity instead of writing beyond the reserved arrays.
- Generated payloads, nested branches, loop continuations and native module
  dependencies are validated before producing the game.
- Tracker decoding, preview timing, effects, panning, sample preparation and
  Maxmod compatibility were corrected across supported module formats.
- Indexed image transparency, font metrics, directional sprite frames, scene
  overlays and background priority more closely match runtime rendering.
- World zoom/pan rejects invalid coordinates, painted maps retain their logical
  dimensions, and asset drops do not accidentally import internal preview images.
- Build target discovery rejects stale ROMs and reports missing output as a
  compilation failure; renderer builds preserve generated main-process helpers.

## [0.4.4] - 2026-09-07

### Added

- Core and layout improvements.
- Change-layer event support.
- Updated camera handling and Butano resource structures.

### Fixed

- Window content sizing, game-world scrolling, settings panels, and sample project behavior.

## [0.4.2] - 2026-08-21

### Added

- Butano logging and functional example project flow.
- Save without duplicate files.

### Changed

- Temporary build workflow, project transcoding, file watching, project naming, and sample project defaults.

### Removed

- Unused default `main.c` and obsolete Tiled/devkitPro dependencies.

## [0.2.1] - 2025-11-25

### Added

- Preferences management for devkit, emulator, temporary builds, project switching, and single-instance handling.
- Asset management, project generation, and ImageMagick integration.

### Changed

- Menu interactions, packaging configuration, and application versioning.

## [2026-07 to 2026-08]

### Added

- Scene management, fade effects, internal emulator, Iodine GBA integration, tileset editing, multi-background scenes, HD backgrounds, bitmap scenes, and initial player/camera positioning.

### Changed

- Butano integration, build/transcoding pipeline, save-as behavior, setupMagick packaging, and toolchain configuration.

## [2025-03 to 2026-03]

### Added

- Vite-based frontend/backend skeleton.
- Scene icons, image synchronization, project settings contexts, backgrounds, scenes, and elements.
- Backup tools, README documentation, vendor-to-tools migration, preferences, asset generation, tilesets, HD and bitmap background support.

## Commit-Level History

The complete commit-level trajectory through `HEAD 503bd9c` on `2026-09-10` is preserved below. Merge commits are included because they document branch integration points.

- 2024-10-18 | f900cf5 | SaciGamer | Initial commit
- 2024-10-18 | 63bd9eb | SaciGamer | project gba-studio started - initial commit
- 2025-02-09 | e6c90e4 | SaciGamer | Dashboad completo e botões principais
- 2025-02-09 | 49120bc | SaciGamer | Complemento do commit anterior
- 2025-03-03 | 66e66c3 | SaciGamer | Add spalshwindow, launcher, splitters, window position
- 2025-03-21 | e8f69bb | SaciGamer | fix: skeleton - restruct project with builder file [ - config package build and run - reorganize BE e FE - add Vite.js - add tsconfg.json and vite.config.ts ]
- 2025-03-21 | a039722 | SaciGamer_Dev | Merge pull request #1 from SaciGamer/branch-skeleton
- 2025-03-29 | 2ff9cf4 | SaciGamer | feat: scene icone in build, drop image copy to project, sync imagens to project
- 2025-09-06 | fcbf576 | SaciGamer | feat: Add new interfaces and context providers for project settings, scenes, backgrounds, and elements
- 2025-11-22 | 997f1e1 | SaciGamer | feat: backup tools, mGBA, tiled, butano, butano-tiled, devKitARM-Pro
- 2025-11-22 | 5211b8a | SaciGamer | feat: add README.md
- 2025-11-22 | 10daeed | SaciGamer | feat: change vendor to tools
- 2025-11-22 | 803145f | SaciGamer | fix: variable name
- 2025-11-25 | 52da0e9 | SaciGamer | feat: integrate preferences management with new paths for devkit, emulator, and temporary builds, ajust try catch new, open e switch project
- 2025-11-25 | 5624929 | SaciGamer | fix: update PreferencesModal layout with Typography and remove Alert component
- 2025-11-25 | 04c48cd | SaciGamer | feat: enhance menu interactions with content view changes
- 2025-11-25 | d10cfe3 | SaciGamer | feat: update version to 0.2.1 and enable asar packaging; add project file handling for single instance
- 2025-12-03 | f29b1b4 | SaciGamer | feat: Implement asset management and project structure generation and ImageMagick binaries
- 2026-01-05 | eb02ca6 | SaciGamer | feat: Improves build output panel UX and updates docs link
- 2026-01-05 | 92b45eb | SaciGamer | fix: update about website
- 2026-02-12 | 87b286f | SaciGamer | feat: update butano version
- 2026-02-12 | daaf92f | SaciGamer | feat: create tileset editor and config new scene with multi backgrounds
- 2026-02-16 | 6f7fc1b | SaciGamer | feat: Adds HD background image support and selection logic
- 2026-02-20 | 053e53c | SaciGamer | feat: support a bitmap scene
- 2026-03-17 | 535117d | SaciGamer | feat: fix language and background selector, add favorities, pos initial player and camera, custom functions to change scene
- 2026-07-07 | 2ade942 | SaciGamer | feat: Implement scene management and fade effects
- 2026-07-09 | ada8f89 | SaciGamer | feat: Add iodine-gba dependency and implement bundling script for emulator
- 2026-07-27 | ca2d57b | SaciGamer | feat: add emulator component
- 2026-08-02 | 94f9ce4 | SaciGamer | feat: add internal emulator and creating setting to config
- 2026-08-02 | 6439866 | SaciGamer | fix: Implement code changes to enhance functionality and improve performance
- 2026-08-03 | fa2a8ad | SaciGamer | fixed: Remove Tiled Map Editor
- 2026-08-14 | 5006c35 | SaciGamer | feat: change open project to temp build with limit and remove toolchain of frontend, ajust transcode to create pre-build with midia to initial build, new save to temp build actual, remove no use classes and files, apply save-as
- 2026-08-17 | a4007d3 | SaciGamer | feat: new decompress setupMagick, remove dependence devkitPath external, config package to use engine, config package.json
- 2025-03-29 | cd624b3 | SaciGamer | feat: scene icone in build, drop image copy to project, sync imagens to project
- 2025-09-06 | 45c172c | SaciGamer | feat: Add new interfaces and context providers for project settings, scenes, backgrounds, and elements
- 2025-11-22 | 6f11532 | SaciGamer | feat: backup tools, mGBA, tiled, butano, butano-tiled, devKitARM-Pro
- 2025-11-22 | 8cc7b74 | SaciGamer | feat: add README.md
- 2025-11-22 | eb42559 | SaciGamer | feat: change vendor to tools
- 2025-11-22 | a7236b9 | SaciGamer | fix: variable name
- 2025-11-25 | 389f597 | SaciGamer | feat: integrate preferences management with new paths for devkit, emulator, and temporary builds, ajust try catch new, open e switch project
- 2025-11-25 | 0628627 | SaciGamer | fix: update PreferencesModal layout with Typography and remove Alert component
- 2025-11-25 | 74300d5 | SaciGamer | feat: enhance menu interactions with content view changes
- 2025-11-25 | 91b7e86 | SaciGamer | feat: update version to 0.2.1 and enable asar packaging; add project file handling for single instance
- 2025-12-03 | 5e0ff32 | SaciGamer | feat: Implement asset management and project structure generation and ImageMagick binaries
- 2026-01-05 | 3853334 | SaciGamer | feat: Improves build output panel UX and updates docs link
- 2026-01-05 | 0f4990f | SaciGamer | fix: update about website
- 2026-02-12 | d547315 | SaciGamer | feat: update butano version
- 2026-02-12 | de7d592 | SaciGamer | feat: create tileset editor and config new scene with multi backgrounds
- 2026-02-16 | d81f4a4 | SaciGamer | feat: Adds HD background image support and selection logic
- 2026-02-20 | ffa82f8 | SaciGamer | feat: support a bitmap scene
- 2026-03-17 | a167cd6 | SaciGamer | feat: fix language and background selector, add favorities, pos initial player and camera, custom functions to change scene
- 2026-07-07 | b047771 | SaciGamer | feat: Implement scene management and fade effects
- 2026-07-09 | 7c497e8 | SaciGamer | feat: Add iodine-gba dependency and implement bundling script for emulator
- 2026-07-27 | 2c0cf48 | SaciGamer | feat: add emulator component
- 2026-08-02 | 0dbf0dc | SaciGamer | feat: add internal emulator and creating setting to config
- 2026-08-02 | b72e8d2 | SaciGamer | fix: Implement code changes to enhance functionality and improve performance
- 2026-08-03 | e16953c | SaciGamer | fixed: Remove Tiled Map Editor
- 2026-08-14 | 91da780 | SaciGamer | feat: change open project to temp build with limit and remove toolchain of frontend, ajust transcode to create pre-build with midia to initial build, new save to temp build actual, remove no use classes and files, apply save-as
- 2026-08-17 | 7a10a53 | SaciGamer | feat: new decompress setupMagick, remove dependence devkitPath external, config package to use engine, config package.json
- 2026-08-18 | aebdb39 | SaciGamer_Dev | Update README.md
- 2026-08-19 | 5846c18 | SaciGamer | fix: save with rename scenes, start and stop folder watch
- 2026-08-19 | 91dffaa | SaciGamer | fix: add foldersToWatch and remove lopping without scenes
- 2026-08-21 | 3fea102 | SaciGamer | feat: add save without duplicate files
- 2026-08-21 | ed1baca | SaciGamer | fix: functional example project, clear watch files when close or save, default files settings, sanitize name to use in butano, remove default main.c (don t use), ajust collapse scripts,
- 2026-08-21 | 75447c5 | SaciGamer | feat: add log in butano
- 2026-08-21 | ba362ca | SaciGamer | feat: new version 0.4.2
- 2026-08-21 | c6c878a | SaciGamer | Merge branch 'develop' of https://github.com/SaciGamer/gba-studio into feature/gba-studio-butano-wip
- 2026-08-21 | 74af5e6 | SaciGamer | fix: removendo cena do sample exemple
- 2026-08-21 | 191e9c8 | SaciGamer_Dev | Merge pull request #12 from SaciGamer/feature/gba-studio-butano-wip
- 2026-08-25 | 2fd8844 | SaciGamer | fix: remove devkiPro, ajust env on compile, change send notification to windows, unify code to transcode, wait on template, atualizado o readme.md
- 2026-08-25 | a6c2fdb | SaciGamer | feat: update min version, update clean to remove dist
- 2026-08-25 | 8bf9070 | SaciGamer | fix: remove devkitPro resources package
- 2026-08-25 | f06298a | SaciGamer | Merge branch 'develop' of https://github.com/SaciGamer/gba-studio into feature/gba-studio-butano-wip
- 2026-08-25 | 82b6206 | SaciGamer_Dev | Merge pull request #13 from SaciGamer/feature/gba-studio-butano-wip
- 2026-09-07 | 45980bf | SaciGamer | feat: core and layout improvements [- Licensing   - Add actual license file - Graphics / Elements   - Adjust element resize using image min_size - Use real values for window content - Camera - Update camera view handling - Events - Support new event: change layer - Hide unused event features - Layout - Fix scroll issues in game world and settings panels - Sample Project - Increment example sample project - Core - Reconfigure objects and arrays to Butano]
- 2026-09-07 | 01f6830 | SaciGamer | Merge branch 'develop' of https://github.com/SaciGamer/gba-studio into feature/gba-studio-butano-wip
- 2026-09-07 | 83639c7 | SaciGamer_Dev | Merge pull request #14 from SaciGamer/feature/gba-studio-butano-wip
- 2026-09-07 | ab24d85 | SaciGamer | fix: change version to 0.4.4
- 2026-09-07 | 309a32e | SaciGamer | Merge branch 'develop' of https://github.com/SaciGamer/gba-studio into feature/gba-studio-butano-wip
- 2026-09-09 | 6c2267d | SaciGamer | feat: implement drag-and-drop functionality for event management in CollapseEventManager
- 2026-09-09 | b31dbc8 | SaciGamer | feat: add FlowEditorManager component and integrate flow editor button in SelectNewEvent
- 2026-09-10 | 503bd9c | SaciGamer | feat: enhance event editor and project settings flow - FIXED: Corrige a persistência de preferências e configurações do projeto; ajusta o builder de recursos; corrige integração dos templates Butano; resolve estado e contextos do frontend. FEATURE: adiciona eventos condicionais e de variável; melhora painéis e seleção de eventos; implementa colapso e fluxo de execução; atualiza interfaces/contextos; expande templates Butano com registries, handlers, variáveis e gerenciamento de recursos.
