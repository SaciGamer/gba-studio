#ifndef HBE_MANAGER_H
#define HBE_MANAGER_H

#include "bn_optional.h"
#include "bn_bg_palette_ptr.h"

class HbeManager
{
public:
    static HbeManager& instance();
    bool enable(const char* preset, int intensity);
    bool enable(const char* preset, int intensity, const bn::optional<bn::bg_palette_ptr>& palette);
    void disable();
};

#endif
