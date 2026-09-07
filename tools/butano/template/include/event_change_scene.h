#ifndef EVENT_CHANGE_SCENE_H
#define EVENT_CHANGE_SCENE_H

#include "bn_string.h"
#include "bn_fixed.h"

/**
 * Event Change Scene Manager for {{PROJECT_NAME}}
 * Scripts struct and reference function
 */
struct ChangeScene {
    bn::string<64> next_scene_id;
    void* x;
    void* y;
    bn::string<64> direction;
    int fadeSpeed;

    bool active;
    bn::fixed countFixed;
};

bool run_change_scene(const void* args);

#endif // EVENT_CHANGE_SCENE_H