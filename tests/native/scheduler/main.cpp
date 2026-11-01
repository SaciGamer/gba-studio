#include <iostream>
#include "local_variables.h"
#include "script_command_manager.h"
#include "script_trigger_manager.h"
#include "variable_manager.h"
#include "input_manager.h"
#include "resources.h"
#include "bn_log.h"
#include "hooks.h"
#include "event_change_scene.h"
#include "graphics_manager.h"

ChangeScene changeScene;

int failures = 0;
void require(bool condition, const char* message) {
    if(!condition) { std::cerr << message << '\n'; ++failures; }
}
ScriptCommandData command(const char* name, const void* args = nullptr, int next = -1, int branch = -1, int loop = -1) {
    return {name, args, next, branch, loop};
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
    auto& input = InputManager::instance();
    {
        reset();
        auto& vm = VariableManager::instance();
        const char* actor = "519d2d20-ff1c-4c08-b147-686a1fda743f";
        const char* other = "dfcf5f39-71b8-4fa2-82fa-bab42072e019";
        const uint32_t a = local_owner_key("scene", actor);
        const uint32_t b = local_owner_key("scene", other);
        const uint32_t t = local_owner_key("scene", actor, true);
        require(!vm.set_number("__LOCAL__:A", 1), "Scene scripts cannot write owner locals");
        vm.local_owner = a;
        for(int i = 0; i < 8; ++i) {
            char id[] = "__LOCAL__:A"; id[10] = char('A' + i);
            require(vm.set_number(id, i + 1), "All eight local slots are writable");
        }
        require(!vm.set_number("__LOCAL__:I", 9), "A ninth slot is rejected");
        vm.local_owner = b; require(vm.get_number("local_A") == 0, "New instance locals start at zero");
        vm.set_number("local_A", 50);
        vm.local_owner = t; vm.set_number("local_A", 70);
        vm.local_owner = a; require(vm.get_number("local_H") == 8, "Local values remain between owner tabs");
        vm.reset_all(); require(vm.get_number("local_A") == 1, "Global reset leaves locals unchanged");
        const ScriptCommandData local_reset[] = {command("EVENT_LOCAL_VARIABLE_RESET")};
        scheduler.execute("scene", local_reset, 1, actor);
        require(vm.get_number("local_A") == 0 && vm.get_number("local_H") == 0, "Local reset clears every slot of its owner");
        vm.local_owner = b; require(vm.get_number("local_A") == 50, "Local reset preserves other actors");
        vm.local_owner = t; require(vm.get_number("local_A") == 70, "Local reset preserves triggers");
        vm.release_local_owner(b); vm.local_owner = b; require(vm.get_number("local_A") == 0, "Removed owner loses local storage");
        vm.clear_locals(); vm.local_owner = t; require(vm.get_number("local_A") == 0, "Scene transition clears all local banks");
        reset();
        const VariableSetValueData write_local{"__LOCAL__:A", VariableType::number, 19, false, nullptr, nullptr};
        const ScriptCommandData shared[] = {command("EVENT_WAIT", &wait2, 1), command("EVENT_VARIABLE", &write_local)};
        scheduler.execute("scene", shared, 2, actor);
        scheduler.execute("scene", shared, 2, other);
        for(int frame = 0; frame < 3; ++frame) { scheduler.execute("scene", shared, 2, actor); scheduler.execute("scene", shared, 2, other); }
        vm.local_owner = a; require(vm.get_number("local_A") == 19, "Actor local context survives Wait");
        vm.local_owner = b; require(vm.get_number("local_A") == 19, "Shared prefab program has independent scheduler owners");
        reset();
    }
    for(int direction=0;direction<4;++direction) {
        reset();
        const ActorDirectionEventData args{"__SELF__",direction};
        const ScriptCommandData script[] = {command("EVENT_ACTOR_SET_DIRECTION",&args,1),command("EVENT_VARIABLE",&mark1)};
        require(scheduler.execute("scene",script,2,"7cb5fc5f-6220-4dd4-8db9-2a956d00d767"),"Direction event must complete immediately");
        const auto& graphics=GraphicsManager::instance();
        require(graphics.direction_actor=="7cb5fc5f-6220-4dd4-8db9-2a956d00d767"&&graphics.direction_value==direction,"Direction event must resolve Self and write the requested direction property");
        require(trace==std::vector<int>({1}),"Direction event must continue to the next command");
    }
    for(bool enabled : {true, false}) {
        reset();
        const TriggerEnabledEventData args{"8d650072-7876-463d-a70d-d2560a9795ad",enabled};
        const ScriptCommandData script[] = { command("EVENT_TRIGGER_SET_ENABLED", &args, 1), command("EVENT_VARIABLE", &mark1) };
        require(scheduler.execute("scene", script, 2), "Trigger state event must complete immediately");
        require(GraphicsManager::instance().trigger_enabled == enabled, "Trigger state event must write the requested enabled flag");
        require(trace == std::vector<int>({1}), "Trigger state event must continue to the next event");
    }
    {
        reset();
        const TriggerEnabledEventData args{"de82ab93-5e4d-4883-824c-93034a537cca",true};
        const ScriptCommandData script[] = { command("EVENT_TRIGGER_SET_ENABLED", &args, 1), command("EVENT_VARIABLE", &mark1) };
        scheduler.execute("scene", script, 2);
        require(trace == std::vector<int>({1}), "A missing trigger must preserve the scheduler's failure continuation behavior");
        require(!scheduler_logs.empty(), "A missing trigger must report a visible failure");
    }
    for(bool facing : {false, true}) {
        reset();
        auto& graphics = GraphicsManager::instance();
        graphics.facing_result = facing;
        const ActorFacingEventData args{"__SELF__", "__PLAYER__", true, false, 64, 32};
        const ScriptCommandData script[] = {
            command("EVENT_IF_ACTOR_FACING", &args, 1, 2),
            command("EVENT_VARIABLE", &mark1, 3),
            command("EVENT_VARIABLE", &mark2, 3),
            command("EVENT_VARIABLE", &mark3)
        };
        require(scheduler.execute("scene", script, 4, "f5c0e569-3dab-4447-9f40-db5a5c39ca4a"), "Facing condition should complete synchronously");
        require(trace == std::vector<int>({facing ? 1 : 2, 3}), "Facing selects exactly one branch then resumes its continuation");
        require(graphics.facing_source == "f5c0e569-3dab-4447-9f40-db5a5c39ca4a" && graphics.facing_target == "__PLAYER__", "Facing resolves Self to the owning actor");
        require(graphics.facing_look_x && !graphics.facing_look_y && graphics.facing_distance_x == 64 && graphics.facing_distance_y == 32, "Facing forwards axis switches and distances to the runtime");
    }
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
        const CallScriptEventData child_id{"child"};
        const ScriptCommandData middle[] = {command("EVENT_CALL_SCRIPT", &child_id)};
        const CallScriptEventData middle_id{"middle"};
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
        const ButtonWaitEventData binding{buttons, 1, true};
        const CallScriptEventData child_id{"child"};
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
        const ButtonWaitEventData binding{keys, 1, true};
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
        const CallScriptEventData child_id{"child"};
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
        const ScriptTrigger trigger{0, 0, 8, 8, TriggerActivation::enter, true, true, 100, program, 2, nullptr, 0};
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
    reset();
    {
        const char* aButtons[] = {"A"};const char* bButtons[] = {"B"};
        const ButtonWaitEventData attachA{aButtons,1,true},attachB{bButtons,1,true};
        const ButtonActionEventData runB{"B",true};
        const ScriptCommandData script[] = {
            command("EVENT_WAIT_FOR_BUTTON",&attachB,3,1),command("EVENT_WAIT",&wait2,2),command("EVENT_VARIABLE",&mark2,3),
            command("EVENT_WAIT_FOR_BUTTON",&attachA,6,4),command("EVENT_RUN_BUTTON_ACTION",&runB,5),command("EVENT_VARIABLE",&mark1,6),
            command("EVENT_VARIABLE",&mark3)
        };
        require(scheduler.execute("scene",script,7),"Attach setup must finish");
        trace.clear();input.pressed_buttons.insert("A");scheduler.update_button_bindings("scene");input.pressed_buttons.clear();
        require(trace==std::vector<int>({1}),"Custom action is scheduled cooperatively after the caller");
        for(int frame=0;frame<4;++frame)scheduler.update_button_bindings("scene");
        require(trace==std::vector<int>({1,2}),"Custom action must execute the source button script including WAIT");
        require(input.queued_action.empty(),"Custom action must not also trigger default input");
    }
    reset();
    {
        const char* buttons[]={"A"};const ButtonWaitEventData attach{buttons,1,true};const ButtonActionEventData runB{"B",false};
        const ScriptCommandData script[]={command("EVENT_WAIT_FOR_BUTTON",&attach,2,1),command("EVENT_RUN_BUTTON_ACTION",&runB,2),command("EVENT_VARIABLE",&mark3)};
        scheduler.execute("scene",script,3);input.pressed_buttons.insert("A");scheduler.update_button_bindings("scene");input.pressed_buttons.clear();
        require(input.queued_action=="B" && input.queued_trigger=="A","Default button actions must retain the physical triggering button for held movement");
        scheduler.cancel_scene("scene");
        input.queued_action.clear();scheduler.update_button_bindings("scene");
        require(input.queued_action.empty(),"Scene cancellation removes action assignments");
    }
    reset();
    {
        const char* aButtons[]={"A"};const char* bButtons[]={"B"};
        const ButtonWaitEventData attachA{aButtons,1,true},attachB{bButtons,1,true};
        const ButtonActionEventData runA{"A",true},runB{"B",true};
        const ScriptCommandData script[]={
            command("EVENT_WAIT_FOR_BUTTON",&attachA,3,1),command("EVENT_RUN_BUTTON_ACTION",&runB,2),command("EVENT_VARIABLE",&mark1,3),
            command("EVENT_WAIT_FOR_BUTTON",&attachB,6,4),command("EVENT_RUN_BUTTON_ACTION",&runA,5),command("EVENT_VARIABLE",&mark2,6),
            command("EVENT_VARIABLE",&mark3)};
        scheduler.execute("scene",script,7);trace.clear();input.pressed_buttons.insert("A");scheduler.update_button_bindings("scene");input.pressed_buttons.clear();
        for(int frame=0;frame<8;++frame)scheduler.update_button_bindings("scene");
        require(trace==std::vector<int>({1,2}),"A custom A-to-B-to-A cycle must fail visibly without infinite retriggering");
    }
    reset();
    {
        const char* buttons[] = {"LEFT"};
        const ButtonWaitEventData attach{buttons, 1, true};
        const ScriptCommandData first[] = {
            command("EVENT_WAIT_FOR_BUTTON", &attach, 2, 1), command("EVENT_VARIABLE", &mark1, 2)
        };
        const ScriptCommandData second[] = {
            command("EVENT_WAIT_FOR_BUTTON", &attach, 2, 1), command("EVENT_VARIABLE", &mark2, 2)
        };
        scheduler.execute("scene", first, 2);
        input.held_buttons.insert("LEFT");
        scheduler.update_button_bindings("scene");
        for(int frame = 0; frame < 120; ++frame) scheduler.update_button_bindings("scene");
        require(trace == std::vector<int>({1}), "A held button must not restart its completed branch every frame");
        scheduler.execute("scene", second, 2);
        scheduler.update_button_bindings("scene");
        require(trace == std::vector<int>({1, 2}), "The replacement must start on a key already being held");
        for(int iteration = 0; iteration < 24; ++iteration) {
            const auto* assignment = iteration % 2 == 0 ? first : second;
            scheduler.restart("scene", assignment);
            scheduler.execute("scene", assignment, 2);
            scheduler.update_button_bindings("scene");
        }
        require(trace.size() == 26, "Repeated held reassignments must not consume binding capacity");
        require(input.cleared_actions == 26, "Each replacement must release its previous generated input");
        const int cleared = input.cleared_actions;
        scheduler.restart("scene", second);
        scheduler.execute("scene", second, 2);
        scheduler.update_button_bindings("scene");
        require(input.cleared_actions == cleared && trace.size() == 26,
                "An unchanged On Update assignment must retain its held latch and generated action");
    }
    reset();
    {
        const char* directions[] = {"LEFT", "RIGHT"};
        const char* left[] = {"LEFT"};
        const ButtonWaitEventData both{directions, 2, true}, one{left, 1, true};
        const ScriptCommandData original[] = {
            command("EVENT_WAIT_FOR_BUTTON", &both, 2, 1), command("EVENT_VARIABLE", &mark1, 2)
        };
        const ScriptCommandData replacement[] = {
            command("EVENT_WAIT_FOR_BUTTON", &one, 2, 1), command("EVENT_VARIABLE", &mark2, 2)
        };
        input.held_buttons.insert("LEFT");
        scheduler.execute("scene", original, 2);
        scheduler.update_button_bindings("scene");
        scheduler.execute("scene", replacement, 2);
        scheduler.update_button_bindings("scene");
        scheduler.restart("scene", original);
        scheduler.execute("scene", original, 2);
        scheduler.update_button_bindings("scene");
        require(trace == std::vector<int>({1, 2, 1}),
                "Restoring a partially replaced assignment must reclaim the button exclusively");
        input.held_buttons.clear();
        scheduler.update_button_bindings("scene");
        input.held_buttons.insert("LEFT");
        scheduler.update_button_bindings("scene");
        require(trace == std::vector<int>({1, 2, 1, 1}), "The replaced branch must not remain active beside the restored assignment");
    }
    reset();
    {
        const char* buttons[] = {"A"};
        const ButtonWaitEventData attach{buttons, 1, true};
        const ScriptCommandData script[] = {
            command("EVENT_WAIT_FOR_BUTTON", &attach, 4, 1),
            command("EVENT_WAIT_FOR_BUTTON", &attach, 3, 2),
            command("EVENT_VARIABLE", &mark2, 3), command("EVENT_VARIABLE", &mark1, 4)
        };
        scheduler.execute("scene", script, 4);
        input.held_buttons.insert("A");
        scheduler.update_button_bindings("scene");
        scheduler.update_button_bindings("scene");
        require(trace == std::vector<int>({2}), "A running button branch can replace itself without losing its scene or resuming cancelled events");
    }
    VariableManager::instance().initialize(nullptr, 0);
    if(failures) return 1;
    std::cout << "Native scheduler behavior passed (production scheduler, WAIT, variables and triggers).\n";
}
