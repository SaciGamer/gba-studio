#ifndef ACTOR_MOTION_PATH_H
#define ACTOR_MOTION_PATH_H

#include <cstdint>
#include "actor_motion_physics.h"

namespace actor_motion {
struct PathAction { Action action = idle; unsigned char frames = 0; };
enum class SearchStatus { running, found, unreachable, capacity };
class PathSearch {
    static constexpr int MAX_NODES = 2048;
    struct Node {
        State state;
        int cost = 0, score = 0;
        int16_t parent = -1;
        Action action = idle;
        unsigned char frames = 0;
        bool closed = false;
    };
    Node nodes[MAX_NODES];
    int count = 0, goal = -1;
    int target_x = 0, target_y = 0, speed_q8 = 256;
    const Scenes* scene = nullptr;
    const Sprites* body = nullptr;
    bool allow_jump = true;
    bool allow_nearest = false;
    Options options;
    int nearest = 0, minimum_distance = 0;
    static int abs(int value) { return value < 0 ? -value : value; }
    int heuristic(const State& state) const { return abs(state.x - target_x) + abs(state.y - target_y); }
    int preference(const State& state) const {
        return options.movement_type == 1 ? abs(state.y - target_y) : abs(state.x - target_x);
    }
    SearchStatus finish_nearest(SearchStatus failure) {
        if(!allow_nearest) return failure;
        goal = nearest;
        return SearchStatus::found;
    }
    static bool same(const State& a, const State& b) {
        return a.x == b.x && a.y == b.y && a.velocity_q8 == b.velocity_q8 && a.remainder_q8 == b.remainder_q8 &&
            a.speed_remainder_q8 == b.speed_remainder_q8 && a.climbing == b.climbing && a.grounded == b.grounded && a.jumped_obstacle == b.jumped_obstacle;
    }
public:
    void begin(const Scenes& world, const Sprites& sprite, const State& start, int x, int y, int speed, bool jumps = true, bool nearest_destination = false, const Options& motion_options = {}) {
        scene = &world; body = &sprite; target_x = x; target_y = y; speed_q8 = speed; allow_jump = jumps;
        count = 1; goal = -1;
        options = motion_options;
        if(options.lock_axis == 1) target_y = start.y;
        if(options.lock_axis == 2) target_x = start.x;
        allow_nearest = nearest_destination; nearest = 0; minimum_distance = 0;
        // A larger collider may overlap the floor at another actor's anchor.
        // Align its feet to that support surface, without treating a wall or
        // ceiling as a floor or moving through a platform from below.
        if(platformer(world) && options.walls && options.lock_axis != 1) {
            for(int index = 0; world.collisions && index < world.collisions_count; ++index) {
                const auto& area = world.collisions[index];
                const char* side = area.side ? area.side : "solid";
                if((same_text(side, "solid") || same_text(side, "top")) &&
                   overlaps(sprite, target_x, target_y, area) &&
                   start.y + sprite.collision_y + std::max(1, sprite.collision_height) <= area.y &&
                   target_y + sprite.collision_y < area.y) {
                    target_y = area.y - sprite.collision_y - std::max(1, sprite.collision_height);
                }
            }
        }
        // A platformer cannot remain at a free point above the floor. Resolve
        // actor destinations to their supported position before
        // searching, rather than exploring jumps to reach that point mid-air.
        if(platformer(world) && options.lock_axis != 1 &&
           !blocked(world, sprite, start, target_x, target_y, 0, 0, options) &&
           !ladder(world, sprite, target_x, target_y)) {
            State landing; landing.x = target_x; landing.y = target_y;
            for(int frame = 0; frame < world.scene_height + 32; ++frame) {
                const int previous_y = landing.y;
                step(world, sprite, landing, idle, speed_q8, false, options);
                if(landing.grounded) { target_y = landing.y; break; }
                if(landing.y == previous_y && landing.velocity_q8 >= 1536) break;
            }
        }
        // A target overlapping a solid cannot be approached closer than this
        // collision-footprint distance. This also avoids exploring the entire
        // scene for a door whose anchor is slightly below the player's feet.
        if(allow_nearest && options.walls) for(int index = 0; world.collisions && index < world.collisions_count; ++index) {
            const auto& area = world.collisions[index];
            if(!same_text(area.side ? area.side : "solid", "solid") || !overlaps(sprite, target_x, target_y, area)) continue;
            const int left = target_x + sprite.collision_x, top = target_y + sprite.collision_y;
            const int right = left + std::max(1, sprite.collision_width), bottom = top + std::max(1, sprite.collision_height);
            const int distance = std::min(std::min(right - area.x, area.x + area.width - left),
                                          std::min(bottom - area.y, area.y + area.height - top));
            minimum_distance = std::max(minimum_distance, distance);
        }
        if(allow_nearest && options.actors && options.actor_minimum_distance)
            minimum_distance = std::max(minimum_distance, options.actor_minimum_distance(options.actor_id, sprite, target_x, target_y));
        nodes[0] = {}; nodes[0].state = start; nodes[0].score = heuristic(start);
    }
    SearchStatus advance(int budget = 32) {
        if(!scene || !body) return SearchStatus::unreachable;
        int bounded_x = target_x, bounded_y = target_y;
        if(!clamp_destination(*scene, *body, bounded_x, bounded_y) || bounded_x != target_x || bounded_y != target_y)
            return SearchStatus::unreachable;
        if(!allow_nearest && blocked(*scene, *body, nodes[0].state, target_x, target_y, 0, 0, options)) return SearchStatus::unreachable;
        while(budget-- > 0) {
            int current = -1;
            for(int i = 0; i < count; ++i) if(!nodes[i].closed && (current < 0 || nodes[i].score < nodes[current].score ||
                (nodes[i].score == nodes[current].score && preference(nodes[i].state) < preference(nodes[current].state)))) current = i;
            if(current < 0) return finish_nearest(SearchStatus::unreachable);
            if(heuristic(nodes[current].state) == 0 || (allow_nearest && heuristic(nodes[current].state) == minimum_distance)) { goal = current; return SearchStatus::found; }
            nodes[current].closed = true;
            const bool platform = platformer(*scene);
            const int duration = heuristic(nodes[current].state) <= 16 * std::max(1, speed_q8 / 256) ? 1 : 8;
            const int choices = options.movement_type == 2 ? 12 : (platform && allow_jump ? 7 : 5);
            for(int choice = platform ? 0 : 1; choice < choices; ++choice) {
                const auto action = Action(choice);
                if((choice >= 5 && choice <= 7) && (!platform || !allow_jump)) continue;
                if(options.lock_axis == 1 && (action == up || action == down || choice >= 8)) continue;
                if(options.lock_axis == 2 && (action == left || action == right || action == jump_left || action == jump_right || choice >= 8)) continue;
                State next = nodes[current].state;
                int frames = 0;
                for(; frames < duration; ++frames) {
                    const int dx = abs(next.x - target_x), dy = abs(next.y - target_y);
                    const int axis_distance = choice >= 8 ? std::min(dx, dy) : action == up || action == down ? dy : dx;
                    const int capped_speed = axis_distance > 0 ? std::min(speed_q8, axis_distance * 256) : speed_q8;
                    step(*scene, *body, next, action, capped_speed, frames == 0, options);
                    if(heuristic(next) == 0) { ++frames; break; }
                    if(choice >= 8 && (next.x == target_x || next.y == target_y)) { ++frames; break; }
                }
                if(same(next, nodes[current].state)) continue;
                int existing = -1;
                for(int i = 0; i < count; ++i) if(same(next, nodes[i].state)) { existing = i; break; }
                const int cost = nodes[current].cost + frames * std::max(1, speed_q8 / 256);
                if(existing >= 0 && nodes[existing].cost <= cost) continue;
                if(existing < 0) {
                    if(count == MAX_NODES) return finish_nearest(SearchStatus::capacity);
                    existing = count++;
                }
                auto& node = nodes[existing];
                node.state = next; node.parent = int16_t(current); node.action = action; node.frames = static_cast<unsigned char>(frames);
                node.cost = cost; node.score = cost + heuristic(next); node.closed = false;
                if(heuristic(next) < heuristic(nodes[nearest].state) ||
                   (heuristic(next) == heuristic(nodes[nearest].state) && cost < nodes[nearest].cost)) nearest = existing;
            }
        }
        return SearchStatus::running;
    }
    int copy_reverse_path(PathAction* path, int capacity) const {
        int length = 0;
        for(int index = goal; index > 0; index = nodes[index].parent) {
            if(length == capacity) return -1;
            path[length++] = { nodes[index].action, nodes[index].frames };
        }
        return goal >= 0 ? length : -1;
    }
    int destination_x() const { return goal >= 0 ? nodes[goal].state.x : target_x; }
    int destination_y() const { return goal >= 0 ? nodes[goal].state.y : target_y; }
};
}
#endif
