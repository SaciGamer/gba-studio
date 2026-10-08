#include "script_event_handlers.h"
#include "hbe_manager.h"
#include "save_manager.h"
#include "bn_string.h"

#include "config_variables.h"
#include "event_change_layer.h"
#include "event_change_scene.h"
#include "graphics_manager.h"
#include "event_fade.h"
#include "event_wait.h"
#include "variable_manager.h"
#include "actor_manager.h"
#include "actor_motion_manager.h"
#include "audio_manager.h"
#include "shooter_kit.h"
#include "dialogue_manager.h"
#include "camera_manager.h"
#include "input_manager.h"
#include "rumble_manager.h"

static int conditionValue(const ScriptValueData& value)
{
    if(value.button) return InputManager::instance().pressed(value.button) ? 1 : 0;
    if(value.is_variable)
    {
        if(value.type == VariableType::number) return VariableManager::instance().get_number(value.variable_id);
        if(value.type == VariableType::boolean) return VariableManager::instance().get_boolean(value.variable_id) ? 1 : 0;
        return VariableManager::instance().get_string(value.variable_id)[0] != '\0';
    }

    if(value.type == VariableType::boolean) return value.boolean_value ? 1 : 0;
    if(value.type == VariableType::string) return value.string_value && value.string_value[0] != '\0';
    return value.number_value;
}

bool IfEventHandler::evaluate(const ScriptConditionData& condition)
{
    const bn::string<3> operation(condition.operation ? condition.operation : "");

    if(condition.left.type == VariableType::string || condition.right.type == VariableType::string)
    {
        const bn::string<64> left = condition.left.is_variable
            ? bn::string<64>(VariableManager::instance().get_string(condition.left.variable_id))
            : bn::string<64>(condition.left.string_value ? condition.left.string_value : "");
        const bn::string<64> right = condition.right.is_variable
            ? bn::string<64>(VariableManager::instance().get_string(condition.right.variable_id))
            : bn::string<64>(condition.right.string_value ? condition.right.string_value : "");

        if(operation == "==") return left == right;
        if(operation == "!=") return !(left == right);
        if(operation == ">") return left > right;
        if(operation == ">=") return left >= right;
        if(operation == "<") return left < right;
        return left <= right;
    }

    const int left = conditionValue(condition.left);
    const int right = conditionValue(condition.right);
    if(operation == "==") return left == right;
    if(operation == "!=") return left != right;
    if(operation == ">") return left > right;
    if(operation == ">=") return left >= right;
    if(operation == "<") return left < right;
    return left <= right;
}

bool FadeEventHandler::execute(const bn::string<64>& command, const void* args)
{
    return run_fade(args, command == "EVENT_FADE_IN" ? FadeType::IN : FadeType::OUT);
}

EventStatus FadeEventHandler::execute_status(const bn::string<64>& command, const void* args, Fade& state)
{
    if(!args) return EventStatus::failed;
    const FadeEventData& data = *static_cast<const FadeEventData*>(args);
    return run_fade_status(data, command == "EVENT_FADE_IN" ? FadeType::IN : FadeType::OUT, state);
}

bool FadeEventHandler::execute(const bn::string<64>& command, const void* args, Fade& state)
{
    return execute_status(command, args, state) == EventStatus::completed;
}

bool FadeOptionsEventHandler::execute(const void* args)
{
    const void* const* values = static_cast<const void* const*>(args);
    const char* color = values && values[0] ? static_cast<const char*>(values[0]) : "black";
    if(bn::string<16>(color) == "white")
    {
        bn::blending::set_white_fade_color();
    }
    else
    {
        bn::blending::set_black_fade_color();
    }
    return true;
}

bool WaitEventHandler::execute(const void* args)
{
    return run_wait(args);
}

EventStatus WaitEventHandler::execute_status(const void* args, Wait& state)
{
    if(!args) return EventStatus::failed;
    return run_wait_status(*static_cast<const WaitEventData*>(args), state);
}

EventStatus WaitInputEventHandler::execute_status(const void* args, WaitInput& state)
{
    if(!args) return EventStatus::failed;
    return run_wait_input_status(*static_cast<const WaitInputEventData*>(args), state);
}

EventStatus WaitSignalEventHandler::execute_status(const void* args, WaitSignal& state)
{
    if(!args) return EventStatus::failed;
    return run_wait_signal_status(*static_cast<const ShooterWaitSignalEventData*>(args), state);
}

