#include <cassert>
#include "combat_manager.h"

int main()
{
    const CombatCollisionRule rules[] = {{"player_projectile", "enemy"}};
    const CombatConfig config{2, 1, 1, 5, 3, rules, 1};
    auto& manager = CombatManager::instance();
    manager.configure(&config);
    assert(manager.player_hit_points() == 5);
    assert(manager.default_damage() == 3);
    assert(manager.can_collide("player_projectile", "enemy"));
    assert(!manager.can_collide("enemy", "player_projectile"));
    assert(CombatManager::overlaps(0, 0, 8, 8, 4, 4, 8, 8));
    assert(!CombatManager::overlaps(0, 0, 8, 8, 8, 0, 8, 8));
    assert(manager.reserve_projectile());
    assert(manager.reserve_projectile());
    assert(!manager.reserve_projectile());
    manager.release_projectile();
    assert(manager.reserve_projectile());
    assert(manager.reserve_enemy());
    assert(!manager.reserve_enemy());
    assert(manager.reserve_pickup());
    assert(!manager.reserve_pickup());
    manager.configure(nullptr);
    assert(manager.max_projectiles() == 64);
    assert(manager.reserve_projectile());
    return 0;
}
