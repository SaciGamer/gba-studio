#pragma once
#include <set>
#include <string>
struct InputBinding;
struct InputSnapshot {
    bool interact_pressed = false;
    bool input_pressed = false;
    bool up_pressed = false;
    bool down_pressed = false;
    bool touch_active = false;
};
class InputManager {
public:
    std::set<std::string> pressed_buttons, held_buttons, overrides;
    InputSnapshot snapshot;
    static InputManager& instance() { static InputManager value; return value; }
    void configure(const InputBinding*, int) {}
    bool pressed(const char* button) const { return !is_blocked(button) && pressed_buttons.count(button) != 0; }
    bool binding_pressed(const char* button) const { return pressed_buttons.count(button) != 0; }
    bool binding_held(const char* button) const { return held_buttons.count(button) != 0; }
    bool held(const char* button) const { return held_buttons.count(button) != 0; }
    void set_override(const char* button, bool enabled) {
        if(enabled) overrides.insert(button); else overrides.erase(button);
    }
    void clear_overrides() { overrides.clear(); }
    InputSnapshot poll() const { return snapshot; }
    bool is_overridden(const char* button) const { return overrides.count(button) != 0; }
    bool is_blocked(const char* button) const { return is_overridden(button); }
    std::string queued_action, queued_trigger;
    int cleared_actions = 0;
    void clear_button_actions(const char* button) { ++cleared_actions; if(queued_trigger == button) { queued_action.clear(); queued_trigger.clear(); } }
    bool queue_default_action(const char* button, const char* trigger = nullptr) { queued_action = button ? button : ""; queued_trigger = trigger ? trigger : ""; return !queued_action.empty(); }
    bool set_group_enabled(const char*, bool) { return true; }
};
