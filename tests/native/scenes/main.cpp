#include <iostream>
#include "game.h"
#include "graphics_manager.h"
#include "event_change_scene.h"
#include "input_manager.h"
#include "hooks.h"

extern ChangeScene changeScene;
int failures = 0;
void require(bool value, const char* message) {
    if(!value) { std::cerr << message << '\n'; ++failures; }
}
ScriptCommandData command(const char* name, const void* args) {
    return {name, args, -1, -1, -1};
}
enum class Origin { init, actor, trigger, button };

void transition_case(Origin origin, bool same_scene, const char* id) {
    auto& graphics = GraphicsManager::instance();
    ScriptCommand::instance().resetIndex();
    InputManager::instance() = InputManager();
    graphics = GraphicsManager();
    changeScene = ChangeScene{};
    trace.clear();

    const VariableSetValueData old_mark{"", VariableType::number, 1, false, nullptr, nullptr};
    const VariableSetValueData new_mark{"", VariableType::number, 2, false, nullptr, nullptr};
    const SceneChangeEventData transition{same_scene ? id : "next", 0, 0, "right", 1};
    const ScriptCommandData change[] = {command("EVENT_CHANGE_SCENE", &transition)};
    const char* buttons[] = {"START"};
    const ButtonWaitEventData binding{buttons, 1, true};
    const ScriptCommandData attached[] = {
        {"EVENT_WAIT_FOR_BUTTON", &binding, 2, 1, -1},
        {"EVENT_CHANGE_SCENE", &transition, 2, -1, -1},
    };
    const ScriptCommandData old_marker[] = {command("EVENT_VARIABLE", &old_mark)};
    const ScriptCommandData new_marker[] = {command("EVENT_VARIABLE", &new_mark)};
    ScriptTrigger triggers[] = {
        {0, 0, 8, 8, TriggerActivation::stay, origin == Origin::trigger, false, 0, change, 1, nullptr, 0},
        {0, 0, 8, 8, TriggerActivation::stay, true, same_scene, 0, old_marker, 1, nullptr, 0}
    };
    Scenes old_scene{}, new_scene{}, same_scene_target{};
    old_scene.id = id; old_scene.name = id;
    old_scene.triggers = triggers; old_scene.triggers_count = 2;
    if(origin == Origin::init) { old_scene.onInitScripts = change; old_scene.onInitCount = 1; }
    if(origin == Origin::button) {
        old_scene.onInitScripts = attached; old_scene.onInitCount = 2;
        old_scene.triggers_count = 0;
        InputManager::instance().pressed_buttons.insert("START");
    }
    new_scene.id = "next"; new_scene.name = "next";
    new_scene.onInitScripts = new_marker; new_scene.onInitCount = 1;
    same_scene_target.id = id; same_scene_target.name = id;
    same_scene_target.onInitScripts = new_marker; same_scene_target.onInitCount = 1;
    graphics.setScene(&old_scene);
    graphics.destination = same_scene ? &same_scene_target : &new_scene;
    if(origin == Origin::actor) { graphics.actor_program = change; graphics.actor_count = 1; }
    {
        Game game;
        game.update(); // Starts the transition; source scene is still current.
        require(graphics.loads == 0 && trace.empty(), "first transition visit must yield before loading");
        const int actor_updates = graphics.actor_updates;
        if(origin == Origin::button) {
            require(!InputManager::instance().pressed("START"), "attached override must suppress the default button action");
            old_scene.triggers_count = 2;
        }
        game.update(); // Fade completes and the production handler loads the target.
        require(graphics.loads == 1 && graphics.spawns == 1, "transition must load and spawn exactly once");
        require(trace.empty(), "no source trigger may execute after scene load in the same frame");
        if(origin == Origin::init || origin == Origin::button)
            require(graphics.actor_updates == actor_updates, "OnInit scene change must skip source actor interaction");
        game.update();
        if(same_scene)
            require(trace == std::vector<int>({2}), "same-scene reload must reset once triggers for the new visit");
        else
            require(trace == std::vector<int>({2}), "target OnInit must start next frame and remain registered");
        if(!same_scene) {
            game.update();
            require(trace == std::vector<int>({2}), "target OnInit must not be cancelled by stale trigger state");
        }
    }
}

int main() {
    transition_case(Origin::init, false, "init-source");
    transition_case(Origin::actor, false, "actor-source");
    transition_case(Origin::trigger, false, "trigger-source");
    transition_case(Origin::init, true, "self-init");
    transition_case(Origin::actor, true, "self-actor");
    transition_case(Origin::trigger, true, "self-trigger");
    transition_case(Origin::button, false, "button-source");
    transition_case(Origin::button, true, "self-button");
    if(failures) return 1;
    std::cout << "Scene frame lifecycle passed (production game loop, scheduler, triggers and transition handler).\n";
}
