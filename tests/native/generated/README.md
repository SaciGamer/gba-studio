# Generated programs executed by the native scheduler

Build the main workspace, then run `node tests/generated-script-native.mjs`.
The runner invokes the compiled production ResourceBuilder, writes its emitted
headers into a unique temporary directory, compiles them with the production
scheduler/WAIT/variables/triggers and executes the resulting host program.
It requires a C++17 host compiler (`g++`, or executable path in `CXX`).

Unlike a textual ABI guard, this checks observable execution of generated
branches in trigger enter/leave and actor interaction records, a WAIT followed
by branch continuation, comment-only counts, FOR/BREAK/CONTINUE/WHILE exits,
late-position and nested loops. The generator also rejects more than 16 FOR
state slots per program, accepts the boundary of 16, and rejects unknown FOR
schema versions. FOR v2 is executed, not just accepted by a typecheck.

Handler doubles from `../scheduler` record values and select a literal boolean
condition. Actor interactions are invoked via their generated record, not via
the graphics manager's proximity/input logic. This does not emulate hardware
or test the full actor/scene lifecycle. See the scheduler fixture README for
the other host-test boundaries. The expanded generated-template ROM build is
a separate ARM compatibility gate, not proof of gameplay execution.
