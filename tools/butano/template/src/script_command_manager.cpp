#include "runtime_monitor.h"
#include "script_command_manager.h"
#include "script_event_handlers.h"
#include "event_change_layer.h"
#include "resources.h"
#include "bn_log.h"
#include "input_manager.h"
#include "variable_manager.h"
#include "graphics_manager.h"
#include "actor_motion_manager.h"

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
    ActorMotionManager::instance().cancel();
    ++cancellation_serial;
    InputManager::instance().clear_overrides();
    for(ButtonBinding& binding : button_bindings) binding = ButtonBinding();
    for(ScriptInstance& instance : instances) instance = ScriptInstance();
}

void ScriptCommand::cancel_scene(const bn::string<64>& scene_id_param)
{
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
            ActorMotionManager::instance().cancel(&instance.motion_state);
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
        if(binding.occupied && binding.scene_id == scene_id_param && binding.data == data &&
           binding.branch_index == branch_index && binding.continuation_index == continuation_index) return;
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
            BN_LOG("[Attach Script] registered scene=", scene_id_param.data(), " branch=", branch_index,
                   " override=", binding.override_button);
            if(binding.override_button && binding.buttons)
                for(int index = 0; index < binding.buttons_count; ++index) InputManager::instance().set_override(binding.buttons[index], true);
            return;
        }
    }
    BN_LOG("ScriptScheduler: button binding capacity exhausted");
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
        if(command && bn::string<64>(command) == "EVENT_CHANGE_SCENE") return true;
    }
    return false;
}

