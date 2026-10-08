#pragma once
#include <cstdlib>
#include <cstdint>
class GraphicsManager {
public:
    uint32_t revision = 0;
    static GraphicsManager& instance() { static GraphicsManager value; return value; }
    uint32_t get_scene_revision() const { return revision; }
    bool set_actor_visible(const char*, bool) { std::abort(); }
    bool set_all_actors_visible(bool) { std::abort(); }
};
