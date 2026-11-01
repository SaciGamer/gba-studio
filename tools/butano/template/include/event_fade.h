#ifndef EVENT_FADE_H
#define EVENT_FADE_H

#include "bn_blending.h"
#include "bn_blending_fade_alpha.h"
#include "resource_types.h"

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

EventStatus run_fade_status(const FadeEventData& data, FadeType fadeType, Fade& state);
bool run_fade(const FadeEventData& data, FadeType fadeType, Fade& state);
bool run_fade(const int fadeSpeed, FadeType fadeType, Fade& state);
bool run_fade(const void* args, FadeType fadeType, Fade& state);
// Compatibilidade para callers legados; novos scripts devem fornecer estado.
bool run_fade(const int fadeSpeed, FadeType fadeType, bool active);
bool run_fade(const void* args, FadeType fadeType);

#endif // EVENT_FADE_H
