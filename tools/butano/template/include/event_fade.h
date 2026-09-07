#ifndef EVENT_FADE_H
#define EVENT_FADE_H

#include "bn_blending.h"
#include "bn_blending_fade_alpha.h"

/**
 * Event Fade Manager for {{PROJECT_NAME}}
 * Scripts enum, struct and reference function
 */
enum class FadeType { IN, OUT };

struct Fade {
    int speed;          // de 1 a 6
    bool active;
    FadeType type;
};

bool run_fade(const int fadeSpeed, FadeType fadeType, bool active);
bool run_fade(const void* args, FadeType fadeType);

#endif // EVENT_FADE_H