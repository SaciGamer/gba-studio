#ifndef EVENT_CHANGE_LAYER_H
#define EVENT_CHANGE_LAYER_H

#include "bn_string.h"
#include "bn_fixed.h"
#include "bn_vector.h"

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

bool run_change_layer(const void* args, const bn::string<64> scene_id);

#endif // EVENT_CHANGE_LAYER_H