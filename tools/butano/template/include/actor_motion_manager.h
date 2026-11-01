#ifndef ACTOR_MOTION_MANAGER_H
#define ACTOR_MOTION_MANAGER_H

#include "actor_motion_path.h"
#include "event_motion.h"

class ActorMotionManager {
    ActorMotionManager();
    struct Job {
        MotionEventState* owner = nullptr;
        const char* actor_id = nullptr;
        uint32_t scene_revision = 0;
        actor_motion::State state;
        const Sprites* body = nullptr;
        actor_motion::Options options;
        int target_x = 0, target_y = 0, speed_q8 = 256;
        int original_animation_speed = -1;
        actor_motion::PathAction path[512];
        int path_size = -1, frame = 0, searches = 0;
    };
    Job jobs[8];
    actor_motion::PathSearch search;
    Job* search_owner = nullptr;
public:
    static ActorMotionManager& instance();
    EventStatus advance(const ActorMoveEventData& data, MotionEventState& owner);
    bool controls_player() const;
    bool controls_actor(const char* actor_id) const;
    void cancel(MotionEventState* owner = nullptr);
    void stop_actor(const char* actor_id);
};
#endif
