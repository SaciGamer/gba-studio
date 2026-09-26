#include "script_command_manager.h"
#include "script_event_handlers.h"
#include "event_change_layer.h"
#include "resources.h"
#include "bn_log.h"
#include "input_manager.h"
#include "variable_manager.h"
#include "graphics_manager.h"

ScriptCommand::ScriptCommand() = default;
ScriptCommand::~ScriptCommand() = default;

ScriptCommand::ScriptInstance* ScriptCommand::find_or_create(
    const bn::string<64>& scene_id_param, const ScriptCommandData* data)
{
    for(ScriptInstance& instance : instances)
    {
        if(instance.occupied && instance.scene_id == scene_id_param && instance.root_data == data)
        {
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
            instance.active_data = data;
            return &instance;
        }
    }
    BN_LOG("ScriptScheduler: instance capacity exhausted");
    return nullptr;
}

void ScriptCommand::resetIndex()
{
    InputManager::instance().clear_overrides();
    for(ButtonBinding& binding : button_bindings) binding = ButtonBinding();
    for(ScriptInstance& instance : instances) instance = ScriptInstance();
}

void ScriptCommand::cancel_scene(const bn::string<64>& scene_id_param)
{
    InputManager::instance().clear_overrides();
    for(ButtonBinding& binding : button_bindings)
        if(binding.occupied && binding.scene_id == scene_id_param) binding = ButtonBinding();
    for(ScriptInstance& instance : instances)
    {
        if(instance.occupied && instance.scene_id == scene_id_param)
        {
            instance = ScriptInstance();
        }
    }
}

void ScriptCommand::attach_button(const bn::string<64>& scene_id_param,
                                  const ScriptCommandData* data,
                                  int count,
                                  int branch_index,
                                  int continuation_index,
                                  const ButtonWaitEventData& event)
{
    for(ButtonBinding& binding : button_bindings)
    {
        if(binding.occupied && binding.scene_id == scene_id_param && binding.data == data) return;
    }
    for(ButtonBinding& binding : button_bindings)
    {
        if(!binding.occupied)
        {
            binding = ButtonBinding();
            binding.occupied = true;
            binding.scene_id = scene_id_param;
            binding.data = data;
            binding.count = count;
            binding.branch_index = branch_index;
            binding.continuation_index = continuation_index;
            binding.buttons = event.buttons;
            binding.buttons_count = event.buttons_count;
            binding.override_button = event.override_button;
            if(binding.override_button && binding.buttons)
                for(int index = 0; index < binding.buttons_count; ++index) InputManager::instance().set_override(binding.buttons[index], true);
            return;
        }
    }
    BN_LOG("ScriptScheduler: button binding capacity exhausted");
}

void ScriptCommand::update_button_bindings(const bn::string<64>& scene_id_param)
{
    for(ButtonBinding& binding : button_bindings)
    {
        if(!binding.occupied || binding.scene_id != scene_id_param) continue;
        if(binding.override_button && binding.buttons)
            for(int index = 0; index < binding.buttons_count; ++index) InputManager::instance().set_override(binding.buttons[index], true);

        if(!binding.running_instance)
        {
            bool pressed = false;
            if(binding.buttons)
                for(int index = 0; index < binding.buttons_count; ++index)
                    if(binding.buttons[index] && InputManager::instance().pressed(binding.buttons[index]))
                    {
                        pressed = true;
                        break;
                    }
            if(!pressed) continue;
            for(ScriptInstance& instance : instances)
            {
                if(!instance.occupied)
                {
                    instance = ScriptInstance();
                    instance.occupied = true;
                    instance.scene_id = scene_id_param;
                    instance.root_data = binding.data + binding.branch_index;
                    instance.active_data = binding.data;
                    instance.active_count = binding.count;
                    instance.current_index = binding.branch_index;
                    instance.stop_index = binding.continuation_index;
                    binding.running_instance = &instance;
                    break;
                }
            }
        }

        if(binding.running_instance)
        {
            ScriptInstance& instance = *binding.running_instance;
            for(int step = 0; step < 16 && !instance.completed; ++step)
            {
                const int previous_index = instance.current_index;
                execute_instance(instance);
                if(previous_index == instance.current_index && !instance.completed) break;
            }
            if(instance.completed)
            {
                instance.occupied = false;
                binding.running_instance = nullptr;
            }
        }
    }
}

