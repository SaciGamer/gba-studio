#ifndef COMBAT_CONFIG_H
#define COMBAT_CONFIG_H

struct CombatCollisionRule
{
    const char* source_group;
    const char* target_group;
};

// Data-only combat budget shared by the generated settings resource and
// runtime kits. It deliberately has no Butano dependency.
struct CombatConfig
{
    int max_projectiles;
    int max_enemies;
    int max_pickups;
    int player_hit_points;
    int default_damage;
    const CombatCollisionRule* collision_rules;
    int collision_rules_count;
};

#endif
