# GBA Studio tile layers

Static paint and autotiles are prepared by `AssetBuilder.materializeTileLayerEdits` before runtime conversion. A saved scene stores paint recipes on its `backgrounds` layers, including the selected tileset and per-cell tiles/palettes. Preparation works on an independent build copy and creates indexed BMP backgrounds; it does not rewrite the saved scene or source images.

The final `SceneLayer` references a background ID, palette ID, offsets, layer ID and z-order. GraphicsManager derives hardware priority from the layer ID. The native ABI does not contain editor tile matrices, tileset IDs, source image paths or composition recipes.

Dynamic map-cell overrides retain their destination cell and encoded tile value. Tile animations retain the destination tile, source frame indices, frame duration, looping rule and initial frame. GraphicsManager applies these values to the native regular background while the game runs. Background replacement, palette changes, visibility, scroll and parallax continue using their explicit runtime event payloads.

There is no legacy bitmap tile-map renderer or compatibility migration. The obsolete scene-wide rows/cols/data fields and `initialize_tilemap` path have been removed. The sample project uses the current layer format. Projects need assets that can be materialized; missing tilesets or graphics produce build errors.

Verification: `tests/materialize-layer-build.mjs`, `tests/parallel-layer-build.mjs`, `tests/background-layer-runtime-native.mjs` and `tests/sprite-animation-canvas-rom.mjs --build --emulate --painted-map`. The last command checks the actual EmulatorJS framebuffer in an offscreen Electron window.
