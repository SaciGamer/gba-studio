#include <iostream>
#include "script_command_manager.h"
#include "script_trigger_manager.h"
#include "variable_manager.h"
#include "input_manager.h"
#include "resources.h"
#include "bn_log.h"
#include "hooks.h"
#include "event_change_scene.h"

ChangeScene changeScene;

int failures = 0;
void require(bool condition, const char* message) {
    if(!condition) { std::cerr << message << '\n'; ++failures; }
}
ScriptCommandData command(const char* name, const void* args = nullptr, int next = -1, int branch = -1, int loop = -1) {
    return {"test", name, args, 0, 1, next, branch, loop};
}
const VariableSetValueData mark1{"", VariableType::number, 1, false, nullptr, nullptr};
const VariableSetValueData mark2{"", VariableType::number, 2, false, nullptr, nullptr};
const VariableSetValueData mark3{"", VariableType::number, 3, false, nullptr, nullptr};
const VariableSetValueData mark4{"", VariableType::number, 4, false, nullptr, nullptr};
const VariableSetValueData read_loop{"", VariableType::number, 0, false, nullptr, "index"};
const VariableSetValueData read_child_loop{"", VariableType::number, 0, false, nullptr, "child_index"};
const VariableDefinition variables[] = {
    {"index", VariableType::number, 0, false, ""}, {"child_index", VariableType::number, 0, false, ""}
};
const WaitEventData wait2{0, 2, "frames"};
void reset() {
    ScriptCommand::instance().resetIndex();
    InputManager::instance() = InputManager();
    VariableManager::instance().initialize(variables, 2);
    SCRIPT_DEFINITIONS_COUNT = 0;
    trace.clear(); scheduler_logs.clear();
}

