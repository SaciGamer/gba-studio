#include "shooter_kit.h"

#if defined(__arm__) || defined(__thumb__)
    #define SHOOTER_KIT_EWRAM_BSS __attribute__((section(".sbss")))
#else
    #define SHOOTER_KIT_EWRAM_BSS
#endif

namespace
{
    bool is_boss_pattern(const char* pattern)
    {
        if(!pattern) return false;
        const char expected[] = "boss";
        for(int index = 0; expected[index] || pattern[index]; ++index)
            if(expected[index] != pattern[index]) return false;
        return true;
    }

    bool same_text(const char* left, const char* right)
    {
        if(!left || !right) return false;
        for(int index = 0; left[index] || right[index]; ++index)
            if(left[index] != right[index]) return false;
        return true;
    }

    int clamp_grant(int value)
    {
        return value < 0 ? 0 : (value > 9999 ? 9999 : value);
    }
}

ShooterKit& ShooterKit::instance()
{
    // The fixed shooter pools are gameplay data rather than fast code/state;
    // keep them in EWRAM so they do not consume the small IWRAM budget.
    SHOOTER_KIT_EWRAM_BSS static ShooterKit kit;
    return kit;
}

void ShooterKit::configure(const ShooterConfig* config)
{
    _config = config;
    _player_enabled = true;
    stop();
}

bool ShooterKit::start_wave(const char* wave_id)
{
    const char* selected = wave_id;
    if((!selected || selected[0] == '\0') && _config) selected = _config->default_wave_id;
    if(!selected || !SpawnerTimelineManager::instance().start(selected)) return false;
    _running = true;
    _paused = false;
    _dropped_spawns = 0;
    _dropped_drops = 0;
    _wave_cleared_signal = false;
    _boss_defeated_signal = false;
    _stage_cleared_signal = false;
    _player_dead_signal = false;
    while(_drop_count > 0)
    {
        CombatManager::instance().release_pickup();
        --_drop_count;
    }
    _drop_head = 0;
    _drop_tail = 0;
    _queue_head = 0;
    _queue_tail = 0;
    _queue_count = 0;
    return true;
}

bool ShooterKit::spawn_boss(const char* archetype_id, int x, int y, const char* drop_id)
{
    if(!archetype_id || archetype_id[0] == '\0' || !CombatManager::instance().reserve_enemy()) return false;
    const SpawnerTimelineEntry entry{0, archetype_id, x, y, "boss", drop_id};
    if(_spawn_callback && _spawn_callback(entry))
    {
        if(register_enemy(entry)) return true;
        CombatManager::instance().release_enemy();
        return false;
    }
    if(_queue_count >= QUEUE_CAPACITY)
    {
        CombatManager::instance().release_enemy();
        return false;
    }
    _queue[_queue_tail] = entry;
    _queue_tail = (_queue_tail + 1) % QUEUE_CAPACITY;
    ++_queue_count;
    return true;
}

bool ShooterKit::set_boss_phase(int phase)
{
    if(phase < 0 || phase > 7) return false;
    _boss_phase = phase;
    return true;
}

bool ShooterKit::set_stat(const char* stat, int value)
{
    if(!stat || value < 0 || value > 9999) return false;
    if(same_text(stat, "player_hit_points") || same_text(stat, "default_damage"))
        return CombatManager::instance().set_stat(stat, value);
    if(same_text(stat, "score")) { _score = value; return true; }
    if(same_text(stat, "level")) { _level = value; return true; }
    if(same_text(stat, "bombs")) { _bombs = value; return true; }
    if(same_text(stat, "shield")) { _shield = value; return true; }
    if(same_text(stat, "experience")) { _experience = value; return true; }
    if(same_text(stat, "mode_flags")) { _mode_flags = value; return true; }
    return false;
}

