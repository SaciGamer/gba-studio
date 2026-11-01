# Scene frame lifecycle test

Run `node tests/scene-lifecycle-native.mjs` with a C++17 compiler. It compiles
the production `game.cpp`, scheduler, trigger manager and change-scene handler
against a controlled graphics/input/dialogue surface.

The test executes transitions initiated by scene OnInit, actor interaction and
trigger scripts. It verifies that the source frame yields immediately, source
actors/triggers/button bindings do not run after a load, scene-local scripts
are cancelled, target OnInit begins on the next frame, and reloading the same
scene ID still creates a fresh visit. A graphics scene revision distinguishes
same-ID reloads from continued execution. The fixture does not emulate Butano
rendering, fade pixels or actual scene registry lookup.
