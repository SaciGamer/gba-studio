#include <iostream>
#include <cstring>
#include "script_command_manager.h"
#include "variable_manager.h"
#include "resources.h"
#include "event_change_scene.h"
#include "generated_parameters.h"

ChangeScene changeScene;
int failures = 0, property_value = 0, engine_value = 0;
void require(bool result, const char* message) { if(!result) { std::cerr << message << '\n'; ++failures; } }
int read_variable(const char* id) {
    auto& manager = VariableManager::instance();
    const auto* definition = manager.find(id);
    return definition && definition->type == VariableType::boolean ? manager.get_boolean(id) : manager.get_number(id);
}
int read_property(const char*, int) { return property_value; }
int read_engine(int) { return engine_value; }
bool write_property(const char*, int, int value) { property_value = value; return true; }
bool write_engine(int, int value) { engine_value = value; return true; }
const VariableDefinition definitions[] = {
    {"inputA", VariableType::number, 2, false, ""}, {"inputB", VariableType::number, 20, false, ""},
    {"outputA", VariableType::number, 0, false, ""}, {"outputB", VariableType::number, 0, false, ""},
    {"outputOuter", VariableType::number, 0, false, ""}, {"text", VariableType::string, 0, false, "original"},
    {"textResult", VariableType::string, 0, false, ""}, {"flag", VariableType::boolean, 0, true, ""}
    , {"outputTwenty", VariableType::number, 0, false, ""}
};
void finish(const ScriptCommandData* program, int count) {
    for(int frame = 0; frame < 20; ++frame) if(ScriptCommand::instance().execute("scene", program, count)) return;
    require(false, "script did not finish");
}
int main() {
    auto& scheduler = ScriptCommand::instance();
    auto& manager = VariableManager::instance();
    manager.initialize(definitions, 9);
    numeric_runtime_hooks = {read_variable, read_property, read_engine, write_property, write_engine};
    SCRIPT_DEFINITIONS_COUNT = PARAM_SCRIPT_DEFINITIONS_COUNT;
    for(int index = 0; index < SCRIPT_DEFINITIONS_COUNT; ++index) SCRIPT_DEFINITIONS[index] = PARAM_SCRIPT_DEFINITIONS[index];
    require(!scheduler.execute("scene", SCENE_A_SCRIPTS, SCENE_A_SCRIPTS_COUNT), "first call must yield");
    require(!scheduler.execute("scene", SCENE_B_SCRIPTS, SCENE_B_SCRIPTS_COUNT), "second call must yield independently");
    require(manager.get_number("outputA") == 0 && manager.get_number("outputB") == 0, "reference writes must wait for their command");
    finish(SCENE_A_SCRIPTS, SCENE_A_SCRIPTS_COUNT);
    finish(SCENE_B_SCRIPTS, SCENE_B_SCRIPTS_COUNT);
    require(manager.get_number("outputA") == 3 && manager.get_number("outputB") == 21, "concurrent locals must be isolated across WAIT and IF");
    require(manager.get_number("inputA") == 2 && manager.get_number("inputB") == 20, "local arguments must preserve caller values");
    require(manager.scope == nullptr && !manager.find("__PARAM__:local"), "parameters must not leak outside execution");
    finish(SCENE_OUTER_SCRIPTS, SCENE_OUTER_SCRIPTS_COUNT);
    require(manager.get_number("outputOuter") == 107, "nested references must resolve their parent binding and restore parent locals");
    finish(SCENE_PROPERTY_SCRIPTS, SCENE_PROPERTY_SCRIPTS_COUNT);
    finish(SCENE_ENGINE_SCRIPTS, SCENE_ENGINE_SCRIPTS_COUNT);
    require(property_value == 5 && engine_value == 9, "attribute references must write their original targets");
    finish(SCENE_TEXT_SCRIPTS, SCENE_TEXT_SCRIPTS_COUNT);
    require(!std::strcmp(manager.get_string("text"), "reference") && !std::strcmp(manager.get_string("textResult"), "copy"), "text copy and reference must use separate storage");
    require(!manager.get_boolean("flag"), "boolean reference must preserve target type");
    finish(SCENE_TWENTY_SCRIPTS, SCENE_TWENTY_SCRIPTS_COUNT);
    require(manager.get_number("outputTwenty") == 23, "two nested calls with 20 parameters must fit, preserve the parent's local and resolve fixed-slot aliases");
    scheduler.restart("scene", SCENE_A_SCRIPTS);
    require(!scheduler.execute("scene", SCENE_A_SCRIPTS, SCENE_A_SCRIPTS_COUNT), "restart must create a new parameter frame");
    scheduler.cancel_scene("scene");
    manager.set_number("inputA", 30);
    finish(SCENE_A_SCRIPTS, SCENE_A_SCRIPTS_COUNT);
    require(manager.get_number("outputA") == 31, "cancellation must discard local values and numeric caches");
    VariableManager::Scope scope;
    manager.scope = &scope;
    ScriptParameterDefinition params[8];
    ScriptCallArgument arguments[8];
    NumericInstruction number{NumericOperation::op_number, 1, nullptr, 0};
    NumericProgram program{&number, 1};
    for(int index = 0; index < 8; ++index) { params[index] = {{"__PARAM__:capacity", VariableType::number, 0, false, ""}, false}; arguments[index] = {"__PARAM__:capacity", &program, nullptr, nullptr, {}, false}; }
    // Single-input frames exercise the shared binding capacity without native recursion.
    ScriptDefinition script{"capacity", nullptr, 0, params, 1};
    CallScriptEventData call{"capacity", arguments, 1};
    for(int index = 0; index < 40; ++index) require(manager.enter_call(script, call), "valid frame within binding capacity");
    require(!manager.enter_call(script, call) && scope.used == 40, "binding overflow must fail without corrupting its parent frame");
    manager.scope = nullptr;
    if(failures) return 1;
    std::cout << "Script inputs passed: generated ABI, local copies, references, nested/concurrent calls, WAIT/IF, attributes, text/boolean, cancellation and capacity.\n";
}
