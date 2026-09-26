#include "event_wait.h"

#include "bn_core.h"
#include "bn_string.h"

Wait wait;

EventStatus run_wait_status(const WaitEventData& data, Wait& state)
{
    if(state.active)
    {
        ++state.countInt;
        if(state.countInt >= state.frames)
        {
            state.countInt = 0;
            state.active = false;
            return EventStatus::completed;
        }
        return EventStatus::running;
    }

    state.seconds = data.seconds;
    state.frames = data.frames;
    state.countInt = 0;
    state.type = data.units && bn::string<8>(data.units) == "frames"
        ? WaitType::FRAMES : WaitType::TIME;
    if(state.type == WaitType::TIME)
    {
        state.frames = state.seconds > 0 ? state.seconds * 60 : 0;
    }
    if(state.frames <= 0)
    {
        state.active = false;
        return EventStatus::completed;
    }
    state.active = true;
    return EventStatus::running;
}

bool run_wait(const WaitEventData& data, Wait& state)
{
    return run_wait_status(data, state) == EventStatus::completed;
}

bool run_wait(const void* args, Wait& state)
{
    if(!args) return true;
    return run_wait(*static_cast<const WaitEventData*>(args), state);
}

bool run_wait(const void* args)
{
    return run_wait(args, wait);
}