void ScriptCommand::update_button_bindings(const bn::string<64>& scene_id_param, bool allow_new_bindings)
{
    for(ButtonBinding& binding : button_bindings)
    {
        if(!binding.occupied || binding.scene_id != scene_id_param) continue;
        if(binding.override_button && binding.buttons)
            for(int index = 0; index < binding.buttons_count; ++index) InputManager::instance().set_override(binding.buttons[index], true);

        if(!binding.running_instance)
        {
            if(!allow_new_bindings) continue;
            bool pressed = false;
            if(binding.buttons)
                for(int index = 0; index < binding.buttons_count; ++index)
                    if(binding.buttons[index] && InputManager::instance().binding_pressed(binding.buttons[index]))
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

void ScriptCommand::restart(bn::string<64> scene_id_param, const ScriptCommandData* data)
{
    if(!data) return;
    for(ScriptInstance& instance : instances)
    {
        if(instance.occupied && instance.scene_id == scene_id_param && instance.root_data == data)
        {
            ActorMotionManager::instance().cancel(&instance.motion_state);
            instance = ScriptInstance();
            return;
        }
    }
}

void ScriptCommand::execute_instance(ScriptInstance& instance)
{
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

    if(command == "EVENT_IF" || command == "EVENT_WHILE")
    {
        instance.numeric_cache.reset();
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
    else if(command == "EVENT_WAIT_INPUT")
    {
        status = WaitInputEventHandler::execute_status(args, instance.wait_input_state);
    }
    else if(command == "EVENT_SHOOTER_WAIT_SIGNAL")
    {
        status = WaitSignalEventHandler::execute_status(args, instance.wait_signal_state);
    }
    else if(command == "EVENT_CHANGE_SCENE") finished = ChangeSceneEventHandler::execute(args);
    else if(command == "EVENT_PAN_CAMERA" || command == "EVENT_CAMERA_MOVE_TO") status = CameraEventHandler::execute_status(args, instance.motion_state);
    else if(command == "EVENT_CAMERA_FOLLOW") finished = CameraEventHandler::follow(args);
    else if(command == "EVENT_CAMERA_SHAKE") finished = CameraEventHandler::shake(args);
    else if(command == "EVENT_INPUT_ENABLE" || command == "EVENT_INPUT_DISABLE") finished = InputEventHandler::group(args);
    else if(command == "EVENT_CHANGE_LAYER") finished = ChangeLayerEventHandler::execute(args, instance.scene_id);
    else if(command == "EVENT_CHANGE_PALETTE_BACKGROUND") finished = ChangePaletteBackgroundEventHandler::execute(args, instance.scene_id);
    else if(command == "EVENT_VISIBLE_BACKGROUND") finished = run_visible_background(args, instance.scene_id);
    else if(command == "EVENT_BACKGROUND_SCROLL") finished = run_background_scroll(args, instance.scene_id);
    else if(command == "EVENT_BACKGROUND_SET_PARALLAX") finished = run_background_parallax(args, instance.scene_id);
    else if(command == "EVENT_MOVE_ACTOR" || command == "EVENT_ACTOR_MOVE_TO" || command == "EVENT_ACTOR_SET_POSITION") status = ActorEventHandler::move_status(args, instance.motion_state);
    else if(command == "EVENT_ACTOR_SET_STATE") status = ActorEventHandler::state(args) ? EventStatus::completed : EventStatus::failed;
    else if(command == "EVENT_SPAWN_ACTOR" || command == "EVENT_ACTOR_SPAWN") finished = ActorEventHandler::spawn(args);
    else if(command == "EVENT_REMOVE_ACTOR" || command == "EVENT_ACTOR_DESPAWN") finished = ActorEventHandler::remove(args);
    else if(command == "EVENT_VISIBLE_ACTOR" || command == "EVENT_ACTOR_SET_VISIBLE" || command == "EVENT_HIDE_ACTOR" || command == "EVENT_SHOW_ACTOR")
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
    else if(command == "EVENT_SET_ANIMATION_SPEED" || command == "EVENT_ACTOR_SET_ANIMATION") finished = ActorEventHandler::animation_speed(args);
    else if(command == "EVENT_SET_ACTOR_PRIORITY") finished = ActorEventHandler::priority(args);
    else if(command == "EVENT_PLAY_MUSIC") finished = AudioEventHandler::play_music(args);
    else if(command == "EVENT_MUSIC_PLAY_JINGLE") finished = AudioEventHandler::play_jingle(args);
    else if(command == "EVENT_PLAY_SOUND") finished = AudioEventHandler::play_sound(args);
    else if(command == "EVENT_RUMBLE") finished = RumbleEventHandler::execute(args);
    else if(command == "EVENT_SOUND_STOP") finished = AudioEventHandler::stop_sound(args);
    else if(command == "EVENT_STOP_MUSIC" || command == "EVENT_MUSIC_STOP") finished = AudioEventHandler::stop_music(args);
    else if(command == "EVENT_SET_MUSIC_VOLUME") finished = AudioEventHandler::set_volume(args);
    else if(command == "EVENT_MUSIC_RESUME") finished = AudioEventHandler::resume_music(args);
    else if(command == "EVENT_MUSIC_PAUSE") finished = AudioEventHandler::pause_music(args);
    else if(command == "EVENT_MUSIC_FADE") finished = AudioEventHandler::fade_music(args);
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
    else if(command == "EVENT_SAVE_WRITE" || command == "EVENT_SAVE_LOAD") finished = SaveEventHandler::execute(args);
    else if(command == "EVENT_HBE_EFFECT_ENABLE" || command == "EVENT_HBE_EFFECT_DISABLE") finished = HbeEventHandler::execute(args);
    else if(command == "EVENT_BLEND_ALPHA") finished = BlendEventHandler::set_alpha(args);
    else if(command == "EVENT_SHOOTER_SET_PLAYER_ENABLED") finished = ShooterEventHandler::set_player_enabled(args);
    else if(command == "EVENT_DIALOGUE_SHOW") finished = DialogueEventHandler::show(args);
    else if(command == "EVENT_DISPLAY_DIALOGUE" || command == "EVENT_TEXT_SCROLL" || command == "EVENT_CREDITS_PLAY") finished = DialogueEventHandler::display(args);
    else if(command == "EVENT_DISPLAY_VARIABLE_TEXT") finished = VariableTextEventHandler::display(args);
    else if(command == "EVENT_UI_SET_TEXT") finished = UiEventHandler::set_text(args);
    else if(command == "EVENT_UI_SET_VALUE") finished = UiEventHandler::set_value(args);
    else if(command == "EVENT_UI_ANIMATE")
    {
        const UiAnimateEventData* ui = static_cast<const UiAnimateEventData*>(args);
        if(ui) BN_LOG("[UI Dispatch] id=", ui->ui_id, " type=", ui->animation, " target=", ui->x, ",", ui->y, " speed_units=", ui->speed_units, " duration=", ui->duration_frames);
        finished = UiEventHandler::animate(args);
        BN_LOG("[UI Dispatch] handler result=", finished);
    }
    else if(command == "EVENT_UI_DESTROY") status = UiEventHandler::destroy(args) ? EventStatus::completed : EventStatus::failed;
    else if(command == "EVENT_UI_HIDE") status = UiEventHandler::hide(args) ? EventStatus::completed : EventStatus::failed;
    else if(command == "EVENT_UI_SHOW") status = UiEventHandler::show(args) ? EventStatus::completed : EventStatus::failed;
    else if(command == "EVENT_UI_ANIMATION_STOP") finished = UiEventHandler::stop_animation(args);
    else if(command == "EVENT_SPRITE_EFFECT") finished = SpriteEventHandler::effect(args);
    else if(command == "EVENT_HIDE_DIALOGUE" || command == "EVENT_DIALOGUE_CLOSE") finished = DialogueEventHandler::hide(args);
    else if(command == "EVENT_DIALOGUE_CHOICE" || command == "EVENT_MENU_OPEN") finished = DialogueEventHandler::choice(args);
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
            instance.continuations.push_back({ instance.active_data, instance.active_count, next_index,
                                               instance.structured_loop_remaining });
            for(int8_t& value : instance.structured_loop_remaining) value = -1;
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
        instance.numeric_cache.reset();
        instance.current_index = current.nextIndex >= 0 && current.nextIndex < instance.active_count
            ? current.nextIndex : instance.active_count;
    }
}