bool SaveEventHandler::execute(const SaveEventData& data)
{
    if(data.variable_ids && data.variable_ids[0])
        return data.write ? SaveManager::instance().write_group(data.slot, data.variable_ids, data.schema) : SaveManager::instance().load_group(data.slot, data.variable_ids, data.schema);
    return data.write ? SaveManager::instance().write(data.slot, data.variable_id) : SaveManager::instance().load(data.slot, data.variable_id);
}
bool SaveEventHandler::execute(const void* args)
{
    return args && execute(*static_cast<const SaveEventData*>(args));
}

bool WaitEventHandler::execute(const void* args, Wait& state)
{
    return execute_status(args, state) == EventStatus::completed;
}

bool ChangeSceneEventHandler::execute(const void* args)
{
    return run_change_scene(args);
}

bool InputEventHandler::group(const InputGroupEventData& data)
{
    return data.group && InputManager::instance().set_group_enabled(data.group, data.enabled);
}

bool InputEventHandler::group(const void* args)
{
    return args && group(*static_cast<const InputGroupEventData*>(args));
}

bool RumbleEventHandler::execute(const RumbleEventData& data)
{
    if(data.duration_frames < 1 || data.duration_frames > 120 || data.intensity < 0 || data.intensity > 100) return false;
    RumbleManager::instance().start(data.duration_frames, data.intensity);
    return true;
}

bool RumbleEventHandler::execute(const void* args)
{
    return args && execute(*static_cast<const RumbleEventData*>(args));
}

bool ChangeLayerEventHandler::execute(const void* args, const bn::string<64>& sceneId)
{
    return run_change_layer(args, sceneId);
}

bool ActorEventHandler::move(const ActorMoveEventData& data)
{
    if(!data.actor_id) return false;
    if(bn::string<64>(data.actor_id) == "__PLAYER__") return GraphicsManager::instance().move_actor(data.actor_id, data.x, data.y);
    return GraphicsManager::instance().move_actor(data.actor_id, data.x, data.y);
}

bool ActorEventHandler::spawn(const ActorSpawnEventData& data)
{
    return data.actor_id && ActorManager::instance().spawn(data.actor_id, data.x, data.y).slot >= 0 &&
           GraphicsManager::instance().spawn_actor(data.actor_id, data.x, data.y);
}
bool ActorEventHandler::remove(const ActorRemoveEventData& data)
{
    return data.actor_id && ActorManager::instance().remove_by_id(data.actor_id) &&
           GraphicsManager::instance().remove_actor(data.actor_id);
}
bool ActorEventHandler::visible(const ActorVisibilityEventData& data)
{
    if(data.actor_id && bn::string<64>(data.actor_id) == "__PLAYER__") return GraphicsManager::instance().set_actor_visible(data.actor_id, data.visible);
    return data.actor_id && ActorManager::instance().set_visible_by_id(data.actor_id, data.visible) &&
           GraphicsManager::instance().set_actor_visible(data.actor_id, data.visible);
}
bool ActorEventHandler::animation_speed(const ActorAnimationSpeedEventData& data)
{
    if(data.actor_id && bn::string<64>(data.actor_id) == "__PLAYER__") return GraphicsManager::instance().set_actor_animation_speed(data.actor_id, data.speed);
    return data.actor_id && ActorManager::instance().set_animation_speed_by_id(data.actor_id, data.speed) &&
           GraphicsManager::instance().set_actor_animation_speed(data.actor_id, data.speed);
}
bool ActorEventHandler::priority(const ActorPriorityEventData& data)
{
    return data.actor_id && GraphicsManager::instance().set_actor_priority(data.actor_id, data.priority);
}
bool ActorEventHandler::spawn(const void* args) { return args && spawn(*static_cast<const ActorSpawnEventData*>(args)); }
bool ActorEventHandler::remove(const void* args) { return args && remove(*static_cast<const ActorRemoveEventData*>(args)); }
bool ActorEventHandler::visible(const void* args) { return args && visible(*static_cast<const ActorVisibilityEventData*>(args)); }
bool ActorEventHandler::animation_speed(const void* args) { return args && animation_speed(*static_cast<const ActorAnimationSpeedEventData*>(args)); }
bool ActorEventHandler::priority(const void* args) { return args && priority(*static_cast<const ActorPriorityEventData*>(args)); }

bool AudioEventHandler::play_music(const PlayMusicEventData& data)
{
    return data.music_id && AudioManager::instance().play_music(data.music_id, data.volume);
}
bool AudioEventHandler::play_music(const void* args)
{
    return args && play_music(*static_cast<const PlayMusicEventData*>(args));
}

