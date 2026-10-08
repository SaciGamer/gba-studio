#ifndef SCRIPT_TRIGGER_MANAGER_H
#define SCRIPT_TRIGGER_MANAGER_H

#include "bn_array.h"
#include "bn_string.h"
#include "resource_types.h"

class ScriptTriggerManager {
    struct State {
        bool inside = false;
        bool fired = false;
        int cooldown = 0;
        const ScriptCommandData* running_program = nullptr;
        int running_count = 0;
    };
    void advance(State& state);
    bn::string<64> scene_id;
    bn::array<State, 64> states;
    bool initialized = false;
public:
    void reset();
    void cancel_scene(const bn::string<64>& id);
    void update(const Scenes& scene, int player_x, int player_y,
                bool interact_pressed, bool input_pressed, bool touch_active);
};

#endif
