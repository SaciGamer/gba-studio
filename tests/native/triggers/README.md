# Native trigger behavior test

Run `node tests/script-trigger-native.mjs` from the repository root. A native
C++17 compiler (`g++` on PATH, or an executable path in `CXX`) is required.
The test fails rather than silently skipping when the compiler is unavailable.

This builds the production `script_trigger_manager.cpp` and uses the production
trigger header and resource structs. Headers here and in `../support` replace
only Butano container/value types and the scheduler boundary for host execution.
The scheduler double returns running/completed statuses over multiple frame
visits; it does **not** execute WAIT instructions or emulate hardware, enforce
Butano container capacity, or prove the full scheduler's behavior.

Covered: cooperative continuation, once/cooldown, leave/enter selection,
reentry, held activations, independent programs, completed-slot release,
scene-switch cancellation, immediate completion and disabled triggers.
The selected policy is one running program per trigger, with retriggers
ignored (not queued) until completion. Disabling prevents new activation but
does not cancel an already running program. Cooldown starts at activation.

The executable is generated in a unique temporary directory and removed after
the test. No build products are written into the repository or Butano library.
ROM compilation and runtime/emulator tests remain separate integration gates.
