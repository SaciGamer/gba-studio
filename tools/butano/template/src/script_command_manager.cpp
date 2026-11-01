#include "local_variables.h"
#include "runtime_monitor.h"
#include "gba_studio_features.h"
#include "script_command_manager.h"
#if GBA_STUDIO_FEATURE_SAVE
#include "save_manager.h"
#include "resource_registry.h"
#endif
#include "script_event_handlers.h"
#include "event_change_layer.h"
#include "resources.h"
#include "bn_log.h"
#include "input_manager.h"
#include "runtime_name.h"
#if GBA_STUDIO_FEATURE_VARIABLES
#include "variable_manager.h"
#endif
#include "graphics_manager.h"
#if GBA_STUDIO_FEATURE_MOTION
#include "actor_motion_manager.h"
#endif

template<class T>
static T actor_event_args(const void* args, const char* self_actor_id)
{
    T data = args ? *static_cast<const T*>(args) : T{};
    if(data.actor_id && runtime_name_equal(data.actor_id, "__SELF__")) data.actor_id = self_actor_id;
    return data;
}

ScriptCommand& ScriptCommand::instance()
{
    // Script instances and continuation stacks belong in EWRAM, preserving
    // IWRAM headroom for the CPU stack and Butano's audio/graphics internals.
#if defined(__arm__) || defined(__thumb__)
    static ScriptCommand sc __attribute__((section(".sbss")));
#else
    static ScriptCommand sc;
#endif
    return sc;
}

ScriptCommand::ScriptCommand() = default;
ScriptCommand::~ScriptCommand() = default;

namespace {
const char* const action_buttons[] = { "A", "B", "L", "R", "START", "SELECT", "UP", "DOWN", "LEFT", "RIGHT" };
int action_button_index(const char* button) {
    const char* name = button ? button : "";
    for(int index = 0; index < 10; ++index) if(runtime_name_equal(name, action_buttons[index])) return index;
    return -1;
}
}

bool ScriptCommand::queue_button_action(ScriptInstance& instance, const ButtonActionEventData& action)
{
    const int index = action_button_index(action.button);
    if(index < 0) return false;
    if(!action.custom) return InputManager::instance().queue_default_action(action.button, instance.button_source);
    const uint16_t mask = uint16_t(1 << index);
    if(instance.button_action_path & mask) {
        BN_LOG("Button action: recursive custom action rejected");
        return false;
    }
    for(const auto& binding : button_bindings) {
        if(!binding.occupied || binding.scene_id != instance.scene_id || !binding.buttons || binding.branch_index < 0) continue;
        bool removed = false;
        for(int i = 0; i < binding.removed_buttons_count; ++i)
            if(binding.removed_buttons[i] && runtime_name_equal(binding.removed_buttons[i], action.button)) removed = true;
        if(removed) continue;
        for(int i = 0; i < binding.buttons_count; ++i) if(binding.buttons[i] && runtime_name_equal(binding.buttons[i], action.button)) {
            requested_button_actions |= mask;
            requested_button_paths[index] |= uint16_t(instance.button_action_path | mask);
            requested_button_sources[index] = instance.button_source;
            return true;
        }
    }
    return false;
}

ScriptCommand::ScriptInstance* ScriptCommand::find_or_create(
    const bn::string<64>& scene_id_param, const ScriptCommandData* data, const char* self_actor_id, const char* trigger_owner_id)
{
    const uint32_t owner = local_owner_key(scene_id_param.data(), trigger_owner_id ? trigger_owner_id : self_actor_id, trigger_owner_id != nullptr);
    for(ScriptInstance& instance : instances)
    {
        if(instance.occupied && instance.scene_id == scene_id_param && instance.root_data == data && instance.local_owner == owner)
        {
            if(self_actor_id && self_actor_id[0]) instance.self_actor_id = self_actor_id;
            return &instance;
        }
    }
    for(ScriptInstance& instance : instances)
    {
        if(!instance.occupied)
        {
            instance = ScriptInstance();
            instance.occupied = true;
            instance.scene_id = scene_id_param;
            instance.root_data = data;
            instance.local_owner = owner;
            instance.active_data = data;
            if(self_actor_id && self_actor_id[0]) instance.self_actor_id = self_actor_id;
            return &instance;
        }
    }
    BN_LOG("ScriptScheduler: instance capacity exhausted");
    return nullptr;
}

void ScriptCommand::resetIndex()
{
    requested_button_actions = 0;
    for(int i = 0; i < 10; ++i) { requested_button_paths[i] = 0; requested_button_sources[i] = nullptr; }
#if GBA_STUDIO_FEATURE_MOTION
    ActorMotionManager::instance().cancel();
#endif
    ++cancellation_serial;
    InputManager::instance().clear_overrides();
    for(ButtonBinding& binding : button_bindings) binding = ButtonBinding();
    for(ScriptInstance& instance : instances) instance = ScriptInstance();
}

void ScriptCommand::update_detached_scripts()
{
    for(auto& instance : instances) if(instance.occupied && instance.detached) {
        if(!instance.completed) execute_instance(instance);
        if(instance.completed) instance = ScriptInstance();
    }
}

void ScriptCommand::cancel_actor(const bn::string<64>& scene_id_param, const char* actor_id)
{
    bool cancelled = false;
    for(ButtonBinding& binding : button_bindings) {
        if(!binding.occupied || binding.scene_id != scene_id_param || binding.self_actor_id != actor_id) continue;
        for(int index = 0; binding.buttons && index < binding.buttons_count; ++index) if(binding.buttons[index]) {
            InputManager::instance().clear_button_actions(binding.buttons[index]);
            InputManager::instance().set_override(binding.buttons[index], false);
        }
        binding = ButtonBinding();
        cancelled = true;
    }
    for(ScriptInstance& instance : instances) {
        if(!instance.occupied || instance.scene_id != scene_id_param || instance.self_actor_id != actor_id) continue;
#if GBA_STUDIO_FEATURE_MOTION
        ActorMotionManager::instance().cancel(&instance.motion_state);
#endif
        instance = ScriptInstance();
        cancelled = true;
    }
    for(const ButtonBinding& binding : button_bindings)
        if(binding.occupied && binding.override_button && binding.buttons)
            for(int index = 0; index < binding.buttons_count; ++index)
                if(binding.buttons[index]) InputManager::instance().set_override(binding.buttons[index], true);
    if(cancelled) ++cancellation_serial;
}

void ScriptCommand::cancel_scene(const bn::string<64>& scene_id_param)
{
    requested_button_actions = 0;
    for(int i = 0; i < 10; ++i) { requested_button_paths[i] = 0; requested_button_sources[i] = nullptr; }
    ++cancellation_serial;
    InputManager::instance().clear_overrides();
    for(ButtonBinding& binding : button_bindings)
        if(binding.occupied && binding.scene_id == scene_id_param) binding = ButtonBinding();
    // Overrides belong to live bindings, not to the last scene cancelled.
    for(const ButtonBinding& binding : button_bindings)
        if(binding.occupied && binding.override_button && binding.buttons)
            for(int index = 0; index < binding.buttons_count; ++index)
                if(binding.buttons[index]) InputManager::instance().set_override(binding.buttons[index], true);
    for(ScriptInstance& instance : instances)
    {
        if(instance.occupied && instance.scene_id == scene_id_param)
        {
#if GBA_STUDIO_FEATURE_MOTION
            ActorMotionManager::instance().cancel(&instance.motion_state);
#endif
            instance = ScriptInstance();
        }
    }
}