bool ScriptCommand::execute(bn::string<64> scene_id_param,
                            const ScriptCommandData* data, int count)
{
    if(!data || count <= 0) return true;
    ScriptInstance* instance = find_or_create(scene_id_param, data);
    if(!instance) return false;
    if(instance->completed) return true;
    if(instance->active_count == 0) instance->active_count = count;

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
        if(instance->active_data == previous_data && instance->current_index == previous_index)
        {
            break;
        }
    }
    return instance->completed;
}

void ScriptCommand::restart(bn::string<64> scene_id_param, const ScriptCommandData* data)
{
    if(!data) return;
    for(ScriptInstance& instance : instances)
    {
        if(instance.occupied && instance.scene_id == scene_id_param && instance.root_data == data)
        {
            instance = ScriptInstance();
            return;
        }
    }
}

void ScriptCommand::execute_instance(ScriptInstance& instance)
{
    if(instance.stop_index >= 0 && instance.current_index == instance.stop_index)
    {
        instance.completed = true;
        return;
    }
    if(instance.current_index >= instance.active_count)
    {
        if(!instance.continuations.empty())
        {
            const ScriptInstance::Continuation continuation = instance.continuations.back();
            instance.continuations.pop_back();
            instance.active_data = continuation.data;
            instance.active_count = continuation.count;
            instance.current_index = continuation.index;
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
    if(command == "EVENT_IF" || command == "EVENT_WHILE")
    {
        const bool result = args && IfEventHandler::evaluate(*static_cast<const ScriptConditionData*>(args));
        const int next_index = result ? current.nextIndex : current.falseIndex;
        instance.current_index = next_index >= 0 && next_index < instance.active_count
            ? next_index : instance.active_count;
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

    if(command == "EVENT_FOR")
    {
        const ForEventData& loop = args ? *static_cast<const ForEventData*>(args) : ForEventData{ nullptr, 0, 0, 1 };
        const int slot = current.loopIndex;
        int* state = slot >= 0 && slot < 16 ? &instance.structured_loop_remaining[slot] : nullptr;
        if(state && *state < 0)
        {
            *state = 0;
            if(loop.variable_id && loop.variable_id[0] != '\0') VariableManager::instance().set_number(loop.variable_id, loop.start);
        }
        const int current_value = loop.variable_id && loop.variable_id[0] != '\0'
            ? VariableManager::instance().get_number(loop.variable_id)
            : loop.start;
        const int step = loop.step == 0 ? 1 : loop.step;
        const bool inside_range = step > 0 ? current_value <= loop.end : current_value >= loop.end;
        if(state && inside_range)
        {
            if(loop.variable_id && loop.variable_id[0] != '\0') VariableManager::instance().set_number(loop.variable_id, current_value + step);
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
        if(wait_button) attach_button(instance.scene_id, instance.active_data, instance.active_count, current.falseIndex, current.nextIndex, *wait_button);
        instance.current_index = current.nextIndex >= 0 && current.nextIndex < instance.active_count
            ? current.nextIndex : instance.active_count;
        return;
    }

    EventStatus status = EventStatus::running;
    bool finished = false;
    bool handled = true;
    if(command == "EVENT_FADE_IN" || command == "EVENT_FADE_OUT") status = FadeEventHandler::execute_status(command, args, instance.fade_state);
    else if(command == "EVENT_FADE_OPTIONS") finished = FadeOptionsEventHandler::execute(args);
    else if(command == "EVENT_WAIT")
    {
        status = WaitEventHandler::execute_status(args, instance.wait_state);
    }
    else if(command == "EVENT_CHANGE_SCENE") finished = ChangeSceneEventHandler::execute(args);
    else if(command == "EVENT_PAN_CAMERA") finished = CameraEventHandler::execute(args);
    else if(command == "EVENT_CHANGE_LAYER") finished = ChangeLayerEventHandler::execute(args, instance.scene_id);
    else if(command == "EVENT_CHANGE_PALETTE_BACKGROUND") finished = ChangePaletteBackgroundEventHandler::execute(args, instance.scene_id);
    else if(command == "EVENT_VISIBLE_BACKGROUND") finished = run_visible_background(args, instance.scene_id);
    else if(command == "EVENT_MOVE_ACTOR") finished = ActorEventHandler::move(args);
    else if(command == "EVENT_SPAWN_ACTOR") finished = ActorEventHandler::spawn(args);
    else if(command == "EVENT_REMOVE_ACTOR") finished = ActorEventHandler::remove(args);
    else if(command == "EVENT_VISIBLE_ACTOR" || command == "EVENT_HIDE_ACTOR" || command == "EVENT_SHOW_ACTOR")
    {
        if(command == "EVENT_VISIBLE_ACTOR") finished = ActorEventHandler::visible(args);
        else
        {
            // A missing player sprite is a valid no-op for visibility events;
            // never let an unavailable Player actor block the script.
            if(args) GraphicsManager::instance().set_actor_visible(static_cast<const ActorVisibilityEventData*>(args)->actor_id, command == "EVENT_SHOW_ACTOR");
            finished = true;
        }
    }
    else if(command == "EVENT_HIDE_ALL_SPRITES") finished = GraphicsManager::instance().set_all_actors_visible(false);
    else if(command == "EVENT_SHOW_ALL_SPRITES") finished = GraphicsManager::instance().set_all_actors_visible(true);
    else if(command == "EVENT_SET_ANIMATION_SPEED") finished = ActorEventHandler::animation_speed(args);
    else if(command == "EVENT_SET_ACTOR_PRIORITY") finished = ActorEventHandler::priority(args);
    else if(command == "EVENT_PLAY_MUSIC") finished = AudioEventHandler::play_music(args);
    else if(command == "EVENT_PLAY_SOUND") finished = AudioEventHandler::play_sound(args);
    else if(command == "EVENT_STOP_MUSIC") finished = AudioEventHandler::stop_music(args);
    else if(command == "EVENT_SET_MUSIC_VOLUME") finished = AudioEventHandler::set_volume(args);
    else if(command == "EVENT_DISPLAY_DIALOGUE") finished = DialogueEventHandler::display(args);
    else if(command == "EVENT_DISPLAY_VARIABLE_TEXT") finished = VariableTextEventHandler::display(args);
    else if(command == "EVENT_HIDE_DIALOGUE") finished = DialogueEventHandler::hide(args);
    else if(command == "EVENT_DIALOGUE_CHOICE") finished = DialogueEventHandler::choice(args);
    else if(command == "EVENT_VARIABLE" || command == "EVENT_VARIABLE_RESET_ALL") finished = VariableEventHandler::execute(command, args);
    else if(command == "EVENT_CALL_SCRIPT")
    {
        const char* called_script_id = args ? *static_cast<const char* const*>(args) : nullptr;
        const ScriptDefinition* called_script = nullptr;
        for(int index = 0; called_script_id && index < SCRIPT_DEFINITIONS_COUNT; ++index)
        {
            if(bn::string<64>(SCRIPT_DEFINITIONS[index].id) == called_script_id)
            {
                called_script = &SCRIPT_DEFINITIONS[index];
                break;
            }
        }
        if(called_script && called_script->commands_count > 0 && instance.continuations.size() < instance.continuations.max_size())
        {
            const int next_index = current.nextIndex >= 0 && current.nextIndex < instance.active_count ? current.nextIndex : instance.active_count;
            instance.continuations.push_back({ instance.active_data, instance.active_count, next_index });
            instance.active_data = called_script->commands;
            instance.active_count = called_script->commands_count;
            instance.current_index = 0;
            return;
        }
        BN_LOG("ScriptScheduler: called script not found or stack full");
        finished = true;
    }
    else
    {
        BN_LOG("ScriptScheduler: unknown event command");
        handled = false;
    }

    if(status == EventStatus::failed)
    {
        BN_LOG("ScriptScheduler: event failed");
        handled = false;
    }
    else if(status == EventStatus::completed)
    {
        finished = true;
    }

    if(finished || !handled)
    {
        instance.current_index = current.nextIndex >= 0 && current.nextIndex < instance.active_count
            ? current.nextIndex : instance.active_count;
    }
}
