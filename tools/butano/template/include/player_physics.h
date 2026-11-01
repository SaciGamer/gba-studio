#ifndef PLAYER_PHYSICS_H
#define PLAYER_PHYSICS_H

#include <algorithm>

// Serialized event ABI uses Q8 pixels/frame (gravity: pixels/frame squared).
struct MovementEventData {
    const char* actor_id;
    bool reset;
    bool allow_diagonal;
    int gravity_q8;
    int jump_speed_q8;
    int max_fall_speed_q8;
    int air_jumps; // -1: unlimited, 0: ground/ladder only
};
struct StopPhysicsEventData { const char* actor_id; };
struct VerticalImpulseEventData { const char* actor_id; int impulse_q8; bool additive; };
enum class PhysicsSetting { gravity, jump_speed, max_fall_speed, air_jumps, allow_diagonal };
struct PhysicsSettingEventData { const char* actor_id; PhysicsSetting setting; int value; };

struct PlayerPhysics {
    MovementEventData config = { "__PLAYER__", false, true, 64, 1280, 1536, 0 };
    int air_jumps_used = 0;
    bool impulse_pending = false;

    void reset() { *this = PlayerPhysics{}; }
    bool set(PhysicsSetting setting, int value) {
        switch(setting) {
        case PhysicsSetting::gravity: config.gravity_q8 = std::clamp(value, 0, 4096); break;
        case PhysicsSetting::jump_speed: config.jump_speed_q8 = std::clamp(value, 0, 4096); break;
        case PhysicsSetting::max_fall_speed: config.max_fall_speed_q8 = std::clamp(value, 0, 4096); break;
        case PhysicsSetting::air_jumps: config.air_jumps = std::clamp(value, -1, 255); break;
        case PhysicsSetting::allow_diagonal: config.allow_diagonal = value != 0; break;
        default: return false;
        }
        return true;
    }
    void configure(const MovementEventData& data) {
        if(data.reset) { reset(); return; }
        config = data;
        config.gravity_q8 = std::clamp(data.gravity_q8, 0, 4096);
        config.jump_speed_q8 = std::clamp(data.jump_speed_q8, 0, 4096);
        config.max_fall_speed_q8 = std::clamp(data.max_fall_speed_q8, 0, 4096);
        config.air_jumps = std::clamp(data.air_jumps, -1, 255);
        // Changing settings in midair must not refill the jump allowance.
    }
    bool jump(bool pressed, bool supported) {
        if(supported) air_jumps_used = 0;
        if(!pressed || impulse_pending) return false;
        if(supported) return true;
        if(config.air_jumps < 0) return true;
        if(air_jumps_used >= config.air_jumps) return false;
        ++air_jumps_used;
        return true;
    }
    int impulse(int velocity, const VerticalImpulseEventData& data) {
        impulse_pending = true;
        return std::clamp((data.additive ? velocity : 0) + std::clamp(data.impulse_q8, -4096, 4096), -4096, 4096);
    }
};
#endif