void ScriptCommand::attach_button(const bn::string<64>& scene_id_param,
                                  const ScriptCommandData* data,
                                  int count,
                                  int branch_index,
                                  int continuation_index,
                                  const ButtonWaitEventData& event, const char* self_actor_id, uint32_t local_owner)
{
    // Attach events can run from an On Update script. Keep an unchanged
    // assignment constant-time instead of rescanning every other binding on
    // every gameplay frame.
    ButtonBinding* previous_assignment = nullptr;
    for(ButtonBinding& binding : button_bindings)
    {
        if(binding.occupied && binding.scene_id == scene_id_param && binding.data == data &&
           binding.branch_index == branch_index && binding.continuation_index == continuation_index &&
           binding.self_actor_id == (self_actor_id ? self_actor_id : "") && binding.local_owner == local_owner)
        {
            previous_assignment = &binding;
            if(binding.removed_buttons_count == 0) return;
            break;
        }
    }

    // A held default action belongs to its old assignment. Keep physical input
    // held so the replacement starts immediately, but release its old mapping.
    for(int index = 0; event.buttons && index < event.buttons_count; ++index)
        InputManager::instance().clear_button_actions(event.buttons[index]);

    // The latest Attach assignment owns each button immediately. Stop a
    // previous attached script for that button and let the new assignment
    // observe a button that is already being held.
    for(ButtonBinding& binding : button_bindings)
    {
        if(!binding.occupied || binding.scene_id != scene_id_param ||
           (binding.data == data && binding.branch_index == branch_index && binding.continuation_index == continuation_index &&
           binding.self_actor_id == (self_actor_id ? self_actor_id : "") && binding.local_owner == local_owner)) continue;
        bool removed_running_source = false;
        for(int index = 0; binding.buttons && index < binding.buttons_count; ++index)
        {
            const char* old_button = binding.buttons[index];
            bool reassigned = false;
            for(int new_index = 0; old_button && event.buttons && new_index < event.buttons_count; ++new_index)
                if(event.buttons[new_index] && runtime_name_equal(event.buttons[new_index], old_button))
                {
                    reassigned = true;
                    break;
                }
            if(!reassigned) continue;

            bool already_removed = false;
            for(int removed_index = 0; removed_index < binding.removed_buttons_count; ++removed_index)
                if(binding.removed_buttons[removed_index] && runtime_name_equal(binding.removed_buttons[removed_index], old_button))
                {
                    already_removed = true;
                    break;
                }
            if(!already_removed && binding.removed_buttons_count < 32)
                binding.removed_buttons[binding.removed_buttons_count++] = old_button;
            InputManager::instance().set_override(old_button, false);
            if(binding.running_instance && binding.running_instance->button_source &&
               runtime_name_equal(binding.running_instance->button_source, old_button))
                removed_running_source = true;
        }

        if(removed_running_source && binding.running_instance)
        {
#if GBA_STUDIO_FEATURE_MOTION
            ActorMotionManager::instance().cancel(&binding.running_instance->motion_state);
#endif
            *binding.running_instance = ScriptInstance();
            binding.running_instance = nullptr;
        }

        bool has_active_button = false;
        for(int index = 0; binding.buttons && index < binding.buttons_count && !has_active_button; ++index)
        {
            bool removed = false;
            for(int removed_index = 0; binding.buttons[index] && removed_index < binding.removed_buttons_count; ++removed_index)
                if(binding.removed_buttons[removed_index] && runtime_name_equal(binding.removed_buttons[removed_index], binding.buttons[index]))
                {
                    removed = true;
                    break;
                }
            has_active_button = binding.buttons[index] && !removed;
        }
        if(!has_active_button && !binding.running_instance) binding = ButtonBinding();
    }

    if(previous_assignment)
    {
        previous_assignment->removed_buttons_count = 0;
        previous_assignment->held_latched_buttons = 0;
        if(previous_assignment->override_button)
            for(int index = 0; previous_assignment->buttons && index < previous_assignment->buttons_count; ++index)
                InputManager::instance().set_override(previous_assignment->buttons[index], true);
        return;
    }

    for(ButtonBinding& binding : button_bindings)
    {
        if(!binding.occupied)
        {
            binding = ButtonBinding();
            binding.occupied = true;
            binding.scene_id = scene_id_param;
            binding.self_actor_id = self_actor_id ? self_actor_id : "";
            binding.local_owner = local_owner;
            binding.data = data;
            binding.count = count;
            binding.branch_index = branch_index;
            binding.continuation_index = continuation_index;
            binding.buttons = event.buttons;
            binding.buttons_count = event.buttons_count;
            binding.override_button = event.override_button;
            BN_LOG("[Attach Script] registered scene=", scene_id_param.data(), " branch=", branch_index,
                   " override=", binding.override_button);
            if(binding.override_button && binding.buttons)
                for(int index = 0; index < binding.buttons_count; ++index) InputManager::instance().set_override(binding.buttons[index], true);
            return;
        }
    }
    BN_LOG("ScriptScheduler: button binding capacity exhausted");
}

void ScriptCommand::remove_button_script(const bn::string<64>& scene_id_param,
                                         const ButtonScriptRemoveEventData& event)
{
    if(!event.buttons || event.buttons_count <= 0) return;

    for(ButtonBinding& binding : button_bindings)
    {
        if(!binding.occupied || binding.scene_id != scene_id_param || !binding.buttons) continue;
        for(int button_index = 0; button_index < binding.buttons_count; ++button_index)
        {
            const char* assigned_button = binding.buttons[button_index];
            if(!assigned_button) continue;
            bool selected = false;
            for(int selected_index = 0; selected_index < event.buttons_count; ++selected_index)
                if(event.buttons[selected_index] && runtime_name_equal(event.buttons[selected_index], assigned_button))
                {
                    selected = true;
                    break;
                }
            if(!selected) continue;

            InputManager::instance().clear_button_actions(assigned_button);

            bool already_removed = false;
            for(int removed_index = 0; removed_index < binding.removed_buttons_count; ++removed_index)
                if(binding.removed_buttons[removed_index] && runtime_name_equal(binding.removed_buttons[removed_index], assigned_button))
                {
                    already_removed = true;
                    break;
                }
            if(!already_removed && binding.removed_buttons_count < 32)
                binding.removed_buttons[binding.removed_buttons_count++] = assigned_button;
            InputManager::instance().set_override(assigned_button, false);
        }
    }

    // Reapply overrides that still belong to other active button scripts.
    for(const ButtonBinding& binding : button_bindings)
    {
        if(!binding.occupied || !binding.override_button || !binding.buttons) continue;
        for(int button_index = 0; button_index < binding.buttons_count; ++button_index)
        {
            const char* assigned_button = binding.buttons[button_index];
            bool removed = false;
            for(int removed_index = 0; assigned_button && removed_index < binding.removed_buttons_count; ++removed_index)
                if(binding.removed_buttons[removed_index] && runtime_name_equal(binding.removed_buttons[removed_index], assigned_button))
                {
                    removed = true;
                    break;
                }
            if(assigned_button && !removed) InputManager::instance().set_override(assigned_button, true);
        }
    }

    for(ButtonBinding& binding : button_bindings)
    {
        if(!binding.occupied || binding.scene_id != scene_id_param || !binding.buttons || binding.running_instance) continue;
        bool has_active_button = false;
        for(int button_index = 0; button_index < binding.buttons_count && !has_active_button; ++button_index)
        {
            const char* assigned_button = binding.buttons[button_index];
            bool removed = false;
            for(int removed_index = 0; assigned_button && removed_index < binding.removed_buttons_count; ++removed_index)
                if(binding.removed_buttons[removed_index] && runtime_name_equal(binding.removed_buttons[removed_index], assigned_button))
                {
                    removed = true;
                    break;
                }
            has_active_button = assigned_button && !removed;
        }
        if(!has_active_button) binding = ButtonBinding();
    }
}

