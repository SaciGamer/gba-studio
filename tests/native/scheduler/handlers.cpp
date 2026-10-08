#include <cstdlib>
#include "script_event_handlers.h"
EventStatus CameraEventHandler::execute_status(const void* args, MotionEventState&) {
    return execute(args) ? EventStatus::completed : EventStatus::failed;
}
EventStatus ActorEventHandler::move_status(const void* args, MotionEventState&) {
    return move(args) ? EventStatus::completed : EventStatus::failed;
}
bool ActorEventHandler::state(const void*) { return true; }
#include "script_command_manager.h"
#include "variable_manager.h"
#include "hooks.h"
#include "rumble_manager.h"
#ifdef GBA_STUDIO_NATIVE_SCENE_LIFECYCLE
#include "event_change_scene.h"
#endif

// The native host has no Butano rumble backend. Keep the scene lifecycle
// test linkable without pulling the hardware-only implementation.
RumbleManager& RumbleManager::instance() { static RumbleManager manager; return manager; }
void RumbleManager::start(int, int) {}
void RumbleManager::update() {}
void RumbleManager::stop() {}

// Hardware/UI handlers are outside this host test. Only the scheduler's
// conditional selection is tested; condition expression evaluation is not.
bool IfEventHandler::evaluate(const ScriptConditionData& data) { return data.left.boolean_value; }
EventStatus WaitEventHandler::execute_status(const void* args, Wait& state) {
    return args ? run_wait_status(*static_cast<const WaitEventData*>(args), state) : EventStatus::failed;
}
EventStatus WaitInputEventHandler::execute_status(const void* args, WaitInput& state) {
    return args ? run_wait_input_status(*static_cast<const WaitInputEventData*>(args), state) : EventStatus::failed;
}
bool VariableEventHandler::execute(const bn::string<64>&, const void* args) {
    const auto& data = *static_cast<const VariableSetValueData*>(args);
    trace.push_back(data.source_variable_id ? VariableManager::instance().get_number(data.source_variable_id) : data.number_value);
    return true;
}
bool ChangeSceneEventHandler::execute(const void* args) {
#ifdef GBA_STUDIO_NATIVE_SCENE_LIFECYCLE
    return run_change_scene(args);
#else
    (void) args;
    ScriptCommand::instance().cancel_scene(cancel_during_handler);
    return true;
#endif
}
bool InputEventHandler::group(const InputGroupEventData&) { return true; }
bool InputEventHandler::group(const void*) { return true; }

// Abort on accidental use: these symbols satisfy linking, not coverage.
#define UNTESTED_HANDLER(type, method) bool type::method(const void*) { std::abort(); }
UNTESTED_HANDLER(FadeOptionsEventHandler, execute)
UNTESTED_HANDLER(CameraEventHandler, execute)
UNTESTED_HANDLER(CameraEventHandler, follow)
UNTESTED_HANDLER(CameraEventHandler, shake)
UNTESTED_HANDLER(ActorEventHandler, move)
UNTESTED_HANDLER(ActorEventHandler, spawn)
UNTESTED_HANDLER(ActorEventHandler, remove)
UNTESTED_HANDLER(ActorEventHandler, visible)
UNTESTED_HANDLER(ActorEventHandler, animation_speed)
UNTESTED_HANDLER(ActorEventHandler, priority)
UNTESTED_HANDLER(AudioEventHandler, play_music)
UNTESTED_HANDLER(AudioEventHandler, play_jingle)
UNTESTED_HANDLER(AudioEventHandler, play_sound)
UNTESTED_HANDLER(AudioEventHandler, stop_sound)
UNTESTED_HANDLER(AudioEventHandler, stop_music)
UNTESTED_HANDLER(AudioEventHandler, resume_music)
UNTESTED_HANDLER(AudioEventHandler, pause_music)
UNTESTED_HANDLER(AudioEventHandler, fade_music)
UNTESTED_HANDLER(AudioEventHandler, set_volume)
UNTESTED_HANDLER(RumbleEventHandler, execute)
UNTESTED_HANDLER(ShooterEventHandler, start)
UNTESTED_HANDLER(ShooterEventHandler, load_stage)
UNTESTED_HANDLER(ShooterEventHandler, set_background_mode)
UNTESTED_HANDLER(ShooterEventHandler, pause)
UNTESTED_HANDLER(ShooterEventHandler, stop)
UNTESTED_HANDLER(ShooterEventHandler, clear_enemies)
UNTESTED_HANDLER(ShooterEventHandler, spawn_boss)
UNTESTED_HANDLER(ShooterEventHandler, stat)
UNTESTED_HANDLER(ShooterEventHandler, set_player_enabled)
UNTESTED_HANDLER(DialogueEventHandler, display)
UNTESTED_HANDLER(DialogueEventHandler, show)
UNTESTED_HANDLER(DialogueEventHandler, hide)
UNTESTED_HANDLER(DialogueEventHandler, choice)
UNTESTED_HANDLER(VariableTextEventHandler, display)
UNTESTED_HANDLER(UiEventHandler, set_text)
UNTESTED_HANDLER(UiEventHandler, set_value)
UNTESTED_HANDLER(UiEventHandler, animate)
// Test dispatch/status only; sprite ownership is tested by ui-lifecycle-native.
bool UiEventHandler::destroy(const void* args) {
    const auto* data = static_cast<const UiTargetEventData*>(args);
    if(!data || !data->ui_id || bn::string<64>(data->ui_id) != "ui") return false;
    trace.push_back(12);
    return true;
}
// Test dispatch/status only; sprite ownership is tested by ui-lifecycle-native.
bool UiEventHandler::hide(const void* args) {
    const auto* data = static_cast<const UiTargetEventData*>(args);
    if(!data || !data->ui_id || bn::string<64>(data->ui_id) != "ui") return false;
    trace.push_back(10);
    return true;
}
// Test dispatch/status only; sprite ownership is tested by ui-lifecycle-native.
bool UiEventHandler::show(const void* args) {
    const auto* data = static_cast<const UiTargetEventData*>(args);
    if(!data || !data->ui_id || bn::string<64>(data->ui_id) != "ui") return false;
    trace.push_back(11);
    return true;
}
UNTESTED_HANDLER(UiEventHandler, stop_animation)
UNTESTED_HANDLER(SpriteEventHandler, effect)
EventStatus FadeEventHandler::execute_status(const bn::string<64>&, const void*, Fade&) { std::abort(); }
bool ChangeLayerEventHandler::execute(const void*, const bn::string<64>&) { std::abort(); }
bool ChangePaletteBackgroundEventHandler::execute(const void*, const bn::string<64>&) { std::abort(); }
bool run_visible_background(const void*, const bn::string<64>) { std::abort(); }
EventStatus WaitSignalEventHandler::execute_status(const void*, WaitSignal&) { std::abort(); }
bool SaveEventHandler::execute(const void*) { std::abort(); }
bool ShooterEventHandler::boss_phase(const void*) { std::abort(); }
bool ShooterEventHandler::grant(const void*) { std::abort(); }
bool HbeEventHandler::execute(const void*) { std::abort(); }
bool BlendEventHandler::set_alpha(const void*) { std::abort(); }
bool run_background_scroll(const void*, const bn::string<64>) { std::abort(); }
bool run_background_parallax(const void*, const bn::string<64>) { std::abort(); }