bool ShooterKit::add_stat(const char* stat, int value)
{
    if(!stat || value < -9999 || value > 9999) return false;
    if(same_text(stat, "player_hit_points") || same_text(stat, "default_damage"))
        return CombatManager::instance().add_stat(stat, value);
    int current = 0;
    if(same_text(stat, "score")) current = _score;
    else if(same_text(stat, "level")) current = _level;
    else if(same_text(stat, "bombs")) current = _bombs;
    else if(same_text(stat, "shield")) current = _shield;
    else if(same_text(stat, "experience")) current = _experience;
    else if(same_text(stat, "mode_flags")) current = _mode_flags;
    else return false;
    const int next = current + value;
    return set_stat(stat, next < 0 ? 0 : next > 9999 ? 9999 : next);
}

bool ShooterKit::consume_signal(const char* signal)
{
    if(!signal) return false;
    if(same_text(signal, "wave_cleared") && _wave_cleared_signal) { _wave_cleared_signal = false; return true; }
    if(same_text(signal, "boss_defeated") && _boss_defeated_signal) { _boss_defeated_signal = false; return true; }
    if(same_text(signal, "stage_cleared") && _stage_cleared_signal) { _stage_cleared_signal = false; return true; }
    if(same_text(signal, "player_dead") && _player_dead_signal) { _player_dead_signal = false; return true; }
    return false;
}

bool ShooterKit::grant(const char* grant_name, int value)
{
    if(!grant_name || value < 0) return false;
    const int amount = clamp_grant(value);
    if(same_text(grant_name, "weapon")) { _weapon_level = amount; return true; }
    if(same_text(grant_name, "bombs")) { _bombs = clamp_grant(_bombs + amount); return true; }
    if(same_text(grant_name, "shield")) { _shield = clamp_grant(_shield + amount); return true; }
    if(same_text(grant_name, "experience")) { _experience = clamp_grant(_experience + amount); return true; }
    if(same_text(grant_name, "score")) { _score = clamp_grant(_score + amount); return true; }
    return false;
}

void ShooterKit::stop()
{
    _running = false;
    _paused = false;
    _player_enabled = true;
    _weapon_level = 0;
    _bombs = 0;
    _shield = 0;
    _experience = 0;
    _score = 0;
    _level = 0;
    _mode_flags = 0;
    _boss_phase = 0;
    _wave_cleared_signal = false;
    _boss_defeated_signal = false;
    _stage_cleared_signal = false;
    _player_dead_signal = false;
    SpawnerTimelineManager::instance().stop();
    _queue_head = 0;
    _queue_tail = 0;
    _queue_count = 0;
    for(ShooterProjectile& projectile : _projectiles)
    {
        if(projectile.active) CombatManager::instance().release_projectile();
        projectile = ShooterProjectile();
    }
    _projectile_count = 0;
    for(EnemySlot& enemy : _enemies) enemy = EnemySlot();
    _enemy_count = 0;
    _hit_head = 0;
    _hit_tail = 0;
    _hit_count = 0;
    while(_drop_count > 0)
    {
        CombatManager::instance().release_pickup();
        --_drop_count;
    }
    _drop_head = 0;
    _drop_tail = 0;
    _drop_count = 0;
}

void ShooterKit::clear_enemies()
{
    for(EnemySlot& enemy : _enemies)
    {
        if(!enemy.active) continue;
        if(_clear_enemy_callback && enemy.archetype_id) _clear_enemy_callback(enemy.archetype_id);
        CombatManager::instance().release_enemy();
        enemy = EnemySlot();
    }
    _enemy_count = 0;
}

void ShooterKit::update()
{
    if(!_running || _paused) return;
    auto& timeline = SpawnerTimelineManager::instance();
    timeline.update();
    SpawnerTimelineEntry entry{};
    while(timeline.pop_due(entry))
    {
        if(!CombatManager::instance().reserve_enemy())
        {
            ++_dropped_spawns;
            continue;
        }
        if(_spawn_callback && _spawn_callback(entry))
        {
            if(!register_enemy(entry))
            {
                CombatManager::instance().release_enemy();
                ++_dropped_spawns;
            }
            continue;
        }
        if(_queue_count >= QUEUE_CAPACITY)
        {
            CombatManager::instance().release_enemy();
            ++_dropped_spawns;
            continue;
        }
        _queue[_queue_tail] = entry;
        _queue_tail = (_queue_tail + 1) % QUEUE_CAPACITY;
        ++_queue_count;
    }
    if(!timeline.active() && _queue_count == 0)
    {
        if(_running)
        {
            _wave_cleared_signal = true;
            _stage_cleared_signal = true;
        }
        _running = false;
    }
}