bool ScriptCommand::button_scene_transition_running(const bn::string<64>& scene_id_param) const
{
    for(const ButtonBinding& binding : button_bindings)
    {
        const ScriptInstance* instance = binding.running_instance;
        if(!binding.occupied || binding.scene_id != scene_id_param || !instance ||
           !instance->occupied || instance->completed || instance->current_index < 0 ||
           instance->current_index >= instance->active_count) continue;
        const char* command = instance->active_data[instance->current_index].command;
        if(command && runtime_name_equal(command, "EVENT_CHANGE_SCENE")) return true;
    }
    return false;
}

void ScriptCommand::update_button_bindings(const bn::string<64>& scene_id_param, bool allow_new_bindings)
{
    const uint16_t requested = allow_new_bindings ? requested_button_actions : 0;
    uint16_t paths[10] = {};
    const char* sources[10] = {};
    if(allow_new_bindings) {
        requested_button_actions = 0;
        for(int i = 0; i < 10; ++i) {
            paths[i] = requested_button_paths[i]; sources[i] = requested_button_sources[i];
            requested_button_paths[i] = 0; requested_button_sources[i] = nullptr;
        }
    }
    for(ButtonBinding& binding : button_bindings)
    {
        if(!binding.occupied || binding.scene_id != scene_id_param) continue;
        uint16_t held_buttons = 0;
        for(int index = 0; binding.buttons && index < binding.buttons_count; ++index)
        {
            const int action_index = action_button_index(binding.buttons[index]);
            if(action_index >= 0 && InputManager::instance().binding_held(binding.buttons[index]))
                held_buttons |= uint16_t(1 << action_index);
        }
        binding.held_latched_buttons &= held_buttons;
        if(binding.override_button && binding.buttons)
            for(int index = 0; index < binding.buttons_count; ++index)
            {
                bool removed = false;
                for(int removed_index = 0; binding.buttons[index] && removed_index < binding.removed_buttons_count; ++removed_index)
                    if(binding.removed_buttons[removed_index] && runtime_name_equal(binding.removed_buttons[removed_index], binding.buttons[index]))
                    {
                        removed = true;
                        break;
                    }
                if(binding.buttons[index] && !removed) InputManager::instance().set_override(binding.buttons[index], true);
            }

        if(!binding.running_instance)
        {
            if(!allow_new_bindings) continue;
            bool trigger_found = false;
            const char* pressed_button = nullptr;
            uint16_t action_path = 0;
            if(binding.buttons)
                for(int index = 0; index < binding.buttons_count; ++index)
                {
                    bool removed = false;
                    for(int removed_index = 0; binding.buttons[index] && removed_index < binding.removed_buttons_count; ++removed_index)
                        if(binding.removed_buttons[removed_index] && runtime_name_equal(binding.removed_buttons[removed_index], binding.buttons[index]))
                        {
                            removed = true;
                            break;
                        }
                    const bool held = InputManager::instance().binding_held(binding.buttons[index]);
                    const int action_index = action_button_index(binding.buttons[index]);
                    const bool invoke = action_index >= 0 && (requested & (1 << action_index));
                    const bool just_pressed = InputManager::instance().binding_pressed(binding.buttons[index]);
                    const bool held_latched = action_index >= 0 && (binding.held_latched_buttons & (1 << action_index));
                    if(!removed && binding.buttons[index] && (invoke || just_pressed || (held && !held_latched)))
                    {
                        trigger_found = true;
                        pressed_button = invoke ? sources[action_index] : binding.buttons[index];
                        action_path = invoke ? paths[action_index] : action_index >= 0 ? uint16_t(1 << action_index) : 0;
                        if(held && action_index >= 0) binding.held_latched_buttons |= uint16_t(1 << action_index);
                        break;
                    }
                }
            if(!trigger_found) continue;
            for(ScriptInstance& instance : instances)
            {
                if(!instance.occupied)
                {
                    instance = ScriptInstance();
                    instance.occupied = true;
                    instance.scene_id = scene_id_param;
                    instance.self_actor_id = binding.self_actor_id;
                    instance.local_owner = binding.local_owner;
                    instance.button_source = pressed_button;
                    instance.button_action_path = action_path;
                    instance.root_data = binding.data + binding.branch_index;
                    instance.active_data = binding.data;
                    instance.active_count = binding.count;
                    instance.current_index = binding.branch_index;
                    instance.stop_index = binding.continuation_index;
                    instance.stop_data = binding.data;
                    binding.running_instance = &instance;
                    BN_LOG("[Attach Script] activated scene=", scene_id_param.data(), " branch=", binding.branch_index);
                    break;
                }
            }
        }

        if(binding.running_instance)
        {
            ScriptInstance* running_instance = binding.running_instance;
            const uint32_t execution_serial = cancellation_serial;
            for(int step = 0; step < 16 && running_instance->occupied && !running_instance->completed; ++step)
            {
                const int previous_index = running_instance->current_index;
                execute_instance(*running_instance);
                // Change Scene cancels the source scene from inside this
                // handler. That also clears this button binding and its
                // ScriptInstance. Do not inspect or execute that reset
                // instance again in this instruction batch.
                if(execution_serial != cancellation_serial || !binding.occupied ||
                   binding.running_instance != running_instance || !running_instance->occupied)
                {
                    break;
                }
                if(previous_index == running_instance->current_index && !running_instance->completed) break;
            }
            if(binding.occupied && binding.running_instance == running_instance && running_instance->completed)
            {
                running_instance->occupied = false;
                binding.running_instance = nullptr;
                bool has_active_button = false;
                for(int index = 0; binding.buttons && index < binding.buttons_count && !has_active_button; ++index)
                {
                    bool removed = false;
                    for(int removed_index = 0; binding.buttons[index] && removed_index < binding.removed_buttons_count; ++removed_index)
                        if(binding.removed_buttons[removed_index] && runtime_name_equal(binding.removed_buttons[removed_index], binding.buttons[index]))
                        {
                            removed = true;
                            break;
                        }
                    has_active_button = binding.buttons[index] && !removed;
                }
                if(!has_active_button) binding = ButtonBinding();
            }
        }
    }
}

