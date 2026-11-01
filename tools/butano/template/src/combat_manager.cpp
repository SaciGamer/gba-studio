#include "combat_manager.h"
#include <cstring>

namespace
{
    int clamp_stat(int value) { return value < 0 ? 0 : (value > 999 ? 999 : value); }
    bool same_text(const char* left, const char* right)
    {
        if(!left || !right) return false;
        for(int index = 0; left[index] || right[index]; ++index)
            if(left[index] != right[index]) return false;
        return true;
    }
}

CombatManager& CombatManager::instance()
{
    static CombatManager manager;
    return manager;
}

void CombatManager::configure(const CombatConfig* config)
{
    _max_projectiles = config ? config->max_projectiles : 64;
    _max_enemies = config ? config->max_enemies : 32;
    _max_pickups = config ? config->max_pickups : 16;
    _player_hit_points = config ? config->player_hit_points : 3;
    _default_damage = config ? config->default_damage : 1;
    _collision_rules = config ? config->collision_rules : nullptr;
    _collision_rules_count = config ? config->collision_rules_count : 0;
    reset();
}

bool CombatManager::set_stat(const char* stat, int value)
{
    if(!stat) return false;
    const int clamped = clamp_stat(value);
    if(same_text(stat, "player_hit_points")) { _player_hit_points = clamped; return true; }
    if(same_text(stat, "default_damage")) { _default_damage = clamped; return true; }
    return false;
}

bool CombatManager::add_stat(const char* stat, int value)
{
    if(!stat) return false;
    if(same_text(stat, "player_hit_points")) return set_stat(stat, _player_hit_points + value);
    if(same_text(stat, "default_damage")) return set_stat(stat, _default_damage + value);
    return false;
}

bool CombatManager::can_collide(const char* source_group, const char* target_group) const
{
    if(!source_group || !target_group) return false;
    for(int index = 0; index < _collision_rules_count; ++index)
    {
        const CombatCollisionRule& rule = _collision_rules[index];
        if(rule.source_group && rule.target_group &&
           std::strcmp(rule.source_group, source_group) == 0 &&
           std::strcmp(rule.target_group, target_group) == 0)
            return true;
    }
    return false;
}

bool CombatManager::overlaps(int ax, int ay, int aw, int ah, int bx, int by, int bw, int bh)
{
    return aw > 0 && ah > 0 && bw > 0 && bh > 0 &&
           ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

void CombatManager::reset()
{
    _projectiles = 0;
    _enemies = 0;
    _pickups = 0;
}

bool CombatManager::reserve_projectile()
{
    if(_projectiles >= _max_projectiles) return false;
    ++_projectiles;
    return true;
}

bool CombatManager::reserve_enemy()
{
    if(_enemies >= _max_enemies) return false;
    ++_enemies;
    return true;
}

bool CombatManager::reserve_pickup()
{
    if(_pickups >= _max_pickups) return false;
    ++_pickups;
    return true;
}

void CombatManager::release_projectile()
{
    if(_projectiles > 0) --_projectiles;
}

void CombatManager::release_enemy()
{
    if(_enemies > 0) --_enemies;
}

void CombatManager::release_pickup()
{
    if(_pickups > 0) --_pickups;
}
