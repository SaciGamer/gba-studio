#include "event_wait_signal.h"
#include "shooter_kit.h"

EventStatus run_wait_signal_status(const ShooterWaitSignalEventData& data, WaitSignal& state)
{
    if(!data.signal || !data.signal[0]) return EventStatus::failed;
    if(ShooterKit::instance().consume_signal(data.signal))
    {
        state = WaitSignal();
        return EventStatus::completed;
    }
    if(!state.active)
    {
        state.active = true;
        state.elapsed_frames = 0;
    }
    else ++state.elapsed_frames;
    if(data.timeout_frames > 0 && state.elapsed_frames >= data.timeout_frames)
    {
        state = WaitSignal();
        return EventStatus::completed;
    }
    return EventStatus::running;
}