bool ScriptCommand::execute(bn::string<64> scene_id_param,
                            const ScriptCommandData* data, int count, const char* self_actor_id, const char* trigger_owner_id)
{
    if(!data || count <= 0) return true;
    ScriptInstance* instance = find_or_create(scene_id_param, data, self_actor_id, trigger_owner_id);
    if(!instance) return false;
    if(instance->completed) return true;
    if(instance->active_count == 0) instance->active_count = count;
    const uint32_t execution_serial = cancellation_serial;

    // Run a bounded batch of instantaneous instructions in this frame. A
    // temporal instruction (WAIT/FADE) keeps the same program counter and
    // yields immediately, preventing an unbounded loop from starving the
    // rest of the game update.
    constexpr int instruction_budget = 16;
    for(int step = 0; step < instruction_budget && !instance->completed; ++step)
    {
        const ScriptCommandData* previous_data = instance->active_data;
        const int previous_index = instance->current_index;
        execute_instance(*instance);
        if(execution_serial != cancellation_serial) return true;
        if(instance->active_data == previous_data && instance->current_index == previous_index)
        {
            break;
        }
    }
    return instance->completed;
}

void ScriptCommand::restart(bn::string<64> scene_id_param, const ScriptCommandData* data, const char* self_actor_id, const char* trigger_owner_id)
{
    const uint32_t owner = local_owner_key(scene_id_param.data(), trigger_owner_id ? trigger_owner_id : self_actor_id, trigger_owner_id != nullptr);
    if(!data) return;
    for(ScriptInstance& instance : instances)
    {
        if(instance.occupied && instance.scene_id == scene_id_param && instance.root_data == data && instance.local_owner == owner)
        {
#if GBA_STUDIO_FEATURE_MOTION
            ActorMotionManager::instance().cancel(&instance.motion_state);
#endif
            instance = ScriptInstance();
            return;
        }
    }
}

