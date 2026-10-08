#include "script_trigger_manager.h"
#include "script_command_manager.h"
#include "event_change_scene.h"
#include "graphics_manager.h"

void ScriptTriggerManager::reset()
{
    scene_id = "";
    states = bn::array<State, 64>();
    initialized = false;
}

void ScriptTriggerManager::cancel_scene(const bn::string<64>& id)
{
    if(scene_id == id) reset();
}

void ScriptTriggerManager::advance(State& state)
{
    if(ScriptCommand::instance().execute(scene_id, state.running_program, state.running_count))
    {
        // Unlike scene OnInit, completed triggers do not need to retain a
        // scheduler slot: fired/running state controls their next activation.
        ScriptCommand::instance().restart(scene_id, state.running_program);
        state.running_program = nullptr;
        state.running_count = 0;
    }
}

void ScriptTriggerManager::update(const Scenes& scene, int player_x, int player_y,
                                  bool interact_pressed, bool input_pressed, bool touch_active)
{
    const uint32_t scene_revision = GraphicsManager::instance().get_scene_revision();
    if(!initialized || scene_id != scene.id) {
        if(initialized) ScriptCommand::instance().cancel_scene(scene_id);
        reset(); scene_id = scene.id ? scene.id : ""; initialized = true;
    }
    for(int i = 0; i < scene.triggers_count && i < 64; ++i)
    {
        const ScriptTrigger& trigger = scene.triggers[i];
        State& state = states[i];
        if(state.cooldown > 0) --state.cooldown;
        const bool inside = player_x >= trigger.x && player_x < trigger.x + trigger.width &&
                            player_y >= trigger.y && player_y < trigger.y + trigger.height;
        const bool entered = inside && !state.inside;
        const bool exited = !inside && state.inside;
        state.inside = inside;
        if(state.running_program)
        {
            // once, cooldown and region/input conditions gate new activations,
            // not a cooperative program already in flight. Use single-instance
            // semantics: ignore retriggers until completion, with no queue.
            advance(state);
            if(changeScene.active || GraphicsManager::instance().get_scene_revision() != scene_revision) return;
            continue;
        }
        if(!trigger.enabled || state.cooldown > 0 || (trigger.once && state.fired)) continue;
        const bool leave_script_available = trigger.on_leave && trigger.on_leave_count > 0;
        const bool fire_leave = exited && (trigger.activation == TriggerActivation::exit || leave_script_available);
        bool fire = fire_leave;
        if(!fire_leave) {
            switch(trigger.activation) {
                case TriggerActivation::enter: fire = entered; break;
                case TriggerActivation::exit: fire = false; break;
                case TriggerActivation::stay: fire = inside; break;
                case TriggerActivation::interact: fire = inside && interact_pressed; break;
                case TriggerActivation::touch: fire = inside && touch_active; break;
                case TriggerActivation::input: fire = input_pressed; break;
                case TriggerActivation::timer: fire = inside; break;
                default: break;
            }
        }
        if(fire) {
            const ScriptCommandData* program = fire_leave ? trigger.on_leave : trigger.on_enter;
            const int program_count = fire_leave ? trigger.on_leave_count : trigger.on_enter_count;
            if(program && program_count > 0) {
                // A trigger may be entered and exited repeatedly. Restart the
                // selected program so its complete body runs on every firing.
                ScriptCommand::instance().restart(scene.id, program);
                state.running_program = program;
                state.running_count = program_count;
                state.fired = true; state.cooldown = trigger.cooldown_frames;
                advance(state);
                if(changeScene.active || GraphicsManager::instance().get_scene_revision() != scene_revision) return;
            }
        }
    }
}