bool ShooterKit::poll_spawn(SpawnerTimelineEntry& entry)
{
    if(_queue_count == 0) return false;
    entry = _queue[_queue_head];
    _queue_head = (_queue_head + 1) % QUEUE_CAPACITY;
    --_queue_count;
    if(!register_enemy(entry))
    {
        CombatManager::instance().release_enemy();
        return false;
    }
    return true;
}

bool ShooterKit::register_enemy(const SpawnerTimelineEntry& entry)
{
    for(EnemySlot& enemy : _enemies)
    {
        if(!enemy.active)
        {
            enemy.archetype_id = entry.archetype_id;
            enemy.x = entry.x;
            enemy.y = entry.y;
            enemy.boss = is_boss_pattern(entry.pattern_id);
            enemy.hit_points = enemy.boss && _config && _config->boss_hit_points > 0 ? _config->boss_hit_points : 1;
            enemy.active = true;
            enemy.drop_id = entry.drop_id;
            ++_enemy_count;
            return true;
        }
    }
    return false;
}

void ShooterKit::queue_hit(const EnemySlot& enemy, int damage)
{
    if(_hit_count >= HIT_QUEUE_CAPACITY) return;
    ShooterHit& hit = _hits[_hit_tail];
    hit.archetype_id = enemy.archetype_id;
    hit.x = enemy.x;
    hit.y = enemy.y;
    hit.damage = damage;
    hit.defeated = enemy.hit_points <= 0;
    _hit_tail = (_hit_tail + 1) % HIT_QUEUE_CAPACITY;
    ++_hit_count;
}

void ShooterKit::queue_drop(const EnemySlot& enemy)
{
    if(!enemy.drop_id || enemy.drop_id[0] == '\0') return;
    const bool reserved = CombatManager::instance().reserve_pickup();
    if(!reserved || _drop_count >= DROP_QUEUE_CAPACITY)
    {
        if(reserved) CombatManager::instance().release_pickup();
        ++_dropped_drops;
        return;
    }
    _drops[_drop_tail] = {enemy.drop_id, enemy.x, enemy.y};
    _drop_tail = (_drop_tail + 1) % DROP_QUEUE_CAPACITY;
    ++_drop_count;
}

