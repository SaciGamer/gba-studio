#ifndef EVENT_CHANGE_LAYER_H
#define EVENT_CHANGE_LAYER_H

#include "bn_string.h"
#include "bn_fixed.h"
#include "bn_vector.h"

struct LayerChangeEventData;
struct LayerVisibilityEventData;
struct PaletteLayerEventData;

/**
 * Event Change Layer Manager for {{PROJECT_NAME}}
 * Scripts struct and reference function
 */
struct LayerArgs {
    int layer_id;
    bn::string<64> background_id;
    bool visible;
};

struct ArgsChangeLayer {
    bn::vector<LayerArgs, 4> layers;
};

struct PaletteLayerArgs {
    int layer_id;
    bool restore_palette;
    const char* const* palette_ids;
};

bool run_change_layer(const void* args, const bn::string<64> scene_id);
bool run_visible_background(const void* args, const bn::string<64> scene_id);
bool run_change_palette_background(const void* args, const bn::string<64> scene_id);
bool run_change_layer(const LayerChangeEventData& data, const bn::string<64>& scene_id);
bool run_visible_background(const LayerVisibilityEventData& data, const bn::string<64>& scene_id);
bool run_change_palette_background(const PaletteLayerEventData& data, const bn::string<64>& scene_id);

#endif // EVENT_CHANGE_LAYER_H
