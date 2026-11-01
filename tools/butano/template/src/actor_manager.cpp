#include "actor_manager.h"

ActorManager& ActorManager::instance()
{
#if defined(__arm__) || defined(__thumb__)
    static __attribute__((section(".sbss"))) ActorManager manager;
#else
    static ActorManager manager;
#endif
    return manager;
}

bool ActorManager::valid(ActorHandle handle) const
{
    return handle.slot >= 0 && handle.slot < MAX_ACTORS &&
           slots[handle.slot].occupied && slots[handle.slot].generation == handle.generation;
}

ActorHandle ActorManager::spawn(const bn::string<64>& actor_id, int x, int y)
{
    for(int index = 0; index < MAX_ACTORS; ++index) {
        Slot& slot = slots[index];
        if(slot.occupied && slot.actor_id == actor_id) {
            slot.x = x;
            slot.y = y;
            slot.visible = true;
            return { index, slot.generation };
        }
    }
    for(int index = 0; index < MAX_ACTORS; ++index) {
        Slot& slot = slots[index];
        if(!slot.occupied) {
            slot.actor_id = actor_id;
            slot.x = x; slot.y = y; slot.visible = true; slot.occupied = true;
            ++slot.generation;
            return { index, slot.generation };
        }
    }
    return {};
}

bool ActorManager::remove(ActorHandle handle)
{
    if(!valid(handle)) return false;
    slots[handle.slot].occupied = false;
    slots[handle.slot].visible = false;
    return true;
}

bool ActorManager::set_position(ActorHandle handle, int x, int y)
{
    if(!valid(handle)) return false;
    slots[handle.slot].x = x; slots[handle.slot].y = y;
    return true;
}

bool ActorManager::set_visible(ActorHandle handle, bool visible)
{
    if(!valid(handle)) return false;
    slots[handle.slot].visible = visible;
    return true;
}

bool ActorManager::get_position(ActorHandle handle, int& x, int& y) const
{
    if(!valid(handle)) return false;
    x = slots[handle.slot].x; y = slots[handle.slot].y;
    return true;
}

bool ActorManager::set_position_by_id(const bn::string<64>& actor_id, int x, int y)
{
    for(int index = 0; index < MAX_ACTORS; ++index) {
        if(slots[index].occupied && slots[index].actor_id == actor_id) {
            return set_position({ index, slots[index].generation }, x, y);
        }
    }
    return false;
}

bool ActorManager::remove_by_id(const bn::string<64>& actor_id)
{
    for(int index = 0; index < MAX_ACTORS; ++index)
        if(slots[index].occupied && slots[index].actor_id == actor_id)
            return remove({ index, slots[index].generation });
    return false;
}

bool ActorManager::set_visible_by_id(const bn::string<64>& actor_id, bool visible)
{
    for(int index = 0; index < MAX_ACTORS; ++index)
        if(slots[index].occupied && slots[index].actor_id == actor_id)
            return set_visible({ index, slots[index].generation }, visible);
    return false;
}

bool ActorManager::set_animation_speed_by_id(const bn::string<64>& actor_id, int speed)
{
    if(speed < 0 || speed > 60) return false;
    for(int index = 0; index < MAX_ACTORS; ++index)
        if(slots[index].occupied && slots[index].actor_id == actor_id) {
            slots[index].animation_speed = speed;
            return true;
        }
    return false;
}

void ActorManager::reset()
{
    // Reset one slot at a time; a full-capacity temporary would crowd IWRAM.
    for(auto& slot : slots) slot = Slot();
}
