#ifndef SHOOTER_CONFIG_H
#define SHOOTER_CONFIG_H

// Data-only shooter settings emitted by the project resource builder.
struct ShooterConfig
{
    const char* default_wave_id;
    const char* projectile_sprite_id;
    int player_hit_points;
    int default_damage;
    int boss_hit_points;
};

#endif
