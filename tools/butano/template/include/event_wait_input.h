#ifndef EVENT_WAIT_INPUT_H
#define EVENT_WAIT_INPUT_H

#include "resource_types.h"

struct WaitInput {
    bool active = false;
    int elapsed_frames = 0;
};

EventStatus run_wait_input_status(const WaitInputEventData& data, WaitInput& state);

#endif
