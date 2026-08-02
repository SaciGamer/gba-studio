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
