#ifndef EVENT_WAIT_SIGNAL_H
#define EVENT_WAIT_SIGNAL_H

#include "resource_types.h"

struct WaitSignal {
    bool active = false;
    int elapsed_frames = 0;
};

EventStatus run_wait_signal_status(const ShooterWaitSignalEventData& data, WaitSignal& state);

#endif
