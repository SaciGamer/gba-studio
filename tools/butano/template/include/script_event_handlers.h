#ifndef SCRIPT_EVENT_HANDLERS_H
#define SCRIPT_EVENT_HANDLERS_H

#include "bn_string.h"
#include "resource_types.h"
#include "event_wait.h"
#include "event_wait_input.h"
#include "event_wait_signal.h"
#include "event_fade.h"
#include "event_motion.h"

class IfEventHandler
{
public:
    static bool evaluate(const ScriptConditionData& condition);
};

class FadeEventHandler
{
public:
    static EventStatus execute_status(const bn::string<64>& command, const void* args, Fade& state);
    static bool execute(const bn::string<64>& command, const void* args, Fade& state);
    static bool execute(const bn::string<64>& command, const void* args);
};

class FadeOptionsEventHandler
{
public:
    static bool execute(const void* args);
};

class WaitEventHandler
{
public:
    static EventStatus execute_status(const void* args, Wait& state);
    static bool execute(const void* args, Wait& state);
    static bool execute(const void* args);
};

class WaitInputEventHandler
{
public:
    static EventStatus execute_status(const void* args, WaitInput& state);
};

class WaitSignalEventHandler
{
public:
    static EventStatus execute_status(const void* args, WaitSignal& state);
};

class SaveEventHandler
{
public:
    static bool execute(const SaveEventData& data);
    static bool execute(const void* args);
};

class ChangeSceneEventHandler
{
public:
    static bool execute(const void* args);
};

class CameraEventHandler
{
public:
    static EventStatus execute_status(const void* args, MotionEventState& state);
    static bool execute(const CameraEventData& data);
    static bool follow(const CameraFollowEventData& data);
    static bool shake(const CameraShakeEventData& data);
    static bool execute(const void* args);
    static bool follow(const void* args);
    static bool shake(const void* args);
};

class InputEventHandler
{
public:
    static bool group(const InputGroupEventData& data);
    static bool group(const void* args);
};

class RumbleEventHandler
{
public:
    static bool execute(const RumbleEventData& data);
    static bool execute(const void* args);
};

class ChangeLayerEventHandler
{
public:
    static bool execute(const void* args, const bn::string<64>& sceneId);
};

class ChangePaletteBackgroundEventHandler
{
public:
    static bool execute(const void* args, const bn::string<64>& sceneId);
};

class VariableEventHandler
{
public:
    static bool execute(const bn::string<64>& command, const void* args);
};

class ActorEventHandler
{
public:
    static bool state(const void* args);
    static EventStatus move_status(const void* args, MotionEventState& state);
    static bool spawn(const ActorSpawnEventData& data);
    static bool remove(const ActorRemoveEventData& data);
    static bool visible(const ActorVisibilityEventData& data);
    static bool animation_speed(const ActorAnimationSpeedEventData& data);
    static bool priority(const ActorPriorityEventData& data);
    static bool move(const ActorMoveEventData& data);
    static bool spawn(const void* args);
    static bool remove(const void* args);
    static bool visible(const void* args);
    static bool animation_speed(const void* args);
    static bool priority(const void* args);
    static bool move(const void* args);
};

class AudioEventHandler
{
public:
    static bool play_music(const PlayMusicEventData& data);
    static bool play_music(const void* args);
    static bool play_jingle(const PlayJingleEventData& data);
    static bool play_jingle(const void* args);
    static bool play_sound(const void* args);
    static bool stop_sound(const void* args);
    static bool stop_music(const void* args);
    static bool resume_music(const void* args);
    static bool pause_music(const void* args);
    static bool fade_music(const MusicFadeEventData& data);
    static bool fade_music(const void* args);
    static bool set_volume(const MusicVolumeEventData& data);
    static bool set_volume(const void* args);
};

class ShooterEventHandler
{
public:
    static bool start(const ShooterStartEventData& data);
    static bool load_stage(const ShooterLoadStageEventData& data);
    static bool load_stage(const void* args);
    static bool set_background_mode(const ShooterBackgroundModeEventData& data);
    static bool set_background_mode(const void* args);
    static bool pause(const ShooterPauseEventData& data);
    static bool stop(const void* args);
    static bool clear_enemies(const void* args);
    static bool spawn_boss(const ShooterBossSpawnEventData& data);
    static bool spawn_boss(const void* args);
    static bool boss_phase(const ShooterBossPhaseEventData& data);
    static bool boss_phase(const void* args);
    static bool stat(const ShooterStatEventData& data);
    static bool stat(const void* args);
    static bool grant(const ShooterGrantEventData& data);
    static bool grant(const void* args);
    static bool start(const void* args);
    static bool pause(const void* args);
    static bool set_player_enabled(const ShooterPlayerEnabledEventData& data);
    static bool set_player_enabled(const void* args);
};

class DialogueEventHandler
{
public:
    static bool show(const void* args);
    static bool display(const DialogueEventData& data);
    static bool display(const void* args);
    static bool hide(const void* args);
    static bool choice(const DialogueChoiceEventData& data);
    static bool choice(const void* args);
};

class UiEventHandler
{
public:
    static bool set_text(const UiSetTextEventData& data);
    static bool set_text(const void* args);
    static bool set_value(const UiSetValueEventData& data);
    static bool set_value(const void* args);
    static bool animate(const UiAnimateEventData& data);
    static bool animate(const void* args);
    static bool destroy(const UiTargetEventData& data);
    static bool destroy(const void* args);
    static bool hide(const UiTargetEventData& data);
    static bool hide(const void* args);
    static bool show(const UiTargetEventData& data);
    static bool show(const void* args);
    static bool stop_animation(const UiAnimationStopEventData& data);
    static bool stop_animation(const void* args);
};

class SpriteEventHandler
{
public:
    static bool effect(const SpriteEffectEventData& data);
    static bool effect(const void* args);
};

class VariableTextEventHandler
{
public:
    static bool display(const VariableTextEventData& data);
    static bool display(const void* args);
};

class HbeEventHandler
{
public:
    static bool execute(const HbeEffectEventData& data);
    static bool execute(const void* args);
};

class BlendEventHandler
{
public:
    static bool set_alpha(const BlendAlphaEventData& data);
    static bool set_alpha(const void* args);
};

#endif // SCRIPT_EVENT_HANDLERS_H
