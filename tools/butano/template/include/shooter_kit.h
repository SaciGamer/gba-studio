#ifndef SHOOTER_KIT_H
#define SHOOTER_KIT_H

#include "combat_manager.h"
#include "spawner_timeline_manager.h"
#include "shooter_config.h"

struct ShooterProjectile
{
    int x = 0;
    int y = 0;
    int damage = 0;
    bool active = false;
};

struct ShooterHit
{
    const char* archetype_id;
    int x;
    int y;
    int damage;
    bool defeated;
};

struct ShooterDrop
{
    const char* drop_id;
    int x;
    int y;
};

class ShooterKit
{
public:
    using SpawnCallback = bool (*)(const SpawnerTimelineEntry& entry);
    using ClearEnemyCallback = void (*)(const char* archetype_id);
    static ShooterKit& instance();
    void configure(const ShooterConfig* config);
    void set_spawn_callback(SpawnCallback callback) { _spawn_callback = callback; }
    void set_clear_enemy_callback(ClearEnemyCallback callback) { _clear_enemy_callback = callback; }
    bool start_wave(const char* wave_id = nullptr);
    bool spawn_boss(const char* archetype_id, int x, int y, const char* drop_id = nullptr);
    bool set_boss_phase(int phase);
    bool set_stat(const char* stat, int value);
    bool add_stat(const char* stat, int value);
    bool consume_signal(const char* signal);
    bool grant(const char* grant, int value);
    void stop();
    void clear_enemies();
    void set_paused(bool paused) { _paused = paused; }
    bool paused() const { return _paused; }
    void set_player_enabled(bool enabled) { _player_enabled = enabled; }
    bool player_enabled() const { return _player_enabled; }
    void update();
    void update_player(bool fire, int player_x, int player_y);
    bool poll_spawn(SpawnerTimelineEntry& entry);
    bool poll_projectile(ShooterProjectile& projectile);
    bool projectile_at(int index, ShooterProjectile& projectile) const;
    bool poll_hit(ShooterHit& hit);
    bool poll_drop(ShooterDrop& drop);
    bool drop_at(int index, ShooterDrop& drop) const;
    bool running() const { return _running; }
    int projectile_count() const { return _projectile_count; }
    int dropped_spawns() const { return _dropped_spawns; }
    int dropped_drops() const { return _dropped_drops; }
    int drop_count() const { return _drop_count; }
    int enemy_count() const { return _enemy_count; }
    bool boss_active() const;
    int boss_hit_points() const;
    int boss_phase() const { return _boss_phase; }
    int weapon_level() const { return _weapon_level; }
    int bombs() const { return _bombs; }
    int shield() const { return _shield; }
    int experience() const { return _experience; }
    int level() const { return _level; }
    int mode_flags() const { return _mode_flags; }
    int score() const { return _score; }

private:
    static constexpr int QUEUE_CAPACITY = 8;
    const ShooterConfig* _config = nullptr;
    bool _running = false;
    bool _paused = false;
    bool _player_enabled = false;
    int _weapon_level = 0;
    int _bombs = 0;
    int _shield = 0;
    int _experience = 0;
    int _level = 0;
    int _mode_flags = 0;
    int _score = 0;
    int _boss_phase = 0;
    bool _wave_cleared_signal = false;
    bool _boss_defeated_signal = false;
    bool _stage_cleared_signal = false;
    bool _player_dead_signal = false;
    int _dropped_spawns = 0;
    int _dropped_drops = 0;
    SpawnerTimelineEntry _queue[QUEUE_CAPACITY]{};
    int _queue_head = 0;
    int _queue_tail = 0;
    int _queue_count = 0;
    static constexpr int PROJECTILE_CAPACITY = 128;
    ShooterProjectile _projectiles[PROJECTILE_CAPACITY]{};
    int _projectile_count = 0;
    struct EnemySlot
    {
        const char* archetype_id;
        int x;
        int y;
        int hit_points;
        bool active;
        const char* drop_id;
        bool boss;
    };
    static constexpr int ENEMY_CAPACITY = 64;
    EnemySlot _enemies[ENEMY_CAPACITY]{};
    int _enemy_count = 0;
    static constexpr int HIT_QUEUE_CAPACITY = 16;
    ShooterHit _hits[HIT_QUEUE_CAPACITY]{};
    int _hit_head = 0;
    int _hit_tail = 0;
    int _hit_count = 0;
    static constexpr int DROP_QUEUE_CAPACITY = 16;
    ShooterDrop _drops[DROP_QUEUE_CAPACITY]{};
    int _drop_head = 0;
    int _drop_tail = 0;
    int _drop_count = 0;
    bool register_enemy(const SpawnerTimelineEntry& entry);
    void queue_hit(const EnemySlot& enemy, int damage);
    void queue_drop(const EnemySlot& enemy);
    void collect_drop(int index);
    SpawnCallback _spawn_callback = nullptr;
    ClearEnemyCallback _clear_enemy_callback = nullptr;
};

#endif
