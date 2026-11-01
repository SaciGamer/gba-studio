#include <iostream>
#include "script_command_manager.h"
#include "script_trigger_manager.h"
#include "variable_manager.h"
#include "bn_log.h"
#include "hooks.h"
#include "generated_scripts.h"
#include "event_change_scene.h"

ChangeScene changeScene;

int failures = 0;
void require(bool condition, const char* message) {
    if(!condition) { std::cerr << message << '\n'; ++failures; }
}
void reset() {
    ScriptCommand::instance().resetIndex();
    trace.clear(); scheduler_logs.clear();
    VariableManager::instance().reset_all();
}
bool finish(const ScriptCommandData* program, int count) {
    for(int frame = 0; frame < 30; ++frame)
        if(ScriptCommand::instance().execute("scene", program, count)) return true;
    return false;
}
int main() {
    const VariableDefinition variables[] = {
        {"index", VariableType::number, 0, false, ""}, {"child_index", VariableType::number, 0, false, ""}
    };
    VariableManager::instance().initialize(variables, 2);
    const auto& trigger = SCENE_ATTACHED_TRIGGERS[0];
    require(trigger.on_enter_count == SCENE_ATTACHED_TRIGGER_0_ENTER_SCRIPTS_COUNT,
            "trigger enter count must match flattened generated program");
    require(trigger.on_leave_count == SCENE_ATTACHED_TRIGGER_0_LEAVE_SCRIPTS_COUNT,
            "trigger leave count must match flattened generated program");
    require(SCENE_ATTACHED_ACTORS[0].on_interact_count == SCENE_ATTACHED_ACTOR_0_INTERACT_SCRIPTS_COUNT,
            "actor interaction count must match flattened generated program");
    {
        ScriptTriggerManager manager;
        Scenes scene{}; scene.id = "scene"; scene.triggers = SCENE_ATTACHED_TRIGGERS; scene.triggers_count = SCENE_ATTACHED_TRIGGERS_COUNT;
        for(int frame = 0; frame < 5; ++frame) manager.update(scene, 1, 1, false, false, false);
        require(trace == std::vector<int>({11, 22}), "generated trigger branch must execute WAIT, body and continuation");
    }
    reset();
    require(finish(trigger.on_leave, trigger.on_leave_count) && trace == std::vector<int>({11, 22}),
            "generated leave branch must execute its complete program");
    reset();
    const auto& actor = SCENE_ATTACHED_ACTORS[0];
    require(finish(actor.on_interact, actor.on_interact_count) && trace == std::vector<int>({11, 22}),
            "generated interaction must execute its complete program");
    reset();
    require(finish(SCENE_LOOP_SCRIPTS, SCENE_LOOP_SCRIPTS_COUNT) && trace == std::vector<int>({1, 2, 9}),
            "FOR exit must reach the statement immediately after the loop");
    reset();
    std::vector<int> expected(20, 0);
    expected.insert(expected.end(), {1, 2, 9});
    require(finish(SCENE_LATE_LOOP_SCRIPTS, SCENE_LATE_LOOP_SCRIPTS_COUNT) && trace == expected,
            "FOR state slot must not depend on instruction index");
    reset();
    require(finish(SCENE_BREAK_LOOP_SCRIPTS, SCENE_BREAK_LOOP_SCRIPTS_COUNT) && trace == std::vector<int>({1, 9}),
            "generated BREAK must reach the statement immediately after FOR");
    reset();
    require(finish(SCENE_WHILE_LOOP_SCRIPTS, SCENE_WHILE_LOOP_SCRIPTS_COUNT) && trace == std::vector<int>({7, 9}),
            "generated WHILE must resume WAIT and break to the next statement");
    reset();
    require(finish(SCENE_NESTED_LOOP_SCRIPTS, SCENE_NESTED_LOOP_SCRIPTS_COUNT) && trace == std::vector<int>({1, 7, 7, 2, 7, 7, 9}),
            "nested generated loops must have distinct state slots and correct continuations");
    require(SCENE_COMMENTS_TRIGGERS[0].on_enter_count == 0 && SCENE_COMMENTS_ACTORS[0].on_interact_count == 0,
            "comment-only programs must expose zero count, not the source list length");
    VariableManager::instance().initialize(nullptr, 0);
    if(failures) return 1;
    std::cout << "Generated C++ program execution passed (production generator, scheduler, WAIT and triggers).\n";
}
