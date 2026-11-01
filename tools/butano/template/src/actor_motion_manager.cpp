#include "actor_motion_manager.h"
#include "graphics_manager.h"
#include "actor_manager.h"
#include "bn_log.h"
namespace {
    bool actor_blocked(const char* id, const Sprites& body, int x, int y) {
        return GraphicsManager::instance().script_actor_blocked(id, body, x, y);
    }
    int actor_minimum_distance(const char* id, const Sprites& body, int x, int y) {
        return GraphicsManager::instance().script_actor_minimum_distance(id, body, x, y);
    }
}

ActorMotionManager::ActorMotionManager() {}

ActorMotionManager& ActorMotionManager::instance() {
#if defined(__arm__) || defined(__thumb__)
    static ActorMotionManager manager __attribute__((section(".sbss")));
#else
    static ActorMotionManager manager;
#endif
    return manager;
}
bool ActorMotionManager::controls_actor(const char* actor_id) const {
    for(const auto& job : jobs) if(job.owner && actor_motion::same_text(job.actor_id, actor_id)) return true;
    return false;
}
bool ActorMotionManager::controls_player() const {
    for(const auto& job : jobs) if(job.owner && actor_motion::same_text(job.actor_id, "__PLAYER__")) return true;
    return false;
}
void ActorMotionManager::cancel(MotionEventState* owner) {
    for(auto& job : jobs) if(job.owner && (!owner || job.owner == owner)) {
        GraphicsManager::instance().stop_script_actor_motion(job.actor_id);
        if(job.original_animation_speed >= 0) GraphicsManager::instance().set_actor_animation_speed(job.actor_id, job.original_animation_speed);
        *job.owner = {};
        if(search_owner == &job) search_owner = nullptr;
        job.owner = nullptr;
    }
}
void ActorMotionManager::stop_actor(const char* actor_id) {
    for(auto& job : jobs) if(job.owner && actor_motion::same_text(job.actor_id, actor_id)) {
        auto* owner = job.owner;
        cancel(owner);
        owner->stopped = true;
    }
}
EventStatus ActorMotionManager::advance(const ActorMoveEventData& data, MotionEventState& owner) {
    if(owner.stopped) { owner = {}; return EventStatus::completed; }
    auto& graphics = GraphicsManager::instance();
    Job* job = nullptr;
    for(auto& candidate : jobs) if(candidate.owner == &owner) { job = &candidate; break; }
    if(!job) {
        // Scripts targeting the same actor wait rather than fighting over its position.
        for(const auto& candidate : jobs) if(candidate.owner && candidate.actor_id && data.actor_id && actor_motion::same_text(candidate.actor_id, data.actor_id)) return EventStatus::running;
        for(auto& candidate : jobs) if(!candidate.owner) { job = &candidate; break; }
        if(!job || !data.actor_id || !graphics.getScene()) return EventStatus::failed;
        job->body = graphics.read_script_actor_state(data.actor_id, job->state);
        if(!job->body) return EventStatus::failed;
        job->options = {data.collide_walls, data.collide_actors, data.lock_axis, data.movement_type, data.actor_id, actor_blocked, actor_minimum_distance};
        const auto& scene = *graphics.getScene();
        int target_x = data.x, target_y = data.y;
        if(data.lock_axis == 1) target_y = job->state.y;
        if(data.lock_axis == 2) target_x = job->state.x;
        if(!actor_motion::clamp_destination(scene, *job->body, target_x, target_y)) return EventStatus::failed;
        job->owner = &owner; job->actor_id = data.actor_id; job->scene_revision = graphics.get_scene_revision();
        job->target_x = target_x; job->target_y = target_y; job->speed_q8 = std::clamp(data.speed_q8, 16, 4096);
        job->path_size = -1; job->frame = job->searches = 0; owner.active = true;
        job->original_animation_speed = graphics.read_numeric_actor_property(data.actor_id, 4);
        if(data.animation_speed >= 0) graphics.set_actor_animation_speed(data.actor_id, std::clamp(data.animation_speed, 0, 8));
    }
    if(job->scene_revision != graphics.get_scene_revision()) { cancel(&owner); return EventStatus::failed; }
    if(job->state.x == job->target_x && job->state.y == job->target_y) { cancel(&owner); return EventStatus::completed; }
    if(job->path_size < 0) {
        if(search_owner && search_owner != job) return EventStatus::running;
        if(!search_owner) {
            if(++job->searches > 3) { cancel(&owner); return EventStatus::failed; }
            search_owner = job;
            search.begin(*graphics.getScene(), *job->body, job->state, job->target_x, job->target_y, job->speed_q8,
                         true, actor_motion::same_text(job->actor_id, "__PLAYER__"), job->options);
        }
        const auto result = search.advance();
        if(result == actor_motion::SearchStatus::running) return EventStatus::running;
        search_owner = nullptr;
        if(result != actor_motion::SearchStatus::found) {
            BN_LOG("Actor motion: destination unreachable or path capacity exhausted");
            cancel(&owner); return EventStatus::failed;
        }
        job->path_size = search.copy_reverse_path(job->path, 512);
        job->target_x = search.destination_x();
        job->target_y = search.destination_y();
        job->frame = 0;
        if(job->path_size < 0) { cancel(&owner); return EventStatus::failed; }
        return EventStatus::running;
    }
    if(job->path_size == 0) { job->path_size = -1; return EventStatus::running; }
    const auto next_action = job->path[job->path_size - 1];
    const int dx = std::abs(job->target_x - job->state.x), dy = std::abs(job->target_y - job->state.y);
    const int axis_distance = next_action.action >= actor_motion::up_left ? std::min(dx, dy) : next_action.action == actor_motion::up || next_action.action == actor_motion::down ? dy : dx;
    const int speed = axis_distance > 0 ? std::min(job->speed_q8, axis_distance * 256) : job->speed_q8;
    const int before_x = job->state.x, before_y = job->state.y;
    actor_motion::step(*graphics.getScene(), *job->body, job->state, next_action.action, speed, job->frame == 0, job->options);
    if(job->options.actors && job->state.x == before_x && job->state.y == before_y && next_action.action != actor_motion::idle) {
        job->path_size = -1; return EventStatus::running;
    }
    if(!graphics.apply_script_actor_state(job->actor_id, job->state, next_action.action)) { cancel(&owner); return EventStatus::failed; }
    if(++job->frame >= next_action.frames) { --job->path_size; job->frame = 0; }
    if(job->state.x == job->target_x && job->state.y == job->target_y) { cancel(&owner); return EventStatus::completed; }
    return EventStatus::running;
}
