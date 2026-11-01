#ifndef BACKGROUND_ANIMATION_CLOCK_H
#define BACKGROUND_ANIMATION_CLOCK_H

namespace background_animation {
// A negative initial tick skips the update on the same frame as the event.
inline bool advance(int count, int duration, bool loop, int& frame, int& ticks, bool& active) {
    if(!active || count < 1 || duration < 1) return false;
    if(++ticks < duration) return false;
    ticks = 0;
    if(frame + 1 < count) { ++frame; return true; }
    if(loop) { frame = 0; return count > 1; }
    active = false;
    return false;
}
}
#endif
