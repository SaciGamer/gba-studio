# Native scheduler behavior test

Run `node tests/script-scheduler-native.mjs` with a C++17 host compiler (`g++`
on PATH, or its executable path in `CXX`). This compiles the production
`script_command_manager.cpp`, `event_wait.cpp`, `variable_manager.cpp` and
`script_trigger_manager.cpp`, using their actual headers and resource structs.

Coverage includes independent WAIT state, completion/restart, next/false branch
selection, nested tail-call returns, FOR values and BREAK/CONTINUE, instruction
budget, button-attached calls, override ownership, cancellation during a handler,
loop-state isolation across calls, and triggers progressing through a real WAIT.

The host support types replace Butano containers/value types. The vector shim
enforces its declared capacity; it is not a hardware or memory-layout emulator.
`handlers.cpp` supplies the scheduler boundary: WAIT delegates to production
code, condition evaluation returns a test boolean, variable events record
observable values, and the scene-change handler requests actual cancellation.
The variable manager used by FOR is production code. Unused graphics/audio/UI
handlers abort if invoked, so they cannot accidentally count as passing coverage.
Input and generated script definitions are controlled fixtures.

This is **not** validation of graphics, audio, the condition-expression evaluator,
variable-event payload semantics, actual scene loading, the complete game loop,
or execution on GBA. Those require separate tests and a ROM/emulator gate.
Compilation uses strict warnings; runtime has a timeout. Temporary executables
are removed after each run and never written into the repository or library.
