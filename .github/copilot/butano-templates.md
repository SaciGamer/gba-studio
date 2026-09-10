# Butano template conventions

Use these rules when editing files under tools/butano/template or generating new code for that template.

## Template scope
- The Butano template is a scaffold for generated GBA projects under tools/butano/template.
- Preserve the existing structure of the template folders and files:
  - src/main.cpp: entry point for the generated project.
  - src/game.cpp: main game loop and lifecycle hooks.
  - src/startup.cpp: startup animation and boot-time visuals.
  - src/graphics_manager.cpp: scene/background rendering logic.
  - src/resource_registry.cpp: generated resource tables and lookup helpers.
  - src/event_*.cpp: event-driven script logic.
  - Makefile: build configuration for the Butano project.

## Coding rules for template files
- Keep the code compatible with Butano and the existing template style.
- Prefer small, composable functions and keep the generated code easy to extend.
- Follow the existing naming patterns: Game, GraphicsManager, ScriptCommand, ResourceRegistry and similar helpers.
- Preserve placeholder tokens such as {{PROJECT_NAME}}, {{AUTHOR}} and {{VERSION}} when present.
- If a new placeholder is needed, use the same {{NAME}} syntax and keep it explicit.
- Avoid introducing dependencies that are not already used in the template unless they are necessary for the feature.
- Keep comments short and consistent with the current Portuguese/English mix already used in the template.

## When generating or editing template code
- Prefer code that can be dropped into the template without extra wrappers.
- Use the same include style and namespace patterns already present in the nearby files.
- Keep generated code compatible with the template's build flow and with the generated resource structures.
- If the change affects generated resources, keep the resource registry and lookup helpers aligned with the new data.
- For new gameplay or UI features, prefer modular helpers instead of large one-off blocks.

## Practical guidance
- Do not remove or rename core template entry points unless the change is intentional and propagated consistently.
- Do not hardcode project-specific values when the template should stay generic.
- When adding new source files, keep the structure consistent with the existing template layout and ensure they fit the build flow.

## Generated event and resource contracts
- `TemplateBuilder` copies the template `include/` and `src/` directories recursively into each temporary build directory. New template headers and sources do not need a separate file list.
- The template Makefile compiles `src` and `$(BUILD)/src` through `SOURCES := src $(BUILD)/src`; keep new implementation files under `tools/butano/template/src/`.
- When creating a new generated definition, choose one canonical symbol name and use it identically in both the generated resource header and `resource_registry.cpp`. For scene scripts, use `<BASE>_SCRIPTS` and `<BASE>_SCRIPTS_COUNT`; do not create alternate forms such as `<BASE>S`.
- Before wiring a generated definition into the registry, verify that the symbol actually exists in the generated header. A mismatched presence check can silently select a fallback registry entry with `nullptr` scripts and a zero count, preventing runtime dispatch.
- Generated scene scripts use `ScriptCommandData`, whose `args` field is always `const void*`. A typed payload must therefore be declared separately and exposed through a pointer, for example:
  `static const SomeArgs ARGS_VALUE = { ... };` followed by `static const void* ARGS = &ARGS_VALUE;`.
- Do not emit a typed object by value where `ScriptCommandData.args` expects a pointer. This causes generated C++ initialization errors such as `cannot convert 'const SomeArgs' to 'const void*'`.
- Generic arguments emitted by `ResourceBuilder.emitArgs()` are pointer arrays. Their order is the property order of the generated object, so a `run_*` handler using positional casts must have an explicit canonical field order in `ResourceBuilder`.
- For control-flow definitions, keep jump targets separate from payload generation and remap them only after the complete sequence is built. Preserve original target indices while remapping so one rewritten index cannot corrupt later targets or create a self-loop.
- For a new event, add a dedicated `event_*.h/.cpp` or similarly named handler class, expose a small `run_*` facade, register the header through `event_registry.h`, and keep `script_command_manager.cpp` limited to dispatching and advancing the command index.
- A handler receiving `void*` should immediately cast it to the exact generated payload type, validate null arguments, perform its state transition, and return `true` only when the command is complete.
- Variable events use `VariableSetValueData` as the typed payload and `ConfigVariables` as the handler boundary. Keep conversion, source-variable resolution, writes, resets, and diagnostic `BN_LOG` calls there rather than in `ScriptCommand`.
- Use Butano string types for generated/runtime string comparisons (`bn::string` and its operators). Do not introduce `std::strcmp` for event routing or condition evaluation; express inequality as `!(left == right)` when the Butano type does not provide `operator!=`.
- Preserve generated resource and runtime field names together. If a handler depends on positional arguments, update the generator's canonical order and the handler's casts in the same change.

## Validation checklist
- Check generated C++ for the affected event and confirm every `ScriptCommandData` initializer receives a pointer symbol.
- Run the main TypeScript build after changing `ResourceBuilder` or `TemplateBuilder`.
- Compile the generated Butano project when changing template C++ or headers; host-side TypeScript diagnostics do not validate ARM/Butano payload casts.
