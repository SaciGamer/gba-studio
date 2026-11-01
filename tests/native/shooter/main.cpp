#include <cassert>
#include "shooter_kit.h"

int dispatched = 0;
int cleared = 0;
bool dispatch(const SpawnerTimelineEntry& entry) { return entry.archetype_id && ++dispatched > 0; }
void clear_enemy(const char*) { ++cleared; }

int main()
{
    const SpawnerTimelineEntry entries[] = {
        {0, "enemy", 100, 84, "straight", "powerup"},
        {1, "enemy", 40, 30, "straight", nullptr},
        {0, "boss", 160, 20, "boss", nullptr},
    };
    const SpawnerTimeline timeline[] = {{"wave", entries, 3}};
    const CombatCollisionRule rules[] = {{"player_projectile", "enemy"}};
    const CombatConfig combat{2, 3, 1, 3, 1, rules, 1};
    const ShooterConfig shooter{"wave", "", 1, 8};
    CombatManager::instance().configure(&combat);
    assert(CombatManager::instance().set_stat("player_hit_points", 7));
    assert(CombatManager::instance().add_stat("default_damage", 2));
    assert(ShooterKit::instance().grant("score", 100));
    assert(ShooterKit::instance().grant("bombs", 2));
    assert(ShooterKit::instance().score() == 100 && ShooterKit::instance().bombs() == 2);
    assert(ShooterKit::instance().set_stat("score", 700));
    assert(ShooterKit::instance().add_stat("level", 2));
    assert(ShooterKit::instance().score() == 700 && ShooterKit::instance().level() == 2);
    assert(ShooterKit::instance().set_stat("mode_flags", 3));
    assert(ShooterKit::instance().add_stat("mode_flags", 1));
    assert(ShooterKit::instance().mode_flags() == 4);
    assert(ShooterKit::instance().set_boss_phase(2));
    assert(ShooterKit::instance().boss_phase() == 2);
    assert(ShooterKit::instance().consume_signal("wave_cleared") == false);
    assert(CombatManager::instance().player_hit_points() == 7 && CombatManager::instance().default_damage() == 3);
    SpawnerTimelineManager::instance().configure(timeline, 1);
    ShooterKit::instance().configure(&shooter);
    ShooterKit::instance().set_spawn_callback(dispatch);
    ShooterKit::instance().set_clear_enemy_callback(clear_enemy);
    assert(ShooterKit::instance().start_wave());
    ShooterKit::instance().update();
    SpawnerTimelineEntry spawn{};
    assert(dispatched == 3);
    assert(!ShooterKit::instance().poll_spawn(spawn));
    assert(!ShooterKit::instance().poll_spawn(spawn));
    ShooterKit::instance().update_player(true, 100, 100);
    ShooterHit hit{};
    assert(ShooterKit::instance().poll_hit(hit));
    assert(hit.defeated && hit.damage == 1);
    ShooterDrop drop{};
    assert(ShooterKit::instance().poll_drop(drop));
    assert(drop.drop_id && drop.x == 100 && drop.y == 84);
    assert(ShooterKit::instance().boss_active());
    assert(ShooterKit::instance().boss_hit_points() == 8);
    ShooterKit::instance().clear_enemies();
    assert(ShooterKit::instance().enemy_count() == 0 && cleared == 2);
    assert(ShooterKit::instance().spawn_boss("boss_sprite", 120, 32, "powerup"));
    assert(ShooterKit::instance().boss_active() && ShooterKit::instance().enemy_count() == 1);
    ShooterKit::instance().set_player_enabled(false);
    ShooterKit::instance().update_player(true, 200, 100);
    assert(ShooterKit::instance().projectile_count() == 0);
    ShooterKit::instance().set_player_enabled(true);
    ShooterKit::instance().update_player(true, 200, 100);
    ShooterKit::instance().update_player(true, 200, 100);
    ShooterKit::instance().update_player(true, 200, 100);
    assert(ShooterKit::instance().projectile_count() == 2);
    ShooterProjectile projectile{};
    assert(ShooterKit::instance().poll_projectile(projectile));
    assert(projectile.x == 200 && projectile.y == 84 && projectile.damage == 1);
    return 0;
}
