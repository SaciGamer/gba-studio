#pragma once
#include <cstdint>
class GraphicsManager {
public:
    uint32_t revision = 0;
    static GraphicsManager& instance() { static GraphicsManager value; return value; }
    uint32_t get_scene_revision() const { return revision; }
};
