#ifndef EVENT_WAIT_H
#define EVENT_WAIT_H

#include "bn_fixed.h"
#include "bn_blending.h"
#include "bn_blending_fade_alpha.h"
#include "resource_types.h"

/**
 * Event Wait Manager for {{PROJECT_NAME}}
 * Scripts enum, struct and reference function
 */
enum class WaitType { TIME, FRAMES };

struct Wait {
    int seconds;
    int frames;
    WaitType type;

    bool active;
    bn::fixed countFixed;
    int countInt;
};

EventStatus run_wait_status(const WaitEventData& data, Wait& state);
bool run_wait(const WaitEventData& data, Wait& state);
bool run_wait(const void* args, Wait& state);
// Compatibilidade para callers legados; novos scripts devem fornecer estado.
bool run_wait(const void* args);

#endif // EVENT_WAIT_H
