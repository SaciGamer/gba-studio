#include "script_trigger_manager.h"
#include "script_command_manager.h"

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

void ScriptTriggerManager::update(const Scenes& scene, int player_x, int player_y,
                                  bool interact_pressed, bool input_pressed, bool touch_active)
{
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
        if(!trigger.enabled || state.cooldown > 0 || (trigger.once && state.fired)) continue;
        bool fire = false;
        switch(trigger.activation) {
            case TriggerActivation::enter: fire = entered; break;
            case TriggerActivation::exit: fire = exited; break;
            case TriggerActivation::stay: fire = inside; break;
            case TriggerActivation::interact: fire = inside && interact_pressed; break;
            case TriggerActivation::touch: fire = inside && touch_active; break;
            case TriggerActivation::input: fire = input_pressed; break;
            case TriggerActivation::timer: fire = inside; break;
        }
        if(fire) {
            const ScriptCommandData* program = trigger.activation == TriggerActivation::exit ? trigger.on_leave : trigger.on_enter;
            const int program_count = trigger.activation == TriggerActivation::exit ? trigger.on_leave_count : trigger.on_enter_count;
            if(program && program_count > 0) {
                // A trigger may be entered and exited repeatedly. Restart the
                // selected program so its complete body runs on every firing.
                ScriptCommand::instance().restart(scene.id, program);
                ScriptCommand::instance().execute(scene.id, program, program_count);
                state.fired = true; state.cooldown = trigger.cooldown_frames;
            }
        }
    }
}
