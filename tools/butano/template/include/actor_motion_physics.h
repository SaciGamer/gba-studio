#ifndef ACTOR_MOTION_PHYSICS_H
#define ACTOR_MOTION_PHYSICS_H

#include <algorithm>
#include "resource_types.h"
#include "player_physics.h"

namespace actor_motion {
inline bool same_text(const char* a, const char* b) {
    if(!a || !b) return a == b;
    while(*a && *a == *b) { ++a; ++b; }
    return *a == *b;
}
enum Action : unsigned char { idle, left, right, up, down, jump_left, jump_right, jump_idle, up_left, up_right, down_left, down_right };
struct Options {
    bool walls = true, actors = false;
    int lock_axis = 0, movement_type = 0;
    const char* actor_id = nullptr;
    bool (*actor_blocked)(const char*, const Sprites&, int, int) = nullptr;
    int (*actor_minimum_distance)(const char*, const Sprites&, int, int) = nullptr;
    const MovementEventData* physics = nullptr;
};
struct State {
    int x = 0, y = 0, velocity_q8 = 0, remainder_q8 = 0, speed_remainder_q8 = 0;
    int jumped_obstacle = -1;
    bool grounded = false, climbing = false;
    unsigned char direction = 1;
};
inline bool clamp_destination(const Scenes& scene, const Sprites& body, int& x, int& y) {
    // Physical bounds belong to the collider. Canvas dimensions and origin
    // only place the artwork around the actor's world coordinate.
    const int min_x = -body.collision_x;
    const int min_y = -body.collision_y;
    const int max_x = scene.scene_width - body.collision_x - std::max(1, body.collision_width);
    const int max_y = scene.scene_height - body.collision_y - std::max(1, body.collision_height);
    if(min_x > max_x || min_y > max_y) return false;
    x = std::clamp(x, min_x, max_x);
    y = std::clamp(y, min_y, max_y);
    return true;
}
inline bool platformer(const Scenes& scene) {
    return same_text(scene.scene_type, "Platformer") || same_text(scene.scene_type, "Platform");
}
inline bool overlaps(const Sprites& body, int x, int y, const SceneCollision& area) {
    return x + body.collision_x < area.x + area.width && x + body.collision_x + std::max(1, body.collision_width) > area.x &&
        y + body.collision_y < area.y + area.height && y + body.collision_y + std::max(1, body.collision_height) > area.y;
}
inline bool ladder(const Scenes& scene, const Sprites& body, int x, int y) {
    if(!platformer(scene)) return false;
    for(int i = 0; scene.collisions && i < scene.collisions_count; ++i) {
        const auto& area = scene.collisions[i];
        if(same_text(area.side, "ladder") && overlaps(body, x, y, area)) return true;
    }
    return false;
}
inline int blocker(const Scenes& scene, const Sprites& body, const State& state, int x, int y, int dx, int dy, const Options& options = {}) {
    if(options.actors && options.actor_blocked && options.actor_blocked(options.actor_id, body, x, y)) return -2;
    for(int i = 0; options.walls && scene.collisions && i < scene.collisions_count; ++i) {
        const auto& area = scene.collisions[i];
        if(!overlaps(body, x, y, area)) continue;
        const char* side = area.side ? area.side : "solid";
        const int bottom = state.y + body.collision_y + std::max(1, body.collision_height);
        if(same_text(side, "solid") ||
           (same_text(side, "top") && dy > 0 && bottom <= area.y) ||
           (same_text(side, "ladder") && platformer(scene) && !state.climbing && dy > 0 && bottom <= area.y) ||
           (same_text(side, "down") && dy < 0 && state.y + body.collision_y >= area.y + area.height) ||
           (same_text(side, "left") && dx > 0 && state.x + body.collision_x + std::max(1, body.collision_width) <= area.x) ||
           (same_text(side, "right") && dx < 0 && state.x + body.collision_x >= area.x + area.width)) return i;
    }
    return -1;
}
inline bool blocked(const Scenes& scene, const Sprites& body, const State& state, int x, int y, int dx, int dy, const Options& options = {}) {
    return blocker(scene, body, state, x, y, dx, dy, options) != -1;
}
inline void step(const Scenes& scene, const Sprites& body, State& state, Action action, int speed_q8, bool jump_pressed = true, const Options& options = {}) {
    const bool platform = platformer(scene);
    state.speed_remainder_q8 += std::clamp(speed_q8, 16, 4096);
    const int speed = state.speed_remainder_q8 / 256;
    state.speed_remainder_q8 %= 256;
    const bool goes_left = action == left || action == jump_left || action == up_left || action == down_left;
    const bool goes_right = action == right || action == jump_right || action == up_right || action == down_right;
    const bool goes_up = action == up || action == up_left || action == up_right;
    const bool goes_down = action == down || action == down_left || action == down_right;
    int dx = goes_left ? -speed : goes_right ? speed : 0;
    int dy = goes_up ? -speed : goes_down ? speed : 0;
    const bool want_jump = action == jump_left || action == jump_right || action == jump_idle;
    const int min_x = -body.collision_x, min_y = -body.collision_y;
    const int max_x = scene.scene_width - body.collision_x - std::max(1, body.collision_width);
    const int max_y = scene.scene_height - body.collision_y - std::max(1, body.collision_height);
    if(min_x > max_x || min_y > max_y) return;
    if(platform) {
        state.grounded = state.velocity_q8 >= 0 && (state.y >= max_y ||
            blocked(scene, body, state, state.x, state.y + 1, 0, 1, options));
        const bool on_ladder = ladder(scene, body, state.x, state.y) || (action == down && ladder(scene, body, state.x, state.y + 1));
        if(!on_ladder) state.climbing = false;
        const int jump_direction = action == jump_left ? -1 : action == jump_right ? 1 : 0;
        const int obstacle = jump_direction ? blocker(scene, body, state, state.x + jump_direction, state.y, jump_direction, 0, options) : -1;
        const bool jumping = want_jump && jump_pressed && state.grounded && obstacle != -1 && obstacle != state.jumped_obstacle;
        if(on_ladder && (goes_up || goes_down) && !jumping) state.climbing = true;
        dy = state.climbing ? dy : 0;
        if(jumping) { state.jumped_obstacle = obstacle; state.velocity_q8 = options.physics ? -options.physics->jump_speed_q8 : -1280; state.remainder_q8 = 0; state.grounded = state.climbing = false; }
        if(state.climbing) { state.velocity_q8 = state.remainder_q8 = 0; state.grounded = false; }
        else if(state.grounded && !jumping) { state.velocity_q8 = state.remainder_q8 = 0; dy = 0; }
        else {
            state.velocity_q8 = std::min(options.physics ? options.physics->max_fall_speed_q8 : 1536,
                state.velocity_q8 + (options.physics ? options.physics->gravity_q8 : 64));
            state.remainder_q8 += state.velocity_q8;
            dy = state.remainder_q8 / 256;
            state.remainder_q8 -= dy * 256;
        }
    }
    if(options.lock_axis == 1) dy = 0;
    if(options.lock_axis == 2) dx = 0;
    if(dx < 0) state.direction = 3;
    else if(dx > 0) state.direction = 1;
    else if(!platform && dy < 0) state.direction = 0;
    else if(!platform && dy > 0) state.direction = 2;
    // Sweep each pixel, preserving one-way collisions and preventing tunnelling.
    for(int i = 0, sign = dx < 0 ? -1 : 1; i < (dx < 0 ? -dx : dx); ++i) {
        const int x = std::clamp(state.x + sign, min_x, max_x);
        if(blocked(scene, body, state, x, state.y, sign, 0, options)) break;
        state.x = x;
    }
    for(int i = 0, sign = dy < 0 ? -1 : 1; i < (dy < 0 ? -dy : dy); ++i) {
        const int y = std::clamp(state.y + sign, min_y, max_y);
        if(blocked(scene, body, state, state.x, y, 0, sign, options) || (y == state.y && platform)) {
            if(platform) { state.grounded = sign > 0; state.velocity_q8 = state.remainder_q8 = 0; }
            break;
        }
        state.y = y;
    }
    if(!platform || !ladder(scene, body, state.x, state.y)) state.climbing = false;
    if(platform && !state.climbing) state.grounded = state.velocity_q8 >= 0 && (state.y >= max_y ||
        blocked(scene, body, state, state.x, state.y + 1, 0, 1, options));
}
}
#endif
