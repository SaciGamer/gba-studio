#ifndef GBA_STUDIO_ACTOR_VISUAL_COLORS_H
#define GBA_STUDIO_ACTOR_VISUAL_COLORS_H
#include "bn_color.h"

namespace actor_visual
{
inline bn::color color(bn::color source, int saturation, int brightness, int tint, int strength)
{
    const int gray = (source.red() * 30 + source.green() * 59 + source.blue() * 11) / 100;
    const auto channel = [&](int value, int tint_channel) {
        value = gray + (value - gray) * saturation / 100;
        value = (value * (100 - strength) + tint_channel * strength) / 100;
        value = brightness >= 0 ? value + (31 - value) * brightness / 100 : value * (100 + brightness) / 100;
        return value < 0 ? 0 : value > 31 ? 31 : value;
    };
    return bn::color(channel(source.red(), ((tint >> 16) & 255) * 31 / 255),
        channel(source.green(), ((tint >> 8) & 255) * 31 / 255), channel(source.blue(), (tint & 255) * 31 / 255));
}
}
#endif
