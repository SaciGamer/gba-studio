#include "hbe_manager.h"

#if defined(__arm__) || defined(__thumb__)
#include "bn_array.h"
#include "bn_fixed.h"
#include "bn_string.h"
#include "bn_mosaic_attributes.h"
#include "bn_mosaic_attributes_hbe_ptr.h"
#include "bn_color.h"
#include "bn_backdrop_color_hbe_ptr.h"
#include "bn_bg_palette_color_hbe_ptr.h"
#include "bn_green_swap.h"

namespace
{
#define HBE_MANAGER_EWRAM_BSS __attribute__((section(".sbss")))
    HBE_MANAGER_EWRAM_BSS bn::array<bn::mosaic_attributes, 160> mosaic_lines;
    HBE_MANAGER_EWRAM_BSS bn::array<bn::color, 160> backdrop_lines;
    bn::optional<bn::mosaic_attributes_hbe_ptr> mosaic_effect;
    bn::optional<bn::backdrop_color_hbe_ptr> backdrop_effect;
    HBE_MANAGER_EWRAM_BSS bn::array<bn::color, 160> palette_lines;
    bn::optional<bn::bg_palette_color_hbe_ptr> palette_effect;

    bn::fixed stretch(int value)
    {
        return bn::fixed::from_data(value * bn::fixed::scale() / 16);
    }
}
#endif

HbeManager& HbeManager::instance()
{
    static HbeManager manager;
    return manager;
}

bool HbeManager::enable(const char* preset, int intensity)
{
#if defined(__arm__) || defined(__thumb__)
    if(!preset || intensity < 0 || intensity > 16) return false;
    if(bn::string<32>(preset) == "green_swap")
    {
        mosaic_effect.reset();
        backdrop_effect.reset();
        palette_effect.reset();
        bn::green_swap::set_enabled(intensity > 0);
        return true;
    }
    if(bn::string<32>(preset) == "backdrop_gradient")
    {
        mosaic_effect.reset();
        palette_effect.reset();
        bn::green_swap::set_enabled(false);
        for(int line = 0; line < 160; ++line)
        {
            const int gradient = line * intensity / 159;
            backdrop_lines[line] = bn::color(gradient * 31 / 16, 0, (16 - gradient) * 31 / 16);
        }
        backdrop_effect = bn::backdrop_color_hbe_ptr::create_optional(backdrop_lines);
        return backdrop_effect.has_value();
    }
    if(bn::string<32>(preset) != "mosaic_wave" && bn::string<32>(preset) != "mosaic_in") return false;
    backdrop_effect.reset();
    palette_effect.reset();
    bn::green_swap::set_enabled(false);
    for(int line = 0; line < 160; ++line)
    {
        const int distance = line >= 80 ? line - 80 : 80 - line;
        const int wave = distance * intensity / 80;
        const int value = bn::min(16, preset[7] == 'i' ? wave : intensity - wave);
        mosaic_lines[line] = bn::mosaic_attributes(stretch(value), stretch(value), stretch(value), stretch(value));
    }
    mosaic_effect = bn::mosaic_attributes_hbe_ptr::create_optional(mosaic_lines);
    return mosaic_effect.has_value();
#else
    (void) preset;
    (void) intensity;
    return true;
#endif
}

bool HbeManager::enable(const char* preset, int intensity, const bn::optional<bn::bg_palette_ptr>& palette)
{
#if defined(__arm__) || defined(__thumb__)
    if(!preset || intensity < 0 || intensity > 16) return false;
    if(bn::string<32>(preset) == "green_swap") return enable(preset, intensity);
    if(bn::string<32>(preset) != "palette_wave" || !palette.has_value()) return false;
    mosaic_effect.reset();
    backdrop_effect.reset();
    bn::green_swap::set_enabled(false);
    const bn::span<const bn::color> colors = palette->colors();
    if(colors.size() < 2) return false;
    const bn::color base = colors[1];
    for(int line = 0; line < 160; ++line)
    {
        const int distance = line >= 80 ? line - 80 : 80 - line;
        const int greenOffset = (80 - distance) * intensity / 80;
        palette_lines[line] = bn::color(base.red(), bn::clamp(base.green() + greenOffset, 0, 31), base.blue());
    }
    palette_effect = bn::bg_palette_color_hbe_ptr::create_optional(*palette, 1, palette_lines);
    return palette_effect.has_value();
#else
    (void) preset;
    (void) intensity;
    (void) palette;
    return true;
#endif
}

void HbeManager::disable()
{
#if defined(__arm__) || defined(__thumb__)
    mosaic_effect.reset();
    backdrop_effect.reset();
    palette_effect.reset();
    bn::green_swap::set_enabled(false);
#endif
}
