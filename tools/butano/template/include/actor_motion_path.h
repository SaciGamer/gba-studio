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
    static int abs(int value) { return value < 0 ? -value : value; }
    int heuristic(const State& state) const { return abs(state.x - target_x) + abs(state.y - target_y); }
    static bool same(const State& a, const State& b) {
        return a.x == b.x && a.y == b.y && a.velocity_q8 == b.velocity_q8 && a.remainder_q8 == b.remainder_q8 &&
            a.speed_remainder_q8 == b.speed_remainder_q8 && a.climbing == b.climbing && a.grounded == b.grounded && a.jumped_obstacle == b.jumped_obstacle;
    }
public:
    void begin(const Scenes& world, const Sprites& sprite, const State& start, int x, int y, int speed, bool jumps = true) {
        scene = &world; body = &sprite; target_x = x; target_y = y; speed_q8 = speed; allow_jump = jumps;
        count = 1; goal = -1;
        nodes[0] = {}; nodes[0].state = start; nodes[0].score = heuristic(start);
    }
    SearchStatus advance(int budget = 32) {
        if(!scene || !body) return SearchStatus::unreachable;
        if(body->frame_width > scene->scene_width || body->frame_height > scene->scene_height || target_x < body->canvas_origin_x || target_y < body->canvas_origin_y ||
           target_x > scene->scene_width - body->frame_width + body->canvas_origin_x || target_y > scene->scene_height - body->frame_height + body->canvas_origin_y)
            return SearchStatus::unreachable;
        if(blocked(*scene, *body, nodes[0].state, target_x, target_y, 0, 0)) return SearchStatus::unreachable;
        while(budget-- > 0) {
            int current = -1;
            for(int i = 0; i < count; ++i) if(!nodes[i].closed && (current < 0 || nodes[i].score < nodes[current].score)) current = i;
            if(current < 0) return SearchStatus::unreachable;
            if(heuristic(nodes[current].state) == 0) { goal = current; return SearchStatus::found; }
            nodes[current].closed = true;
            const bool platform = platformer(*scene);
            const int duration = heuristic(nodes[current].state) <= 16 * std::max(1, speed_q8 / 256) ? 1 : 8;
            for(int choice = platform ? 0 : 1; choice <= (platform && allow_jump ? 6 : 4); ++choice) {
                const auto action = Action(choice);
                State next = nodes[current].state;
                int frames = 0;
                for(; frames < duration; ++frames) {
                    const int dx = abs(next.x - target_x), dy = abs(next.y - target_y);
                    const int axis_distance = action == up || action == down ? dy : dx;
                    const int capped_speed = axis_distance > 0 ? std::min(speed_q8, axis_distance * 256) : speed_q8;
                    step(*scene, *body, next, action, capped_speed, frames == 0);
                    if(heuristic(next) == 0) { ++frames; break; }
                }
                if(same(next, nodes[current].state)) continue;
                int existing = -1;
                for(int i = 0; i < count; ++i) if(same(next, nodes[i].state)) { existing = i; break; }
                const int cost = nodes[current].cost + frames * std::max(1, speed_q8 / 256);
                if(existing >= 0 && nodes[existing].cost <= cost) continue;
                if(existing < 0) {
                    if(count == MAX_NODES) return SearchStatus::capacity;
                    existing = count++;
                }
                auto& node = nodes[existing];
                node.state = next; node.parent = int16_t(current); node.action = action; node.frames = static_cast<unsigned char>(frames);
                node.cost = cost; node.score = cost + heuristic(next); node.closed = false;
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
};
}
#endif