void ShooterKit::update_player(bool fire, int player_x, int player_y)
{
    if(!_player_enabled) return;
    for(ShooterProjectile& projectile : _projectiles)
    {
        if(!projectile.active) continue;
        projectile.y -= 4;
        if(projectile.y < -32)
        {
            projectile.active = false;
            CombatManager::instance().release_projectile();
            if(_projectile_count > 0) --_projectile_count;
        }
        for(EnemySlot& enemy : _enemies)
        {
            if(!enemy.active || !CombatManager::overlaps(projectile.x, projectile.y, 8, 8, enemy.x, enemy.y, 16, 16)) continue;
            enemy.hit_points -= projectile.damage;
            queue_hit(enemy, projectile.damage);
            projectile.active = false;
            CombatManager::instance().release_projectile();
            if(_projectile_count > 0) --_projectile_count;
            if(enemy.hit_points <= 0)
            {
                if(enemy.boss) _boss_defeated_signal = true;
                queue_drop(enemy);
                enemy.active = false;
                CombatManager::instance().release_enemy();
                if(_enemy_count > 0) --_enemy_count;
            }
            break;
        }
    }
    for(EnemySlot& enemy : _enemies)
    {
        if(!enemy.active || !CombatManager::overlaps(player_x, player_y, 8, 8, enemy.x, enemy.y, 16, 16)) continue;
        if(_shield > 0) --_shield;
        else if(CombatManager::instance().player_hit_points() > 0)
            CombatManager::instance().add_stat("player_hit_points", -1);
        if(CombatManager::instance().player_hit_points() == 0) _player_dead_signal = true;
        break;
    }
    for(int drop_index = _drop_count - 1; drop_index >= 0; --drop_index)
    {
        ShooterDrop drop{};
        if(drop_at(drop_index, drop) && CombatManager::overlaps(player_x, player_y, 8, 8, drop.x, drop.y, 16, 16))
            collect_drop(drop_index);
    }
    if(!fire || !CombatManager::instance().reserve_projectile()) return;
    for(ShooterProjectile& projectile : _projectiles)
    {
        if(!projectile.active)
        {
            projectile = { player_x, player_y - 8,
                _config ? _config->default_damage : CombatManager::instance().default_damage(), true };
            ++_projectile_count;

            // Resolve a hit on the frame the projectile is spawned as well. This
            // keeps editor/runtime previews deterministic for point-blank shots.
            for(EnemySlot& enemy : _enemies)
            {
                if(!enemy.active || !CombatManager::overlaps(projectile.x, projectile.y, 8, 8,
                                                              enemy.x, enemy.y, 16, 16)) continue;
                enemy.hit_points -= projectile.damage;
                queue_hit(enemy, projectile.damage);
                projectile.active = false;
                CombatManager::instance().release_projectile();
                if(_projectile_count > 0) --_projectile_count;
                if(enemy.hit_points <= 0)
                {
                    queue_drop(enemy);
                    enemy.active = false;
                    CombatManager::instance().release_enemy();
                    if(_enemy_count > 0) --_enemy_count;
                }
                break;
            }
            return;
        }
    }
    CombatManager::instance().release_projectile();
}

bool ShooterKit::poll_projectile(ShooterProjectile& projectile)
{
    for(ShooterProjectile& candidate : _projectiles)
    {
        if(candidate.active)
        {
            projectile = candidate;
            candidate.active = false;
            CombatManager::instance().release_projectile();
            if(_projectile_count > 0) --_projectile_count;
            return true;
        }
    }
    return false;
}

bool ShooterKit::projectile_at(int index, ShooterProjectile& projectile) const
{
    if(index < 0 || index >= PROJECTILE_CAPACITY || !_projectiles[index].active) return false;
    projectile = _projectiles[index];
    return true;
}

bool ShooterKit::poll_hit(ShooterHit& hit)
{
    if(_hit_count == 0) return false;
    hit = _hits[_hit_head];
    _hit_head = (_hit_head + 1) % HIT_QUEUE_CAPACITY;
    --_hit_count;
    return true;
}

bool ShooterKit::poll_drop(ShooterDrop& drop)
{
    if(_drop_count == 0) return false;
    drop = _drops[_drop_head];
    _drop_head = (_drop_head + 1) % DROP_QUEUE_CAPACITY;
    --_drop_count;
    CombatManager::instance().release_pickup();
    return true;
}

bool ShooterKit::boss_active() const
{
    for(const EnemySlot& enemy : _enemies)
        if(enemy.active && enemy.boss) return true;
    return false;
}

int ShooterKit::boss_hit_points() const
{
    for(const EnemySlot& enemy : _enemies)
        if(enemy.active && enemy.boss) return enemy.hit_points;
    return 0;
}

bool ShooterKit::drop_at(int index, ShooterDrop& drop) const
{
    if(index < 0 || index >= _drop_count) return false;
    drop = _drops[(_drop_head + index) % DROP_QUEUE_CAPACITY];
    return true;
}

void ShooterKit::collect_drop(int index)
{
    if(index < 0 || index >= _drop_count) return;
    for(int offset = index; offset + 1 < _drop_count; ++offset)
        _drops[(_drop_head + offset) % DROP_QUEUE_CAPACITY] = _drops[(_drop_head + offset + 1) % DROP_QUEUE_CAPACITY];
    _drop_tail = (_drop_tail - 1 + DROP_QUEUE_CAPACITY) % DROP_QUEUE_CAPACITY;
    --_drop_count;
    CombatManager::instance().release_pickup();
}