void ScriptCommand::execute_instance(ScriptInstance& instance)
{
#if GBA_STUDIO_FEATURE_VARIABLES
    struct LocalOwnerGuard { VariableManager& manager; uint32_t previous; ~LocalOwnerGuard() { manager.local_owner = previous; } }
        local_owner_guard{VariableManager::instance(), VariableManager::instance().local_owner};
    VariableManager::instance().local_owner = instance.local_owner;
#endif
#if GBA_STUDIO_FEATURE_NUMERIC
    numeric_self_actor_id = instance.self_actor_id.empty() ? nullptr : instance.self_actor_id.data();
#endif
#if GBA_STUDIO_FEATURE_SCRIPT_INPUTS
    struct ScopeGuard {
        VariableManager& manager;
        VariableManager::Scope* previous;
        ~ScopeGuard() { manager.scope = previous; }
    } scope_guard{VariableManager::instance(), VariableManager::instance().scope};
    VariableManager::instance().scope = &instance.parameter_scope;
#endif
    const uint32_t execution_serial = cancellation_serial;
    // A call at the end of a program can finish several continuation frames.
    // A button branch's stop index belongs only to its original program.
    while(true)
    {
        if(instance.continuations.empty() && instance.stop_data == instance.active_data && instance.stop_index >= 0 &&
           instance.current_index == instance.stop_index)
        {
            instance.completed = true;
            return;
        }
        if(instance.current_index < instance.active_count) break;
        if(!instance.continuations.empty())
        {
            const ScriptInstance::Continuation continuation = instance.continuations.back();
            instance.continuations.pop_back();
            instance.active_data = continuation.data;
            instance.active_count = continuation.count;
            instance.current_index = continuation.index;
            instance.structured_loop_remaining = continuation.loop_states;
            instance.self_actor_id = continuation.self_actor_id;
#if GBA_STUDIO_FEATURE_SCRIPT_INPUTS
            instance.parameter_scope.start = continuation.parameter_start;
            instance.parameter_scope.used = continuation.parameter_used;
#endif
        }
        else
        {
            // Keep the completed program registered so the scene loop does
            // not restart its OnInit script on every subsequent frame.
            instance.completed = true;
            return;
        }
    }
    if(instance.current_index < 0 || instance.current_index >= instance.active_count)
    {
        BN_LOG("ScriptScheduler: invalid instruction index");
        instance.occupied = false;
        return;
    }

    const ScriptCommandData& current = instance.active_data[instance.current_index];
    const bn::string<64> command = current.command ? current.command : "";
    const void* args = current.args;
#if GBA_STUDIO_FEATURE_NUMERIC
    alignas(std::max_align_t) unsigned char resolved_args[256];
    if(current.numeric_values) {
        if(!resolve_numeric_event(*current.numeric_values, &current, args, resolved_args, sizeof(resolved_args), instance.numeric_cache)) {
            BN_LOG("ScriptScheduler: invalid numeric event payload");
            instance.completed = true;
            return;
        }
        if(command == "EVENT_VARIABLE") {
            auto* value = reinterpret_cast<VariableSetValueData*>(resolved_args);
            const auto* target = VariableManager::instance().find(value->variable_id);
            if(target && target->type == VariableType::boolean) {
                value->type = VariableType::boolean;
                value->boolean_value = value->number_value != 0;
            }
        }
        args = resolved_args;
    }
#else
    if(current.numeric_values) {
        BN_LOG("ScriptScheduler: numeric payload in a build without numeric support");
        instance.completed = true;
        return;
    }
#endif

#if GBA_STUDIO_FEATURE_VARIABLES
    if(command == "EVENT_IF" || command == "EVENT_WHILE")
    {
#if GBA_STUDIO_FEATURE_NUMERIC
        instance.numeric_cache.reset();
#endif
        const bool result = args && IfEventHandler::evaluate(*static_cast<const ScriptConditionData*>(args));
        const int next_index = result ? current.nextIndex : current.falseIndex;
        instance.current_index = next_index >= 0 && next_index < instance.active_count
            ? next_index : instance.active_count;
        return;
    }

#endif
    if(command == "EVENT_IF_ACTOR_FACING")
    {
        const auto* data = static_cast<const ActorFacingEventData*>(args);
        const auto resolve = [&](const char* id) { return id && runtime_name_equal(id, "__SELF__") ? instance.self_actor_id.data() : id; };
        const bool result = data && GraphicsManager::instance().actor_is_facing(resolve(data->actor_id), resolve(data->target_actor_id), data->look_x, data->look_y, data->distance_x, data->distance_y);
        const int next_index = result ? current.nextIndex : current.falseIndex;
        instance.current_index = next_index >= 0 && next_index < instance.active_count ? next_index : instance.active_count;
        return;
    }
    if(command == "EVENT_IF_BUTTON_HELD")
    {
        const ButtonHeldEventData* held_button = static_cast<const ButtonHeldEventData*>(args);
        bool result = false;
        if(held_button && held_button->buttons)
            for(int index = 0; index < held_button->buttons_count; ++index)
                if(held_button->buttons[index] && InputManager::instance().held(held_button->buttons[index]))
                {
                    result = true;
                    break;
                }
        const int next_index = result ? current.nextIndex : current.falseIndex;
        instance.current_index = next_index >= 0 && next_index < instance.active_count
            ? next_index : instance.active_count;
        return;
    }

#if GBA_STUDIO_FEATURE_VARIABLES
    if(command == "EVENT_FOR")
    {
        const ForEventData& loop = args ? *static_cast<const ForEventData*>(args) : ForEventData{ nullptr, 0, 0, 1 };
        const int slot = current.loopIndex;
        int8_t* state = slot >= 0 && slot < 16 ? &instance.structured_loop_remaining[slot] : nullptr;
        if(state && *state < 0)
        {
            *state = 0;
            if(loop.variable_id && loop.variable_id[0] != '\0') VariableManager::instance().set_number(loop.variable_id, loop.start);
        }
        else if(state && loop.variable_id && loop.variable_id[0] != '\0')
        {
            // Advance on returning to the loop header, so the body observes
            // start first and CONTINUE advances exactly once per iteration.
            const int step = loop.step == 0 ? 1 : loop.step;
            VariableManager::instance().set_number(loop.variable_id,
                VariableManager::instance().get_number(loop.variable_id) + step);
        }
        const int current_value = loop.variable_id && loop.variable_id[0] != '\0'
            ? VariableManager::instance().get_number(loop.variable_id)
            : loop.start;
        const int step = loop.step == 0 ? 1 : loop.step;
        const bool inside_range = step > 0 ? current_value <= loop.end : current_value >= loop.end;
        if(state && inside_range)
        {
            instance.current_index = current.nextIndex >= 0 && current.nextIndex < instance.active_count
                ? current.nextIndex : instance.active_count;
        }
        else
        {
            if(state) *state = -1;
            instance.current_index = current.falseIndex >= 0 && current.falseIndex < instance.active_count
                ? current.falseIndex : instance.active_count;
        }
        return;
    }

#endif
    if(command == "EVENT_BREAK")
    {
        if(current.loopIndex >= 0 && current.loopIndex < 16) instance.structured_loop_remaining[current.loopIndex] = -1;
        instance.current_index = current.nextIndex >= 0 && current.nextIndex < instance.active_count
            ? current.nextIndex : instance.active_count;
        return;
    }

    if(command == "EVENT_CONTINUE")
    {
        instance.current_index = current.nextIndex >= 0 && current.nextIndex < instance.active_count
            ? current.nextIndex : instance.active_count;
        return;
    }

    if(command == "EVENT_WAIT_FOR_BUTTON")
    {
        const ButtonWaitEventData* wait_button = static_cast<const ButtonWaitEventData*>(args);
        // Reassigning this branch's own button can cancel and reset instance.
        // Keep its scene stable while registering the replacement.
        const bn::string<64> binding_scene = instance.scene_id;
        if(wait_button) attach_button(binding_scene, instance.active_data, instance.active_count, current.falseIndex, current.nextIndex, *wait_button, instance.self_actor_id.empty() ? nullptr : instance.self_actor_id.data(), instance.local_owner);
        if(!instance.occupied) return;
        instance.current_index = current.nextIndex >= 0 && current.nextIndex < instance.active_count
            ? current.nextIndex : instance.active_count;
        return;
    }

    if(command == "EVENT_REMOVE_BUTTON_SCRIPT")
    {
        const ButtonScriptRemoveEventData* remove_button = static_cast<const ButtonScriptRemoveEventData*>(args);
        if(remove_button) remove_button_script(instance.scene_id, *remove_button);
        instance.current_index = current.nextIndex >= 0 && current.nextIndex < instance.active_count
            ? current.nextIndex : instance.active_count;
        return;
    }

    EventStatus status = EventStatus::running;
    bool finished = false;
    bool handled = true;
    if(command == "EVENT_RUN_BUTTON_ACTION") {
        const auto* action = static_cast<const ButtonActionEventData*>(args);
        status = action && queue_button_action(instance, *action) ? EventStatus::completed : EventStatus::failed;
    }
#if GBA_STUDIO_FEATURE_TRIGGERS
    else if(command == "EVENT_TRIGGER_SET_ENABLED") {
        const auto* trigger = static_cast<const TriggerEnabledEventData*>(args);
        status = trigger && GraphicsManager::instance().write_numeric_trigger_property(trigger->trigger_id, 4, trigger->enabled ? 1 : 0)
            ? EventStatus::completed : EventStatus::failed;
    }
#endif
    else if(command == "EVENT_FADE_IN" || command == "EVENT_FADE_OUT") status = FadeEventHandler::execute_status(command, args, instance.fade_state);
    else if(command == "EVENT_FADE_OPTIONS") finished = FadeOptionsEventHandler::execute(args);
#if GBA_STUDIO_FEATURE_WAIT
    else if(command == "EVENT_WAIT")
    {
        status = WaitEventHandler::execute_status(args, instance.wait_state);
    }
#endif
#if GBA_STUDIO_FEATURE_WAIT_INPUT
    else if(command == "EVENT_WAIT_INPUT")
    {
        status = WaitInputEventHandler::execute_status(args, instance.wait_input_state);
    }
#endif
    else if(command == "EVENT_PAUSE_UNTIL_BUTTON_PRESSED")
    {
        const ButtonPressWaitEventData* wait_button = static_cast<const ButtonPressWaitEventData*>(args);
        bool pressed = false;
        if(wait_button && wait_button->buttons)
            for(int index = 0; index < wait_button->buttons_count; ++index)
                if(wait_button->buttons[index] && InputManager::instance().binding_pressed(wait_button->buttons[index]))
                {
                    pressed = true;
                    break;
                }
        status = wait_button && wait_button->buttons && wait_button->buttons_count > 0
            ? (pressed ? EventStatus::completed : EventStatus::running)
            : EventStatus::failed;
    }
    else if(command == "EVENT_SHOW_EMOTE")
    {
        const ShowEmoteEventData* emote = static_cast<const ShowEmoteEventData*>(args);
        const char* actor_id = emote ? emote->actor_id : nullptr;
        if(actor_id && runtime_name_equal(actor_id, "__SELF__")) actor_id = instance.self_actor_id.data();
        status = emote && actor_id && actor_id[0] && GraphicsManager::instance().show_emote(actor_id, emote->emote_id, emote->distance)
            ? EventStatus::completed : EventStatus::failed;
    }
#if GBA_STUDIO_FEATURE_WAIT_SIGNAL
    else if(command == "EVENT_SHOOTER_WAIT_SIGNAL")
    {
        status = WaitSignalEventHandler::execute_status(args, instance.wait_signal_state);
    }
#endif
#if GBA_STUDIO_FEATURE_SCENE_CHANGE
    else if(command == "EVENT_CHANGE_SCENE") finished = ChangeSceneEventHandler::execute(args);
#endif
    else if(command == "EVENT_PAN_CAMERA" || command == "EVENT_CAMERA_MOVE_TO") status = CameraEventHandler::execute_status(args, instance.motion_state);
    else if(command == "EVENT_STOP_PHYSICS" || command == "EVENT_CONFIGURE_MOVEMENT" || command == "EVENT_APPLY_VERTICAL_IMPULSE" || command == "EVENT_PHYSICS_SET_GRAVITY" || command == "EVENT_PHYSICS_SET_JUMP_SPEED" || command == "EVENT_PHYSICS_SET_MAX_FALL_SPEED" || command == "EVENT_PHYSICS_SET_AIR_JUMPS" || command == "EVENT_PHYSICS_SET_DIAGONAL" || command == "EVENT_PHYSICS_RESET") status = PhysicsEventHandler::execute_status(command, args, instance.self_actor_id.data());
    else if(command == "EVENT_CAMERA_STOP_FOLLOW") finished = CameraEventHandler::stop_follow();
    else if(command == "EVENT_CAMERA_FOLLOW") {
        if(args) {
            auto data = actor_event_args<CameraFollowEventData>(args, instance.self_actor_id.data());
            finished = CameraEventHandler::follow(data);
        }
    }
    else if(command == "EVENT_CAMERA_SHAKE") finished = CameraEventHandler::shake(args);
    else if(command == "EVENT_INPUT_ENABLE" || command == "EVENT_INPUT_DISABLE") finished = InputEventHandler::group(args);
#if GBA_STUDIO_FEATURE_LAYERS
    else if(command == "EVENT_CHANGE_LAYER") finished = ChangeLayerEventHandler::execute(args, instance.scene_id);
    else if(command == "EVENT_CHANGE_DEFAULT_PALETTES") { if(args) GraphicsManager::instance().change_default_palettes(static_cast<const DefaultPalettesEventData*>(args)->palette_ids); finished = true; }
    else if(command == "EVENT_CHANGE_PALETTE_BACKGROUND") finished = ChangePaletteBackgroundEventHandler::execute(args, instance.scene_id);
    else if(command == "EVENT_VISIBLE_BACKGROUND") finished = run_visible_background(args, instance.scene_id);
    else if(command == "EVENT_BACKGROUND_SCROLL") finished = run_background_scroll(args, instance.scene_id);
#if GBA_STUDIO_FEATURE_BACKGROUND_ANIMATION
    else if(command == "EVENT_BACKGROUND_ANIMATE") status = run_background_animation(args) ? EventStatus::completed : EventStatus::failed;
#endif
#if GBA_STUDIO_FEATURE_BACKGROUND_TRANSFORM
    else if(command == "EVENT_BACKGROUND_SET_SCALE" || command == "EVENT_BACKGROUND_SET_ROTATION" || command == "EVENT_BACKGROUND_SET_SHEAR")
        status = run_background_transform(args, command == "EVENT_BACKGROUND_SET_SCALE" ? 0 : command == "EVENT_BACKGROUND_SET_ROTATION" ? 1 : 2) ? EventStatus::completed : EventStatus::failed;
#endif
    else if(command == "EVENT_BACKGROUND_SET_PARALLAX") finished = run_background_parallax(args, instance.scene_id);
#endif
#if GBA_STUDIO_FEATURE_ACTORS
    else if(command == "EVENT_MOVE_ACTOR" || command == "EVENT_ACTOR_MOVE_TO" || command == "EVENT_ACTOR_SET_POSITION") status = ActorEventHandler::move_status(args, instance.motion_state, instance.self_actor_id.data());
    else if(command == "EVENT_ACTOR_SET_DIRECTION") {
        const auto data = actor_event_args<ActorDirectionEventData>(args, instance.self_actor_id.data());
        status = args && GraphicsManager::instance().write_numeric_actor_property(data.actor_id, 2, data.direction)
            ? EventStatus::completed : EventStatus::failed;
    }
    else if(command == "EVENT_ACTOR_SET_STATE") {
        const auto data = actor_event_args<ActorStateEventData>(args, instance.self_actor_id.data());
        status = ActorEventHandler::state(&data) ? EventStatus::completed : EventStatus::failed;
    }
    else if(command == "EVENT_SPAWN_ACTOR" || command == "EVENT_ACTOR_SPAWN") status = ActorEventHandler::spawn(args) ? EventStatus::completed : EventStatus::failed;
    else if(command == "EVENT_REMOVE_ACTOR" || command == "EVENT_ACTOR_DESPAWN") {
        const auto data = actor_event_args<ActorRemoveEventData>(args, instance.self_actor_id.data());
        status = ActorEventHandler::remove(&data) ? EventStatus::completed : EventStatus::failed;
    }
    else if(command == "EVENT_VISIBLE_ACTOR" || command == "EVENT_ACTOR_SET_VISIBLE" || command == "EVENT_HIDE_ACTOR" || command == "EVENT_SHOW_ACTOR")
    {
        auto data = actor_event_args<ActorVisibilityEventData>(args, instance.self_actor_id.data());
        if(command == "EVENT_SHOW_ACTOR" || command == "EVENT_HIDE_ACTOR") data.visible = command == "EVENT_SHOW_ACTOR";
        if(data.actor_id) GraphicsManager::instance().set_actor_visible(data.actor_id, data.visible);
        finished = true;
    }
#endif
    else if(command == "EVENT_HIDE_ALL_SPRITES") finished = GraphicsManager::instance().set_all_actors_visible(false);
    else if(command == "EVENT_SHOW_ALL_SPRITES") finished = GraphicsManager::instance().set_all_actors_visible(true);
#if GBA_STUDIO_FEATURE_ACTORS
    else if(command == "EVENT_SET_ANIMATION_SPEED") {
        const auto data = actor_event_args<ActorAnimationSpeedEventData>(args, instance.self_actor_id.data());
        finished = ActorEventHandler::animation_speed(&data);
    }
    else if(command == "EVENT_ACTOR_SET_ANIMATION") {
        const auto data = actor_event_args<ActorAnimationControlEventData>(args, instance.self_actor_id.data());
        finished = ActorEventHandler::animation(&data);
    }
    else if(command == "EVENT_SET_ACTOR_PRIORITY") {
        const auto data = actor_event_args<ActorPriorityEventData>(args, instance.self_actor_id.data());
        finished = ActorEventHandler::priority(&data);
    }
#endif
#if GBA_STUDIO_FEATURE_AUDIO
    else if(command == "EVENT_PLAY_MUSIC") finished = AudioEventHandler::play_music(args);
    else if(command == "EVENT_MUSIC_PLAY_JINGLE") finished = AudioEventHandler::play_jingle(args);
    else if(command == "EVENT_PLAY_SOUND") finished = AudioEventHandler::play_sound(args);
#endif
#if GBA_STUDIO_FEATURE_RUMBLE
    else if(command == "EVENT_RUMBLE") finished = RumbleEventHandler::execute(args);
#endif
#if GBA_STUDIO_FEATURE_AUDIO
    else if(command == "EVENT_SOUND_STOP") finished = AudioEventHandler::stop_sound(args);
    else if(command == "EVENT_STOP_MUSIC" || command == "EVENT_MUSIC_STOP") finished = AudioEventHandler::stop_music(args);
    else if(command == "EVENT_SET_MUSIC_VOLUME") finished = AudioEventHandler::set_volume(args);
    else if(command == "EVENT_MUSIC_RESUME") finished = AudioEventHandler::resume_music(args);
    else if(command == "EVENT_MUSIC_PAUSE") finished = AudioEventHandler::pause_music(args);
    else if(command == "EVENT_MUSIC_FADE") finished = AudioEventHandler::fade_music(args);
#endif
#if GBA_STUDIO_FEATURE_SHOOTER
    else if(command == "EVENT_SHOOTER_START" || command == "EVENT_SHOOTER_SPAWN_WAVE") finished = ShooterEventHandler::start(args);
    else if(command == "EVENT_SHOOTER_LOAD_STAGE") finished = ShooterEventHandler::load_stage(args);
    else if(command == "EVENT_SHOOTER_SET_BACKGROUND_MODE") finished = ShooterEventHandler::set_background_mode(args);
    else if(command == "EVENT_SHOOTER_PAUSE") finished = ShooterEventHandler::pause(args);
    else if(command == "EVENT_SHOOTER_STOP") finished = ShooterEventHandler::stop(args);
    else if(command == "EVENT_SHOOTER_CLEAR_ENEMIES") finished = ShooterEventHandler::clear_enemies(args);
    else if(command == "EVENT_SHOOTER_SPAWN_BOSS") finished = ShooterEventHandler::spawn_boss(args);
    else if(command == "EVENT_SHOOTER_SET_BOSS_PHASE") finished = ShooterEventHandler::boss_phase(args);
    else if(command == "EVENT_SHOOTER_SET_STAT" || command == "EVENT_SHOOTER_ADD_STAT") finished = ShooterEventHandler::stat(args);
    else if(command == "EVENT_SHOOTER_GRANT") finished = ShooterEventHandler::grant(args);
#endif
#if GBA_STUDIO_FEATURE_SAVE
    else if(command == "EVENT_VARIABLES_SAVE" || command == "EVENT_VARIABLES_LOAD") {
        const auto* data = static_cast<const VariablesSaveEventData*>(args);
        auto& manager = SaveManager::instance();
        const bool success = data && (command == "EVENT_VARIABLES_SAVE"
            ? manager.save_variables(data->slot, data->variable_ids, data->variables_count, data->all_variables)
            : manager.load_variables(data->slot, data->variable_ids, data->variables_count, data->all_variables));
        status = success ? EventStatus::completed : EventStatus::failed;
    }
    else if(command == "EVENT_SAVE_WRITE" || command == "EVENT_SAVE_LOAD" || command == "EVENT_SAVE_REMOVE") {
        const auto* save = static_cast<const GameDataEventData*>(args);
        auto& manager = SaveManager::instance();
        const bool success = save && (command == "EVENT_SAVE_WRITE" ? manager.save_game(save->slot, save->point, instance.self_actor_id.empty() ? 0 : game_save_key(instance.self_actor_id.data()))
            : command == "EVENT_SAVE_LOAD" ? manager.load_game(save->slot) : manager.remove_game(save->slot));
        if((command == "EVENT_SAVE_WRITE" || command == "EVENT_SAVE_LOAD") && !success) {
            BN_LOG("Game Data Save/Load: failed or save slot capacity exceeded");
            instance.current_index = current.loopIndex >= 0 ? current.loopIndex : instance.active_count;
            return;
        }
        if(success && command == "EVENT_SAVE_LOAD") {
            InputManager::instance().clear_overrides();
            for(auto& binding : button_bindings) binding = ButtonBinding();
            for(auto& other : instances) if(&other != &instance) other = ScriptInstance();
            const auto* restored = GraphicsManager::instance().getScene();
            instance.scene_id = restored->id; instance.root_data = nullptr; instance.detached = true; instance.local_owner = 0;
            if(restored->onInitScripts && restored->onInitCount) {
                auto* initialization = find_or_create(restored->id, restored->onInitScripts, nullptr);
                if(initialization) initialization->completed = true;
            }
            const auto* point = !save->local_actions ? get_game_save_point(manager.loaded_save_point) : nullptr;
            if(point && point->on_load >= 0 && instance.continuations.size() < instance.continuations.max_size()) {
                ScriptInstance::Continuation continuation{instance.active_data, instance.active_count,
                    current.nextIndex >= 0 ? current.nextIndex : instance.active_count, instance.structured_loop_remaining};
                continuation.self_actor_id = instance.self_actor_id;
                const char* saved_self = manager.loaded_self_actor ? GraphicsManager::instance().game_actor_id(manager.loaded_self_actor) : nullptr;
                instance.self_actor_id = saved_self ? saved_self : "";
#if GBA_STUDIO_FEATURE_SCRIPT_INPUTS
                continuation.parameter_start = instance.parameter_scope.start;
                continuation.parameter_used = instance.parameter_scope.used;
#endif
                instance.continuations.push_back(continuation);
                instance.active_data = point->program; instance.active_count = point->count; instance.current_index = point->on_load;
                for(int8_t& value : instance.structured_loop_remaining) value = -1;
                return;
            } else if(point && point->on_load >= 0) { status = EventStatus::failed; }
        }
        if(status != EventStatus::failed) status = success ? EventStatus::completed : EventStatus::failed;
    }
    else if(command == "EVENT_SAVE_ON_LOAD") {
        // Legacy projects may still contain this event after Game Data Load.
        // Loading already executed the callback; never run it a second time.
        finished = true;
    }
#endif
#if GBA_STUDIO_FEATURE_HBE
    else if(command == "EVENT_HBE_EFFECT_ENABLE" || command == "EVENT_HBE_EFFECT_DISABLE") finished = HbeEventHandler::execute(args);
#endif
    else if(command == "EVENT_BLEND_ALPHA") finished = BlendEventHandler::set_alpha(args);
#if GBA_STUDIO_FEATURE_SHOOTER
    else if(command == "EVENT_SHOOTER_SET_PLAYER_ENABLED") finished = ShooterEventHandler::set_player_enabled(args);
#endif
#if GBA_STUDIO_FEATURE_DIALOGUE
    else if(command == "EVENT_DIALOGUE_SHOW") finished = DialogueEventHandler::show(args);
    else if(command == "EVENT_DISPLAY_DIALOGUE" || command == "EVENT_TEXT_SCROLL") finished = DialogueEventHandler::display(args);
    else if(command == "EVENT_DISPLAY_VARIABLE_TEXT") finished = VariableTextEventHandler::display(args);
#if GBA_STUDIO_FEATURE_UI
    else if(command == "EVENT_UI_SET_TEXT") finished = UiEventHandler::set_text(args);
    else if(command == "EVENT_UI_SET_VALUE") finished = UiEventHandler::set_value(args);
#if GBA_STUDIO_FEATURE_UI_ANIMATION
    else if(command == "EVENT_UI_ANIMATE")
    {
        const UiAnimateEventData* ui = static_cast<const UiAnimateEventData*>(args);
        if(ui) BN_LOG("[UI Dispatch] id=", ui->ui_id, " type=", ui->animation, " target=", ui->x, ",", ui->y, " speed_units=", ui->speed_units, " duration=", ui->duration_frames);
        finished = UiEventHandler::animate(args);
        BN_LOG("[UI Dispatch] handler result=", finished);
    }
#endif
    else if(command == "EVENT_UI_DESTROY") status = UiEventHandler::destroy(args) ? EventStatus::completed : EventStatus::failed;
    else if(command == "EVENT_UI_HIDE") status = UiEventHandler::hide(args) ? EventStatus::completed : EventStatus::failed;
    else if(command == "EVENT_UI_SHOW") status = UiEventHandler::show(args) ? EventStatus::completed : EventStatus::failed;
#if GBA_STUDIO_FEATURE_UI_ANIMATION
    else if(command == "EVENT_UI_ANIMATION_STOP") finished = UiEventHandler::stop_animation(args);
#endif
#endif
#endif
#if GBA_STUDIO_FEATURE_SPRITE_EFFECTS
    else if(command == "EVENT_ACTOR_SET_TINT" || command == "EVENT_ACTOR_SET_SATURATION" || command == "EVENT_ACTOR_SET_BRIGHTNESS" || command == "EVENT_ACTOR_SET_OPACITY") {
        const auto effect = actor_event_args<ActorVisualEventData>(args, instance.self_actor_id.data());
        status = args && (command == "EVENT_ACTOR_SET_TINT"
            ? GraphicsManager::instance().set_actor_transform(effect.actor_id, 2, effect.value, effect.duration_frames, effect.color)
            : GraphicsManager::instance().set_actor_visual_effect(effect.actor_id,
            command == "EVENT_ACTOR_SET_TINT" ? 0 : command == "EVENT_ACTOR_SET_SATURATION" ? 1 : command == "EVENT_ACTOR_SET_BRIGHTNESS" ? 2 : 3,
            effect.value, effect.color)) ? EventStatus::completed : EventStatus::failed;
    }
    else if(command == "EVENT_ACTOR_SET_ROTATION" || command == "EVENT_ACTOR_SET_SCALE") {
        const auto effect = actor_event_args<ActorTransformEventData>(args, instance.self_actor_id.data());
        status = args && GraphicsManager::instance().set_actor_transform(effect.actor_id,
            command == "EVENT_ACTOR_SET_ROTATION" ? 0 : 1, effect.value, effect.duration_frames)
            ? EventStatus::completed : EventStatus::failed;
    }
    else if(command == "EVENT_SPRITE_EFFECT") {
        const auto effect = actor_event_args<SpriteEffectEventData>(args, instance.self_actor_id.data());
        finished = args && SpriteEventHandler::effect(effect);
    }
#endif
#if GBA_STUDIO_FEATURE_DIALOGUE
    else if(command == "EVENT_HIDE_DIALOGUE" || command == "EVENT_DIALOGUE_CLOSE") finished = DialogueEventHandler::hide(args);
#if GBA_STUDIO_FEATURE_CHOICES
    else if(command == "EVENT_DIALOGUE_CHOICE" || command == "EVENT_MENU_OPEN") finished = DialogueEventHandler::choice(args);
#endif
#endif
#if GBA_STUDIO_FEATURE_VARIABLES
    else if(command == "EVENT_LOCAL_VARIABLE_RESET") status = VariableManager::instance().reset_local() ? EventStatus::completed : EventStatus::failed;
    else if(command == "EVENT_VARIABLE" || command == "EVENT_VARIABLE_RESET_ALL") status = VariableEventHandler::execute(command, args) ? EventStatus::completed : EventStatus::failed;
#endif
    else if(command == "EVENT_CALL_SCRIPT")
    {
        const auto* call = static_cast<const CallScriptEventData*>(args);
        const char* called_script_id = call ? call->script_id : nullptr;
        const ScriptDefinition* called_script = nullptr;
        for(int index = 0; called_script_id && index < SCRIPT_DEFINITIONS_COUNT; ++index)
        {
            if(runtime_name_equal(SCRIPT_DEFINITIONS[index].id, called_script_id))
            {
                called_script = &SCRIPT_DEFINITIONS[index];
                break;
            }
        }
        if(called_script && called_script->commands_count > 0 && instance.continuations.size() < instance.continuations.max_size())
        {
            const int next_index = current.nextIndex >= 0 && current.nextIndex < instance.active_count ? current.nextIndex : instance.active_count;
            ScriptInstance::Continuation continuation{ instance.active_data, instance.active_count, next_index,
                                                       instance.structured_loop_remaining };
            continuation.self_actor_id = instance.self_actor_id;
#if GBA_STUDIO_FEATURE_SCRIPT_INPUTS
            continuation.parameter_start = instance.parameter_scope.start;
            continuation.parameter_used = instance.parameter_scope.used;
            if(!VariableManager::instance().enter_call(*called_script, *call)) {
                BN_LOG("ScriptScheduler: invalid script inputs or parameter capacity exhausted");
                instance.completed = true;
                return;
            }
#else
            if(called_script->parameters_count || call->arguments_count) {
                BN_LOG("ScriptScheduler: parameters require variable support");
                instance.completed = true;
                return;
            }
#endif
            instance.continuations.push_back(continuation);
            for(int8_t& value : instance.structured_loop_remaining) value = -1;
            instance.active_data = called_script->commands;
            instance.active_count = called_script->commands_count;
            instance.current_index = 0;
            return;
        }
        if(called_script && called_script->commands_count == 0 && call->arguments_count == called_script->parameters_count) finished = true;
        else {
            BN_LOG("ScriptScheduler: called script not found or stack full");
            status = EventStatus::failed;
        }
    }
    else
    {
        BN_LOG("ScriptScheduler: unknown event command");
        handled = false;
    }

    if(command == "EVENT_CHANGE_LAYER" || command == "EVENT_UI_ANIMATE")
    {
        BN_LOG("[ScriptScheduler] command=", command.data(), " index=", instance.current_index,
               " next=", current.nextIndex, " handled=", handled, " finished=", finished);
    }

    RuntimeMonitor::sample();
    if(status == EventStatus::failed)
    {
        BN_LOG("ScriptScheduler: event failed");
        handled = false;
    }
    else if(status == EventStatus::completed)
    {
        finished = true;
    }

    if(execution_serial != cancellation_serial) return;
    if(finished || !handled)
    {
#if GBA_STUDIO_FEATURE_NUMERIC
        instance.numeric_cache.reset();
#endif
        instance.current_index = current.nextIndex >= 0 && current.nextIndex < instance.active_count
            ? current.nextIndex : instance.active_count;
    }
}
