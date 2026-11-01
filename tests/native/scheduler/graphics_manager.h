#pragma once
#include <cstdlib>
#include <cstdint>
#include "resource_types.h"
class GraphicsManager {
public:
    bn::string<64> direction_actor;
    int direction_value = -1;
    bool write_numeric_actor_property(const char* id, int property, int value) {
        if(!id || property != 2 || value < 0 || value > 3) return false;
        direction_actor = id; direction_value = value; return true;
    }
    bool trigger_enabled = false;
    bool write_numeric_trigger_property(const char* id, int property, int value) {
        if(!id || bn::string<64>(id) != "8d650072-7876-463d-a70d-d2560a9795ad" || property != 4) return false;
        trigger_enabled = value != 0; return true;
    }
    bool set_actor_transform(const char*, int, int, int, int = 0xffffff) { std::abort(); }
    const ScriptTrigger& resolve_script_trigger(int, const ScriptTrigger& source, ScriptTrigger&) const { return source; }
    bool player_overlaps_trigger(const ScriptTrigger& t, int x, int y) const {
        return x < t.x + t.width && x + 1 > t.x && y < t.y + t.height && y + 1 > t.y;
    }
    bool facing_result = false;
    mutable bn::string<64> facing_source, facing_target;
    mutable bool facing_look_x = true, facing_look_y = true;
    mutable int facing_distance_x = 0, facing_distance_y = 0;
    bool actor_is_facing(const char* source, const char* target, bool look_x = true, bool look_y = true, int distance_x = 0, int distance_y = 0) const {
        facing_source = source ? source : ""; facing_target = target ? target : "";
        facing_look_x = look_x; facing_look_y = look_y;
        facing_distance_x = distance_x; facing_distance_y = distance_y;
        return facing_result;
    }
    void change_default_palettes(const char* const*) { std::abort(); }
    bool set_actor_visual_effect(const char*, int, int, int) { std::abort(); }
    void set_global_sprite_blending() {}
    uint32_t revision = 0;
    ScriptTrigger get_script_trigger(int, const ScriptTrigger& source) const { return source; }
    bool show_emote(const char*, const char*, int = 12) { std::abort(); }
    static GraphicsManager& instance() { static GraphicsManager value; return value; }
    uint32_t get_scene_revision() const { return revision; }
    bool set_actor_visible(const char*, bool) { std::abort(); }
    bool set_all_actors_visible(bool) { std::abort(); }
};
