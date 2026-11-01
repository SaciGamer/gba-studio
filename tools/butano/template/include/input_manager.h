#ifndef INPUT_MANAGER_H
#define INPUT_MANAGER_H

struct InputBinding;
struct SceneInputMap;

struct InputSnapshot {
    bool interact_pressed;
    bool input_pressed;
    bool up_pressed;
    bool down_pressed;
    bool touch_active;
};

class InputManager {
public:
    void configure_scene_maps(const SceneInputMap* maps, int count);
    void set_scene_type(const char* type);
    static InputManager& instance();
    InputSnapshot poll() const;
    bool pressed(const char* button) const;
    // Attached scripts read their key even when overriding its default action.
    bool binding_pressed(const char* button) const;
    // True while the physical binding is held, regardless of action overrides.
    bool binding_held(const char* button) const;
    bool held(const char* button) const;
    bool action_pressed(const char* action) const;
    bool action_held(const char* action) const;
    void configure(const InputBinding* bindings, int bindings_count, const unsigned short* group_masks = nullptr);
    void set_override(const char* button, bool enabled);
    bool is_overridden(const char* button) const;
    bool is_blocked(const char* button) const;
    bool set_group_enabled(const char* group, bool enabled);
    void clear_overrides();
    bool queue_default_action(const char* button, const char* held_by = nullptr);
    // Drop only the generated actions owned by a replaced physical binding.
    void clear_button_actions(const char* button);
};

#endif