bool AudioEventHandler::play_jingle(const PlayJingleEventData& data)
{
    return data.music_id && AudioManager::instance().play_music(data.music_id, data.volume, false);
}
bool AudioEventHandler::play_jingle(const void* args)
{
    return args && play_jingle(*static_cast<const PlayJingleEventData*>(args));
}

bool AudioEventHandler::play_sound(const void* args)
{
    if(!args) return false;
    const auto& data = *static_cast<const PlaySoundEventData*>(args);
    return data.sound_id && AudioManager::instance().play_sound(data.sound_id, data.volume, data.speed, data.panning, data.priority, data.group_id ? data.group_id : "");
}
bool AudioEventHandler::stop_sound(const void* args)
{
    if(!args) return AudioManager::instance().stop_sound_group("");
    const auto& data = *static_cast<const SoundStopEventData*>(args);
    return AudioManager::instance().stop_sound_group(data.group_id ? data.group_id : "");
}
bool AudioEventHandler::stop_music(const void*)
{
    AudioManager::instance().stop_music();
    return true;
}
bool AudioEventHandler::resume_music(const void*)
{
    return AudioManager::instance().resume_music();
}
bool AudioEventHandler::pause_music(const void*)
{
    return AudioManager::instance().pause_music();
}
bool AudioEventHandler::fade_music(const MusicFadeEventData& data)
{
    AudioManager::instance().fade_music(data.target_volume, data.duration_frames);
    return true;
}
bool AudioEventHandler::fade_music(const void* args)
{
    return args && fade_music(*static_cast<const MusicFadeEventData*>(args));
}
bool AudioEventHandler::set_volume(const MusicVolumeEventData& data)
{
    if(data.volume < 0 || data.volume > 100) return false;
    AudioManager::instance().set_volume(data.volume);
    return true;
}
bool AudioEventHandler::set_volume(const void* args)
{
    return args && set_volume(*static_cast<const MusicVolumeEventData*>(args));
}

bool ShooterEventHandler::start(const ShooterStartEventData& data)
{
    return ShooterKit::instance().start_wave(data.wave_id);
}
bool ShooterEventHandler::start(const void* args)
{
    return args && start(*static_cast<const ShooterStartEventData*>(args));
}
bool ShooterEventHandler::load_stage(const ShooterLoadStageEventData& data)
{
    if(data.background_id && data.background_id[0])
    {
        GraphicsManager::instance().change_single_layer(data.background_layer, bn::string<64>(data.background_id), true);
    }
    if(data.music_id && data.music_id[0])
    {
        if(!AudioManager::instance().play_music(bn::string<64>(data.music_id), data.music_volume, true)) return false;
    }
    return ShooterKit::instance().start_wave(data.wave_id);
}
bool ShooterEventHandler::load_stage(const void* args)
{
    return args && load_stage(*static_cast<const ShooterLoadStageEventData*>(args));
}
bool ShooterEventHandler::set_background_mode(const ShooterBackgroundModeEventData& data)
{
    if(data.layer_id < 0 || data.layer_id > 3) return false;
    GraphicsManager::instance().set_layer_visible(data.layer_id, data.visible);
    GraphicsManager::instance().scroll_background(data.layer_id, data.scroll_x, data.scroll_y);
    GraphicsManager::instance().set_background_parallax(data.layer_id, data.parallax_x, data.parallax_y);
    return true;
}
bool ShooterEventHandler::set_background_mode(const void* args)
{
    return args && set_background_mode(*static_cast<const ShooterBackgroundModeEventData*>(args));
}
bool ShooterEventHandler::pause(const ShooterPauseEventData& data)
{
    ShooterKit::instance().set_paused(data.paused);
    return true;
}
bool ShooterEventHandler::pause(const void* args)
{
    return args && pause(*static_cast<const ShooterPauseEventData*>(args));
}
bool ShooterEventHandler::stop(const void*)
{
    ShooterKit::instance().stop();
    return true;
}
bool ShooterEventHandler::clear_enemies(const void*)
{
    ShooterKit::instance().clear_enemies();
    return true;
}
bool ShooterEventHandler::spawn_boss(const ShooterBossSpawnEventData& data)
{
    return ShooterKit::instance().spawn_boss(data.archetype_id, data.x, data.y, data.drop_id);
}
bool ShooterEventHandler::spawn_boss(const void* args)
{
    return args && spawn_boss(*static_cast<const ShooterBossSpawnEventData*>(args));
}
bool ShooterEventHandler::boss_phase(const ShooterBossPhaseEventData& data)
{
    return ShooterKit::instance().set_boss_phase(data.phase);
}
bool ShooterEventHandler::boss_phase(const void* args)
{
    return args && boss_phase(*static_cast<const ShooterBossPhaseEventData*>(args));
}
bool ShooterEventHandler::stat(const ShooterStatEventData& data)
{
    return data.additive ? ShooterKit::instance().add_stat(data.stat, data.value) : ShooterKit::instance().set_stat(data.stat, data.value);
}
bool ShooterEventHandler::stat(const void* args)
{
    return args && stat(*static_cast<const ShooterStatEventData*>(args));
}
bool ShooterEventHandler::grant(const ShooterGrantEventData& data)
{
    return ShooterKit::instance().grant(data.grant, data.value);
}
bool ShooterEventHandler::grant(const void* args)
{
    return args && grant(*static_cast<const ShooterGrantEventData*>(args));
}
bool ShooterEventHandler::set_player_enabled(const ShooterPlayerEnabledEventData& data)
{
    ShooterKit::instance().set_player_enabled(data.enabled);
    return true;
}
bool ShooterEventHandler::set_player_enabled(const void* args)
{
    return args && set_player_enabled(*static_cast<const ShooterPlayerEnabledEventData*>(args));
}

