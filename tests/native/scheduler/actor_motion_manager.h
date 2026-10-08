#pragma once
#include "event_motion.h"

// Scheduler-only fixtures isolate actor navigation; dedicated motion tests use it.
class ActorMotionManager {
public:
    static ActorMotionManager& instance() { static ActorMotionManager manager; return manager; }
    void cancel(MotionEventState* = nullptr) {}
    bool controls_player() const { return false; }
};
