#pragma once
#include <cstdint>
#include "resource_types.h"
class GraphicsManager {
public:
    bool write_numeric_actor_property(const char*, int, int) { return false; }
    bool write_numeric_trigger_property(const char*, int, int) { return false; }
    bool set_actor_transform(const char*, int, int, int, int = 0xffffff) { std::abort(); }
    // Default harness body is 1 pixel; geometry is covered by actor-facing-trigger-native.
    bool player_overlaps_trigger(const ScriptTrigger& t, int x, int y) const {
        return x < t.x + t.width && x + 1 > t.x && y < t.y + t.height && y + 1 > t.y;
    }
    bool actor_is_facing(const char*, const char*, bool = true, bool = true, int = 0, int = 0) const { return false; }
    void change_default_palettes(const char* const*) { std::abort(); }
    uint32_t revision = 0;
    ScriptTrigger get_script_trigger(int, const ScriptTrigger& source) const { return source; }
    const ScriptTrigger& resolve_script_trigger(int, const ScriptTrigger& source, ScriptTrigger&) const { return source; }
    static GraphicsManager& instance() { static GraphicsManager value; return value; }
    uint32_t get_scene_revision() const { return revision; }
};
