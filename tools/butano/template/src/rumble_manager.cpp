#include "rumble_manager.h"
#include "bn_rumble.h"

RumbleManager& RumbleManager::instance()
{
    static RumbleManager manager;
    return manager;
}

void RumbleManager::start(int duration_frames, int intensity)
{
    if(duration_frames < 1 || intensity <= 0)
    {
        stop();
        return;
    }
    remaining_frames = duration_frames;
    bn::rumble::set_enabled(true);
}

void RumbleManager::update()
{
    if(remaining_frames <= 0) return;
    --remaining_frames;
    if(remaining_frames == 0) bn::rumble::set_enabled(false);
}

void RumbleManager::stop()
{
    remaining_frames = 0;
    bn::rumble::set_enabled(false);
}
