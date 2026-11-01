#include "script_trigger_manager.h"
#include "script_command_manager.h"
#include "gba_studio_features.h"
#if GBA_STUDIO_FEATURE_SCENE_CHANGE
#include "event_change_scene.h"
#endif
#include "graphics_manager.h"

namespace {
    bool transition_active() {
#if GBA_STUDIO_FEATURE_SCENE_CHANGE
        return changeScene.active;
#else
        return false;
#endif
    }
}

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
    if(ScriptCommand::instance().execute(scene_id, state.running_program, state.running_count, nullptr, state.owner_id))
    {
        // Unlike scene OnInit, completed triggers do not need to retain a
        // scheduler slot: fired/running state controls their next activation.
        ScriptCommand::instance().restart(scene_id, state.running_program, nullptr, state.owner_id);
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
        ScriptTrigger modified;
        const ScriptTrigger& trigger = GraphicsManager::instance().resolve_script_trigger(i, scene.triggers[i], modified);
        State& state = states[i];
        state.owner_id = trigger.id;
        if(state.cooldown > 0) --state.cooldown;
        const bool inside = trigger.enabled && GraphicsManager::instance().player_overlaps_trigger(trigger, player_x, player_y);
        const bool entered = inside && !state.inside;
        const bool exited = !inside && state.inside;
        state.inside = inside;
        if(state.running_program)
        {
            // once, cooldown and region/input conditions gate new activations,
            // not a cooperative program already in flight. Use single-instance
            // semantics: ignore retriggers until completion, with no queue.
            advance(state);
            if(transition_active() || GraphicsManager::instance().get_scene_revision() != scene_revision) return;
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
                ScriptCommand::instance().restart(scene.id, program, nullptr, state.owner_id);
                state.running_program = program;
                state.running_count = program_count;
                state.fired = true; state.cooldown = trigger.cooldown_frames;
                advance(state);
                if(transition_active() || GraphicsManager::instance().get_scene_revision() != scene_revision) return;
            }
        }
    }
}