bool DialogueEventHandler::display(const DialogueEventData& data)
{
    return data.text && DialogueManager::instance().show(data.text, data.dialogue_font, data.show_frame, data.horizontal_align, data.vertical_align, data.animate, data.animation_speed, data.continuous_scroll);
}
bool DialogueEventHandler::display(const void* args)
{
    return args && display(*static_cast<const DialogueEventData*>(args));
}
bool DialogueEventHandler::hide(const void*)
{
    DialogueManager::instance().hide();
    return true;
}

bool DialogueEventHandler::choice(const DialogueChoiceEventData& data)
{
    return DialogueManager::instance().show_choice(data);
}

bool DialogueEventHandler::choice(const void* args)
{
    return args && choice(*static_cast<const DialogueChoiceEventData*>(args));
}

bool UiEventHandler::set_text(const UiSetTextEventData& data)
{
    return DialogueManager::instance().set_ui_text(data);
}
bool UiEventHandler::set_text(const void* args)
{
    return args && set_text(*static_cast<const UiSetTextEventData*>(args));
}
bool UiEventHandler::set_value(const UiSetValueEventData& data)
{
    return DialogueManager::instance().set_ui_value(data);
}
bool UiEventHandler::set_value(const void* args)
{
    return args && set_value(*static_cast<const UiSetValueEventData*>(args));
}
bool UiEventHandler::destroy(const UiTargetEventData& data)
{
    return DialogueManager::instance().destroy_ui(data);
}
bool UiEventHandler::destroy(const void* args)
{
    return args && destroy(*static_cast<const UiTargetEventData*>(args));
}

bool UiEventHandler::hide(const UiTargetEventData& data)
{
    return DialogueManager::instance().hide_ui(data);
}
bool UiEventHandler::hide(const void* args)
{
    return args && hide(*static_cast<const UiTargetEventData*>(args));
}

bool UiEventHandler::show(const UiTargetEventData& data)
{
    return DialogueManager::instance().show_ui(data);
}
bool UiEventHandler::show(const void* args)
{
    return args && show(*static_cast<const UiTargetEventData*>(args));
}

bool UiEventHandler::animate(const UiAnimateEventData& data)
{
    return DialogueManager::instance().animate_ui(data);
}
bool UiEventHandler::animate(const void* args)
{
    return args && animate(*static_cast<const UiAnimateEventData*>(args));
}
bool UiEventHandler::stop_animation(const UiAnimationStopEventData& data)
{
    return DialogueManager::instance().stop_ui_animation(data);
}
bool UiEventHandler::stop_animation(const void* args)
{
    return args && stop_animation(*static_cast<const UiAnimationStopEventData*>(args));
}

bool SpriteEventHandler::effect(const SpriteEffectEventData& data)
{
    return GraphicsManager::instance().set_actor_effect(data.actor_id, data.rotation, data.scale, data.visible,
                                                        data.fade_color, data.fade_intensity, data.duration_frames);
}
bool SpriteEventHandler::effect(const void* args)
{
    return args && effect(*static_cast<const SpriteEffectEventData*>(args));
}

bool VariableTextEventHandler::display(const VariableTextEventData& data)
{
    return data.variable_id && DialogueManager::instance().show_variable_text(data);
}
bool VariableTextEventHandler::display(const void* args)
{
    return args && display(*static_cast<const VariableTextEventData*>(args));
}

