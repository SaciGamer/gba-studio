#ifndef SCRIPT_EVENT_HANDLERS_H
#define SCRIPT_EVENT_HANDLERS_H

#include "bn_string.h"
#include "resource_types.h"
#include "event_wait.h"
#include "event_fade.h"

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

class ChangeSceneEventHandler
{
public:
    static bool execute(const void* args);
};

class CameraEventHandler
{
public:
    static bool execute(const CameraEventData& data);
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
    static bool play_sound(const void* args);
    static bool stop_music(const void* args);
    static bool set_volume(const MusicVolumeEventData& data);
    static bool set_volume(const void* args);
};

class DialogueEventHandler
{
public:
    static bool display(const DialogueEventData& data);
    static bool display(const void* args);
    static bool hide(const void* args);
    static bool choice(const DialogueChoiceEventData& data);
    static bool choice(const void* args);
};

class VariableTextEventHandler
{
public:
    static bool display(const VariableTextEventData& data);
    static bool display(const void* args);
};

#endif // SCRIPT_EVENT_HANDLERS_H
