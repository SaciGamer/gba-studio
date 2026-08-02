# Frontend conventions

- Keep renderer UI code under src/renderer/frontend/ and place pages under src/renderer/frontend/src/components/pages/.
- Reuse existing providers and components before introducing new abstractions.
- Keep domain state in Context providers (for example scenes, backgrounds, palettes, settings) and update it through the provided setters.
- Follow Ant Design patterns and avoid nesting heading tags inside Ant Design components.
- Prefer simple, accessible composition over custom UI wrappers.