bool HbeEventHandler::execute(const HbeEffectEventData& data)
{
    if(!data.enabled)
    {
        HbeManager::instance().disable();
        return true;
    }
    if(data.preset && bn::string<32>(data.preset) == "palette_wave")
    {
        return HbeManager::instance().enable(data.preset, data.intensity, GraphicsManager::instance().get_layer_palette(data.layer_id));
    }
    return HbeManager::instance().enable(data.preset, data.intensity);
}

bool HbeEventHandler::execute(const void* args)
{
    return args && execute(*static_cast<const HbeEffectEventData*>(args));
}

bool BlendEventHandler::set_alpha(const BlendAlphaEventData& data)
{
    if(data.alpha < 0 || data.alpha > 100) return false;
    bn::blending::set_transparency_alpha(bn::fixed(data.alpha) / 100);
    return true;
}

bool BlendEventHandler::set_alpha(const void* args)
{
    return args && set_alpha(*static_cast<const BlendAlphaEventData*>(args));
}

bool ActorEventHandler::move(const void* args)
{
    return args && move(*static_cast<const ActorMoveEventData*>(args));
}

bool ChangePaletteBackgroundEventHandler::execute(const void* args, const bn::string<64>& sceneId)
{
    return run_change_palette_background(args, sceneId);
}

bool VariableEventHandler::execute(const bn::string<64>& command, const void* args)
{
    if(command == "EVENT_VARIABLE") return run_config_variables(args);
    return run_config_variables_reset_all();
}

bool CameraEventHandler::execute(const void* args)
{
    if(!args) return true;
    return execute(*static_cast<const CameraEventData*>(args));
}

bool CameraEventHandler::execute(const CameraEventData& data)
{
    CameraManager::instance().set_position(data.x, data.y);
    return true;
}
bool DialogueEventHandler::show(const void* args)
{
    if(!args) return false;
    const auto& data = *static_cast<const DialogueEventData*>(args);
    return data.text && DialogueManager::instance().show(data.text, data.dialogue_font, data.show_frame, data.horizontal_align, data.vertical_align, data.animate, data.animation_speed, data.continuous_scroll, true);
}
bool ActorEventHandler::state(const void* args) {
    if(!args) return false;
    const auto& data = *static_cast<const ActorStateEventData*>(args);
    return GraphicsManager::instance().set_actor_state(data.actor_id, data.state_id);
}

EventStatus ActorEventHandler::move_status(const void* args, MotionEventState& state)
{
    if(!args) return EventStatus::failed;
    const auto& data = *static_cast<const ActorMoveEventData*>(args);
    if(!data.animated) return move(data) ? EventStatus::completed : EventStatus::failed;
    return ActorMotionManager::instance().advance(data, state);
}

EventStatus CameraEventHandler::execute_status(const void* args, MotionEventState& state)
{
    if(!args) return EventStatus::failed;
    const auto& data = *static_cast<const CameraEventData*>(args);
    if(!data.animated) return execute(data) ? EventStatus::completed : EventStatus::failed;
    auto& camera = CameraManager::instance();
    if(!state.active) {
        state.active = true;
        state.remainder_q8 = 0;
        camera.follow_player_actor(false);
    }
    const int64_t dx = int64_t(data.x) - camera.get_x(), dy = int64_t(data.y) - camera.get_y();
    const int64_t ax = dx < 0 ? -dx : dx, ay = dy < 0 ? -dy : dy;
    const int64_t distance = ax > ay ? ax : ay;
    if(!distance) { state = {}; return EventStatus::completed; }
    state.remainder_q8 += data.speed_q8 > 0 ? data.speed_q8 : 256;
    const int step = state.remainder_q8 / 256;
    state.remainder_q8 %= 256;
    if(!step) return EventStatus::running;
    if(step >= distance) { camera.set_position(data.x, data.y); state = {}; return EventStatus::completed; }
    const int sx = int(dx * step / distance), sy = int(dy * step / distance);
    camera.set_position(camera.get_x() + sx, camera.get_y() + sy);
    return EventStatus::running;
}

bool CameraEventHandler::follow(const void* args)
{
    return args && follow(*static_cast<const CameraFollowEventData*>(args));
}

bool CameraEventHandler::follow(const CameraFollowEventData& data)
{
    CameraManager::instance().follow_player_actor(data.enabled);
    return true;
}

bool CameraEventHandler::shake(const void* args)
{
    return args && shake(*static_cast<const CameraShakeEventData*>(args));
}

bool CameraEventHandler::shake(const CameraShakeEventData& data)
{
    CameraManager::instance().shake(data.frames, data.amplitude);
    return true;
}
