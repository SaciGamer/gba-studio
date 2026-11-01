#ifndef COMBAT_MANAGER_H
#define COMBAT_MANAGER_H

#include "combat_config.h"

// Runtime-facing, fixed-capacity combat budget.  Kits reserve slots through
// this service instead of allocating projectiles/enemies in the frame loop.
class CombatManager
{
public:
    static CombatManager& instance();

    void configure(const CombatConfig* config);
    void reset();

    int max_projectiles() const { return _max_projectiles; }
    int max_enemies() const { return _max_enemies; }
    int max_pickups() const { return _max_pickups; }
    int player_hit_points() const { return _player_hit_points; }
    int default_damage() const { return _default_damage; }
    bool set_stat(const char* stat, int value);
    bool add_stat(const char* stat, int value);
    bool can_collide(const char* source_group, const char* target_group) const;
    static bool overlaps(int ax, int ay, int aw, int ah, int bx, int by, int bw, int bh);

    bool reserve_projectile();
    bool reserve_enemy();
    bool reserve_pickup();
    void release_projectile();
    void release_enemy();
    void release_pickup();

private:
    int _max_projectiles = 64;
    int _max_enemies = 32;
    int _max_pickups = 16;
    int _player_hit_points = 3;
    int _default_damage = 1;
    const CombatCollisionRule* _collision_rules = nullptr;
    int _collision_rules_count = 0;
    int _projectiles = 0;
    int _enemies = 0;
    int _pickups = 0;
};

#endif
