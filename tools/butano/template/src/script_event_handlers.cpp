#include "script_event_handlers.h"

#include "config_variables.h"
#include "event_change_layer.h"
#include "event_change_scene.h"
#include "graphics_manager.h"
#include "event_fade.h"
#include "event_wait.h"
#include "variable_manager.h"
#include "actor_manager.h"
#include "audio_manager.h"
#include "dialogue_manager.h"
#include "camera_manager.h"
#include "input_manager.h"

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

bool WaitEventHandler::execute(const void* args, Wait& state)
{
    return execute_status(args, state) == EventStatus::completed;
}

bool ChangeSceneEventHandler::execute(const void* args)
{
    return run_change_scene(args);
}

bool ChangeLayerEventHandler::execute(const void* args, const bn::string<64>& sceneId)
{
    return run_change_layer(args, sceneId);
}

bool ActorEventHandler::move(const ActorMoveEventData& data)
{
    if(!data.actor_id) return false;
    if(bn::string<64>(data.actor_id) == "__PLAYER__") return GraphicsManager::instance().move_actor(data.actor_id, data.x, data.y);
    return ActorManager::instance().set_position_by_id(data.actor_id, data.x, data.y) &&
           GraphicsManager::instance().move_actor(data.actor_id, data.x, data.y);
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

bool AudioEventHandler::play_sound(const void* args)
{
    if(!args) return false;
    const auto& data = *static_cast<const PlaySoundEventData*>(args);
    return data.sound_id && AudioManager::instance().play_sound(data.sound_id, data.volume);
}
bool AudioEventHandler::stop_music(const void*)
{
    AudioManager::instance().stop_music();
    return true;
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

bool DialogueEventHandler::display(const DialogueEventData& data)
{
    return data.text && DialogueManager::instance().show(data.text, data.dialogue_font, data.show_frame, data.horizontal_align, data.vertical_align, data.animate, data.animation_speed);
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

bool VariableTextEventHandler::display(const VariableTextEventData& data)
{
    return data.variable_id && DialogueManager::instance().show_variable_text(data);
}
bool VariableTextEventHandler::display(const void* args)
{
    return args && display(*static_cast<const VariableTextEventData*>(args));
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
