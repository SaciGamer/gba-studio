#ifndef GAME_SAVE_STATE_H
#define GAME_SAVE_STATE_H
#include <cstdint>
#include <cstddef>
#include "runtime_capacity.h"
inline bool game_save_restoring = false;

inline uint32_t game_save_key(const char* text) {
    uint32_t hash = 2166136261u;
    if(text) for(; *text; ++text) { hash ^= static_cast<unsigned char>(*text); hash *= 16777619u; }
    return hash;
}
struct GameActorState {
    uint32_t id = 0, sprite = 0, state = 0, animation = 0;
    int x = 0, y = 0, velocity = 0, remainder = 0;
    int frame = 0;
    uint8_t direction = 0, animation_speed = 0, visible = 0, mode = 0;
    uint8_t grounded = 0, climbing = 0, reverse = 0;
};
struct GameWorldState {
    uint32_t scene = 0;
    int camera_x = 0, camera_y = 0;
    uint8_t camera_follow = 0;
    uint8_t actor_residency = 0; // Uses prior padding; 0xD7 marks streamed actor records.
    int actors_count = 0;
    GameActorState actors[GBA_STUDIO_MAX_ACTOR_DEFINITIONS + 1]{};
};
static_assert(offsetof(GameWorldState, actors) == 20 && sizeof(GameActorState) == 44, "Keep legacy SRAM record decoding compatible");
struct GameSaveHooks {
    bool (*capture)(GameWorldState&) = nullptr;
    bool (*restore)(const GameWorldState&) = nullptr;
};
#endif
