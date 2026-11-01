#ifndef EVENT_MOTION_H
#define EVENT_MOTION_H

struct MotionEventState {
    bool active = false;
    int remainder_q8 = 0;
    bool stopped = false;
};

#endif
