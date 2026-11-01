#ifndef RUMBLE_MANAGER_H
#define RUMBLE_MANAGER_H

#include <cstdint>

class RumbleManager
{
    int remaining_frames = 0;
public:
    static RumbleManager& instance();
    void start(int duration_frames, int intensity);
    void update();
    void stop();
    bool active() const { return remaining_frames > 0; }
};

#endif
