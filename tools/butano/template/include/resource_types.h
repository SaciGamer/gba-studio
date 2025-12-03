// resource_types.h
#ifndef RESOURCE_TYPES_H
#define RESOURCE_TYPES_H

#include <cstdint>

enum class ResourceType : uint8_t
{
    Unknown = 0,
    Settings,
    Background,
    Scene
};

struct Resource
{
    // Identificação básica
    const char* name;       // chave de lookup (ex.: "settings", "castle_novo")
    const char* id;         // *_ID quando existir

    // Tipo
    ResourceType type;

    // Campos comuns/optionais por tipo (use nullptr/0 quando não aplicável)
    int auto_color;         // *_AUTOCOLOR (Background)
    const char* filename;   // *_FILENAME (Background) / *_BACKGROUND (Scene)

    // Settings extras
    int start_x;            // SETTINGS_STARTX
    int start_y;            // SETTINGS_STARTY
    int move_speed;         // SETTINGS_STARTMOVESPEED
    int anim_speed;         // SETTINGS_STARTANIMSPEED
    const char* direction;  // SETTINGS_STARTDIRECTION

    // Scene extras
    const char* background_id;  // SCENE_*_BACKGROUNDID (Scene) - ID do background da cena
};

#endif // RESOURCE_TYPES_H
