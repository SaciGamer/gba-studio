#ifndef INPUT_MANAGER_H
#define INPUT_MANAGER_H

struct InputBinding;

struct InputSnapshot {
    bool interact_pressed;
    bool input_pressed;
    bool up_pressed;
    bool down_pressed;
    bool touch_active;
};

class InputManager {
public:
    static InputManager& instance();
    InputSnapshot poll() const;
    bool pressed(const char* button) const;
    // Attached scripts read their key even when overriding its default action.
    bool binding_pressed(const char* button) const;
    bool held(const char* button) const;
    bool action_pressed(const char* action) const;
    bool action_held(const char* action) const;
    void configure(const InputBinding* bindings, int bindings_count);
    void set_override(const char* button, bool enabled);
    bool is_overridden(const char* button) const;
    bool is_blocked(const char* button) const;
    bool set_group_enabled(const char* group, bool enabled);
    void clear_overrides();
};

#endif