int main() {
    auto& scheduler = ScriptCommand::instance();
    reset();
    {
        const ScriptCommandData a[] = {command("EVENT_WAIT", &wait2, 1), command("EVENT_VARIABLE", &mark1)};
        const ScriptCommandData b[] = {command("EVENT_WAIT", &wait2, 1), command("EVENT_VARIABLE", &mark2)};
        require(!scheduler.execute("scene", a, 2), "WAIT must yield on its first frame");
        require(!scheduler.execute("scene", b, 2), "second WAIT must have independent state");
        require(!scheduler.execute("scene", a, 2) && !scheduler.execute("scene", b, 2), "WAIT must not finish early");
        require(trace.empty(), "commands after WAIT must not execute before completion");
        require(scheduler.execute("scene", a, 2) && scheduler.execute("scene", b, 2), "both WAIT scripts must finish");
        require(trace == std::vector<int>({1, 2}), "independent WAIT scripts must reach their own continuations");
        scheduler.execute("scene", a, 2);
        require(trace.size() == 2, "completed OnInit must not repeat");
        scheduler.restart("scene", a);
        require(!scheduler.execute("scene", a, 2), "restart must reset WAIT state");
    }
    reset();
    {
        ScriptConditionData condition{};
        condition.left.boolean_value = true;
        const ScriptCommandData script[] = {
            command("EVENT_IF", &condition, 1, 2), command("EVENT_VARIABLE", &mark1), command("EVENT_VARIABLE", &mark2)
        };
        require(scheduler.execute("scene", script, 3) && trace == std::vector<int>({1}), "IF true branch must select nextIndex");
        scheduler.restart("scene", script); trace.clear(); condition.left.boolean_value = false;
        require(scheduler.execute("scene", script, 3) && trace == std::vector<int>({2}), "IF false branch must select falseIndex");
    }
    reset();
    {
        const ScriptCommandData child[] = {command("EVENT_WAIT", &wait2, 1), command("EVENT_VARIABLE", &mark1)};
        const char* child_id = "child";
        const ScriptCommandData middle[] = {command("EVENT_CALL_SCRIPT", &child_id)};
        const char* middle_id = "middle";
        const ScriptCommandData parent[] = {command("EVENT_CALL_SCRIPT", &middle_id)};
        SCRIPT_DEFINITIONS[0] = {"child", child, 2};
        SCRIPT_DEFINITIONS[1] = {"middle", middle, 1};
        SCRIPT_DEFINITIONS_COUNT = 2;
        require(!scheduler.execute("scene", parent, 1), "nested call must yield at child WAIT");
        scheduler.execute("scene", parent, 1);
        require(scheduler.execute("scene", parent, 1), "tail calls must unwind all completed parents");
        require(trace == std::vector<int>({1}) && scheduler_logs.empty(), "tail return must not report an invalid index or rerun child");
    }
    reset();
    {
        const ForEventData loop{"index", 1, 3, 1};
        const ScriptCommandData script[] = {
            command("EVENT_FOR", &loop, 1, 3, 0), command("EVENT_VARIABLE", &read_loop, 2), command("EVENT_CONTINUE", nullptr, 0, -1, 0)
        };
        require(scheduler.execute("scene", script, 3), "finite FOR must terminate");
        require(trace == std::vector<int>({1, 2, 3}), "FOR body must observe start through end, not incremented values");
    }
    reset();
    {
        const ForEventData loop{"index", 3, 1, -1};
        const ScriptCommandData script[] = {
            command("EVENT_FOR", &loop, 1, 3, 0), command("EVENT_VARIABLE", &read_loop, 2), command("EVENT_BREAK", nullptr, 3, -1, 0)
        };
        require(scheduler.execute("scene", script, 3) && trace == std::vector<int>({3}), "BREAK must exit descending FOR after its initial value");
        scheduler.restart("scene", script); trace.clear();
        require(scheduler.execute("scene", script, 3) && trace == std::vector<int>({3}), "restart must reinitialize loop state");
    }
    reset();
    {
        std::vector<ScriptCommandData> script;
        for(int i = 0; i < 20; ++i) script.push_back(command("EVENT_VARIABLE", &mark1, i + 1));
        require(!scheduler.execute("scene", script.data(), 20) && trace.size() == 16, "instant commands must respect instruction budget");
        require(scheduler.execute("scene", script.data(), 20) && trace.size() == 20, "budget exhaustion must resume from the next instruction");
    }
    reset();
    {
        const char* buttons[] = {"A"};
        const ButtonWaitEventData binding{"A", buttons, 1, true};
        const char* child_id = "child";
        const ScriptCommandData child[] = {
            command("EVENT_VARIABLE", &mark1, 1), command("EVENT_VARIABLE", &mark2, 2),
            command("EVENT_VARIABLE", &mark3, 3), command("EVENT_VARIABLE", &mark4)
        };
        const ScriptCommandData parent[] = {
            command("EVENT_WAIT_FOR_BUTTON", &binding, 2, 1), command("EVENT_CALL_SCRIPT", &child_id, 2),
            command("EVENT_VARIABLE", &mark4)
        };
        SCRIPT_DEFINITIONS[0] = {"child", child, 4}; SCRIPT_DEFINITIONS_COUNT = 1;
        scheduler.execute("scene", parent, 3);
        require(trace == std::vector<int>({4}), "attach must skip its branch in the parent");
        InputManager::instance().pressed_buttons.insert("A");
        scheduler.update_button_bindings("scene");
        require(trace == std::vector<int>({4, 1, 2, 3, 4}), "button branch stop index must not truncate a called script");
        scheduler.cancel_scene("unrelated");
        require(InputManager::instance().overrides.count("A") == 1, "cancel unrelated scene must preserve live button overrides");
        scheduler.cancel_scene("scene");
        require(InputManager::instance().overrides.empty(), "cancel owning scene must release its overrides");
    }
    reset();
    {
        const ScriptCommandData script[] = {command("EVENT_CHANGE_SCENE", nullptr, 1), command("EVENT_VARIABLE", &mark1)};
        cancel_during_handler = "scene";
        scheduler.execute("scene", script, 2);
        require(trace.empty(), "cancellation inside handler must not execute old scene continuation");
    }
    reset();
    {
        const char* keys[] = {"START"};
        const ButtonWaitEventData binding{nullptr, keys, 1, true};
        const WaitEventData wait{0, 2, "frames"};
        const ScriptCommandData parent[] = {
            command("EVENT_WAIT_FOR_BUTTON", &binding, 3, 1), command("EVENT_WAIT", &wait, 2),
            command("EVENT_VARIABLE", &mark1, 3), command("EVENT_VARIABLE", &mark4, 4),
        };
        scheduler.execute("scene", parent, 4);
        InputManager::instance().pressed_buttons.insert("START");
        scheduler.update_button_bindings("scene", false);
        require(trace == std::vector<int>({4}), "transition updates must not start idle bindings");
        scheduler.update_button_bindings("scene");
        require(!InputManager::instance().pressed("START"), "override must suppress default input only");
        InputManager::instance().pressed_buttons.clear();
        for(int frame = 0; frame < 4; ++frame) scheduler.update_button_bindings("scene", false);
        require(trace == std::vector<int>({4, 1}), "running button WAIT must resume without launching new bindings");
    }
    reset();
    {
        const ForEventData outer{"index", 1, 2, 1}, inner{"child_index", 3, 4, 1};
        const ScriptCommandData child[] = {
            command("EVENT_FOR", &inner, 1, 3, 0), command("EVENT_VARIABLE", &read_child_loop, 2),
            command("EVENT_CONTINUE", nullptr, 0, -1, 0)
        };
        const char* child_id = "child";
        const ScriptCommandData parent[] = {
            command("EVENT_FOR", &outer, 1, 4, 0), command("EVENT_VARIABLE", &read_loop, 2),
            command("EVENT_CALL_SCRIPT", &child_id, 3), command("EVENT_CONTINUE", nullptr, 0, -1, 0)
        };
        SCRIPT_DEFINITIONS[0] = {"child", child, 3}; SCRIPT_DEFINITIONS_COUNT = 1;
        bool completed = false;
        for(int frame = 0; frame < 10 && !completed; ++frame) completed = scheduler.execute("scene", parent, 4);
        require(completed && trace == std::vector<int>({1, 3, 4, 2, 3, 4}), "called scripts must isolate loop slots and restore caller state");
    }
    reset();
    {
        ScriptTriggerManager manager;
        const ScriptCommandData program[] = {command("EVENT_WAIT", &wait2, 1), command("EVENT_VARIABLE", &mark1)};
        const ScriptTrigger trigger{"region", 0, 0, 8, 8, TriggerActivation::enter, true, true, 100, program, 2, nullptr, 0};
        Scenes scene{}; scene.id = "scene"; scene.triggers = &trigger; scene.triggers_count = 1;
        manager.update(scene, 1, 1, false, false, false);
        manager.update(scene, 20, 1, false, false, false);
        manager.update(scene, 20, 1, false, false, false);
        require(trace == std::vector<int>({1}), "real trigger plus real WAIT must finish outside its region");
    }
    reset();
    {
        const UiTargetEventData ui{"ui"}, missing{"missing"};
        const ScriptCommandData script[] = {
            command("EVENT_UI_HIDE", &ui, 1), command("EVENT_UI_SHOW", &ui, 2),
            command("EVENT_UI_DESTROY", &ui, 3), command("EVENT_VARIABLE", &mark1)
        };
        require(scheduler.execute("scene", script, 4), "UI lifecycle commands must complete immediately");
        require(trace == std::vector<int>({10, 11, 12, 1}), "UI lifecycle must preserve the next script event");
        reset();
        const ScriptCommandData failed[] = {command("EVENT_UI_DESTROY", &missing, 1), command("EVENT_VARIABLE", &mark2)};
        require(scheduler.execute("scene", failed, 2) && trace == std::vector<int>({2}), "missing UI must fail visibly and not hang script execution");
    }
    VariableManager::instance().initialize(nullptr, 0);
    if(failures) return 1;
    std::cout << "Native scheduler behavior passed (production scheduler, WAIT, variables and triggers).\n";
}
