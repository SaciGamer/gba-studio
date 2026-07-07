#ifndef EVENT_WAIT_H
#define EVENT_WAIT_H

#include "bn_fixed.h"
#include "bn_blending.h"
#include "bn_blending_fade_alpha.h"

/**
 * Event Wait Manager for {{PROJECT_NAME}}
 * Scripts enum, struct and reference function
 */
enum class WaitType { TIME, FRAMES };

struct Wait {
    bn::fixed time;
    int frames;
    WaitType type;

    bool active;
    bn::fixed countFixed;
    int countInt;
};

bool runWait(const void* args);

#endif // EVENT_WAIT_H