#include "event_wait_input.h"

#include "input_manager.h"

EventStatus run_wait_input_status(const WaitInputEventData& data, WaitInput& state)
{
    if(!data.action || !data.action[0]) return EventStatus::failed;

    if(InputManager::instance().pressed(data.action))
    {
        state = WaitInput();
        return EventStatus::completed;
    }

    if(!state.active)
    {
        state.active = true;
        state.elapsed_frames = 0;
    }
    else
    {
        ++state.elapsed_frames;
    }

    if(data.timeout_frames > 0 && state.elapsed_frames >= data.timeout_frames)
    {
        state = WaitInput();
        return EventStatus::completed;
    }

    return EventStatus::running;
}
