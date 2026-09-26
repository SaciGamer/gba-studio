#ifndef INPUT_MANAGER_H
#define INPUT_MANAGER_H

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
    bool held(const char* button) const;
    void set_override(const char* button, bool enabled);
    bool is_overridden(const char* button) const;
    void clear_overrides();
};

#endif
