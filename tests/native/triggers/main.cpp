#include <cstdlib>
#include <iostream>
#include "script_trigger_manager.h"
#include "script_command_manager.h"
#include "event_change_scene.h"

ChangeScene changeScene;

void require(bool condition, const char* message) {
    if(!condition) { std::cerr << message << '\n'; std::exit(1); }
}

const ScriptCommandData programs[2] = {
    {"a", "TEST", nullptr, 0, 1, -1, -1, -1},
    {"b", "TEST", nullptr, 0, 1, -1, -1, -1}
};

ScriptTrigger make_trigger(TriggerActivation activation, int index = 0) {
    return {"trigger", 0, 0, 10, 10, activation, true, false, 0,
            &programs[index], 1, &programs[index], 1};
}

Scenes make_scene(const ScriptTrigger* triggers, int count = 1) {
    Scenes scene{};
    scene.id = "scene";
    scene.triggers = triggers;
    scene.triggers_count = count;
    return scene;
}

void tick(ScriptTriggerManager& manager, const Scenes& scene, bool inside = true,
          bool interact = false, bool input = false, bool touch = false) {
    manager.update(scene, inside ? 5 : 20, 5, interact, input, touch);
}

int main() {
    auto& scheduler = ScriptCommand::instance();
    {
        scheduler = ScriptCommand();
        ScriptTriggerManager manager;
        auto trigger = make_trigger(TriggerActivation::enter);
        trigger.once = true;
        trigger.cooldown_frames = 100;
        const auto scene = make_scene(&trigger);
        tick(manager, scene);
        tick(manager, scene, false);
        tick(manager, scene, false);
        const auto& record = scheduler.records[programs];
        require(record.completions == 1, "once/enter script must resume outside region during cooldown");
        require(!record.occupied, "completed trigger must release its scheduler slot");
        for(int i = 0; i < 110; ++i) tick(manager, scene, i % 2 == 0);
        require(record.starts == 1, "once trigger must not restart after completion");
    }
    for(auto activation : {TriggerActivation::stay, TriggerActivation::timer,
                          TriggerActivation::touch, TriggerActivation::interact,
                          TriggerActivation::input}) {
        scheduler = ScriptCommand();
        ScriptTriggerManager manager;
        auto trigger = make_trigger(activation);
        const auto scene = make_scene(&trigger);
        for(int i = 0; i < 3; ++i) tick(manager, scene, true, true, true, true);
        require(scheduler.records[programs].starts == 1, "held activation must not restart a running script");
        require(scheduler.records[programs].completions == 1, "held activation must finish its script");
        tick(manager, scene, true, true, true, true);
        require(scheduler.records[programs].starts == 2, "trigger can fire again on a later frame");
    }
    {
        scheduler = ScriptCommand();
        ScriptTriggerManager manager;
        auto trigger = make_trigger(TriggerActivation::exit);
        trigger.on_enter = programs;
        trigger.on_leave = programs + 1;
        const auto scene = make_scene(&trigger);
        tick(manager, scene);
        require(scheduler.records.empty(), "exit script must not fire on entry");
        for(int i = 0; i < 3; ++i) tick(manager, scene, false);
        require(scheduler.records[programs + 1].completions == 1, "exit must resume the leave program");
        require(scheduler.records[programs].visits == 0, "exit must not execute the enter program");
    }
    {
        scheduler = ScriptCommand();
        ScriptTriggerManager manager;
        auto trigger = make_trigger(TriggerActivation::stay);
        trigger.cooldown_frames = 5;
        const auto scene = make_scene(&trigger);
        for(int i = 0; i < 5; ++i) tick(manager, scene);
        require(scheduler.records[programs].starts == 1, "cooldown must gate new firings, not execution");
        tick(manager, scene);
        require(scheduler.records[programs].starts == 2, "cooldown expires relative to activation");
    }
    {
        scheduler = ScriptCommand();
        ScriptTriggerManager manager;
        ScriptTrigger triggers[] = {make_trigger(TriggerActivation::enter), make_trigger(TriggerActivation::enter, 1)};
        const auto scene = make_scene(triggers, 2);
        for(int i = 0; i < 3; ++i) tick(manager, scene);
        require(scheduler.records[programs].completions == 1 && scheduler.records[programs + 1].completions == 1,
                "independent triggers must both progress once per frame");
        auto next_scene = make_scene(nullptr, 0);
        next_scene.id = "next";
        tick(manager, next_scene);
        require(scheduler.cancellations == 1 && scheduler.cancelled_scene == "scene", "scene switch must cancel old scheduler instances");
    }
    {
        scheduler = ScriptCommand();
        ScriptTriggerManager manager;
        auto trigger = make_trigger(TriggerActivation::enter);
        const auto scene = make_scene(&trigger);
        tick(manager, scene);
        tick(manager, scene, false);
        tick(manager, scene);
        require(scheduler.records[programs].starts == 1, "entry while running must not queue or restart");
        tick(manager, scene);
        require(scheduler.records[programs].starts == 1, "entry consumed while running must not fire later");
        tick(manager, scene, false);
        tick(manager, scene);
        require(scheduler.records[programs].starts == 2, "new entry after completion must restart the entire body");
        const int visits = scheduler.records[programs].visits;
        auto next_scene = make_scene(nullptr, 0);
        next_scene.id = "next";
        tick(manager, next_scene);
        tick(manager, next_scene);
        require(scheduler.records[programs].visits == visits && !scheduler.records[programs].occupied,
                "scene change must cancel a running trigger without resuming it");
    }
    {
        scheduler = ScriptCommand();
        ScriptTriggerManager manager;
        auto trigger = make_trigger(TriggerActivation::enter);
        const auto scene = make_scene(&trigger);
        tick(manager, scene);
        trigger.enabled = false;
        tick(manager, scene);
        tick(manager, scene);
        require(scheduler.records[programs].completions == 1, "disable gates activation, not a program already running");
    }
    {
        scheduler = ScriptCommand();
        scheduler.durations[programs] = 1;
        ScriptTriggerManager manager;
        auto trigger = make_trigger(TriggerActivation::stay);
        const auto scene = make_scene(&trigger);
        tick(manager, scene);
        require(scheduler.records[programs].completions == 1 && !scheduler.records[programs].occupied,
                "instant completion must release its slot in the same frame");
        trigger.enabled = false;
        tick(manager, scene);
        require(scheduler.records[programs].starts == 1, "disabled trigger must not start a script");
    }
    std::cout << "Native trigger behavior passed (production manager, scheduler test double).\n";
}
