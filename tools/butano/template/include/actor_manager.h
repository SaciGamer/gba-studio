#ifndef ACTOR_MANAGER_H
#define ACTOR_MANAGER_H

#include "bn_array.h"
#include "bn_string.h"

struct ActorHandle { int slot = -1; uint16_t generation = 0; };

class ActorManager {
    struct Slot {
        bn::string<64> actor_id;
        int x = 0;
        int y = 0;
        bool visible = false;
        int animation_speed = 6;
        uint16_t generation = 0;
        bool occupied = false;
    };
    bn::array<Slot, 16> slots;
    bool valid(ActorHandle handle) const;
public:
    static ActorManager& instance();
    ActorHandle spawn(const bn::string<64>& actor_id, int x, int y);
    bool remove(ActorHandle handle);
    bool set_position(ActorHandle handle, int x, int y);
    bool set_visible(ActorHandle handle, bool visible);
    bool get_position(ActorHandle handle, int& x, int& y) const;
    bool set_position_by_id(const bn::string<64>& actor_id, int x, int y);
    bool remove_by_id(const bn::string<64>& actor_id);
    bool set_visible_by_id(const bn::string<64>& actor_id, bool visible);
    bool set_animation_speed_by_id(const bn::string<64>& actor_id, int speed);
    void reset();
};

#endif
