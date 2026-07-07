// resource_types.h
#ifndef RESOURCE_TYPES_H
#define RESOURCE_TYPES_H

#include <cstdint>

enum class ResourceType : uint8_t
{
    unknown = 0,
    settings,
    background,
    scene,
    tileset,
    tilemap
};

// struct Resource
// {
//     // Identificação básica
//     const char* name;       // chave de lookup (ex.: "settings", "castle_novo")
//     const char* id;         // *_ID quando existir

//     // Tipo
//     ResourceType type;

//     // Campos comuns/optionais por tipo (use nullptr/0 quando não aplicável)
//     int auto_color;         // *_AUTOCOLOR (Background)
//     const char* filename;   // *_FILENAME (Background/Tileset) / *_BACKGROUND (Scene) / *_TILESET (Tileset)

//     // Settings extras
//     int start_x;            // SETTINGS_STARTX
//     int start_y;            // SETTINGS_STARTY
//     int move_speed;         // SETTINGS_STARTMOVESPEED
//     int anim_speed;         // SETTINGS_STARTANIMSPEED
//     const char* direction;  // SETTINGS_STARTDIRECTION

//     // Scene extras
//     const char* background_id;  // SCENE_*_BACKGROUNDID (Scene) - ID do background da cena
//     const char* tileset_id;     // SCENE_*_TILESETID (Scene) - ID do tileset da cena
//     const char* tilemap_id;     // SCENE_*_TILEMAPID (Scene) - ID do tilemap da cena

//     // Tileset extras
//     int tile_width;         // TILESET_*_TILEWIDTH
//     int tile_height;        // TILESET_*_TILEHEIGHT
//     int tileset_width;      // TILESET_*_WIDTH (em pixels)
//     int tileset_height;     // TILESET_*_HEIGHT (em pixels)

//     // Tilemap extras
//     int map_width;          // TILEMAP_*_WIDTH (em tiles)
//     int map_height;         // TILEMAP_*_HEIGHT (em tiles)
//     const int* tile_data;   // TILEMAP_*_DATA - ponteiro para array de dados dos tiles
//     int tile_data_size;     // TILEMAP_*_DATA_SIZE - tamanho do array
// };

struct Backgrounds
{
    ResourceType type;          // Tipo

    const char* id;             // *_ID quando existir
    
    int auto_color;             // *_AUTOCOLOR (Background)
    const char* name;           // chave de lookup (ex.: "settings", "castle_novo")
    const char* filename;       // *_FILENAME (Background/Tileset) / *_BACKGROUND (Scene) / *_TILESET (Tileset)

    int image_width;            // IMAGE_WIDTH
    int image_height;           // IMAGE_HEIGHT
    const char* tile_colors;    // TILE_COLORS

};

struct SceneLayer
{
    int layerId;                // LAYER_ID
    const char* backgroundId;   // BACKGROUND_ID
    const char* name;
    const char* path;
};

struct ScriptCommandData {
    const char* id;
    const char* command;
    // ponteiro genérico para args, pode ser outro struct
    const void* args;
    const int argCount;
    // const void* child;
};

struct Scenes
{
    ResourceType type;                  // Tipo
    const char* id;                     // id da scene
    const char* name;                   // nome do arquivo de scene

    const ScriptCommandData* onInitScripts;     // scripts de inicialização
    int onInitCount;

    // const ScriptCommandData* onPlayHit1Scripts;  // scripts de colisão 1 (futuro)
    // int onPlayHit1Count;
    // const ScriptCommandData* onPlayHit2Scripts;  // scripts de colisão 2 (futuro)
    // int onPlayHit2Count;
    // const ScriptCommandData* onPlayHit3Scripts;  // scripts de colisão 3 (futuro)
    // int onPlayHit3Count;

    // const char* background_id;           // ID do background da cena
    const SceneLayer* backgrounds_layers;   // Backgrounds com Layers
    const int backgrounds_layers_size;      // Tanho do backgrounds_layers

    const char* tileset_id;             // ID do tileset da cena
    // const char* tilemap_id;          // ID do tilemap da cena
    
    // Scene
    int scene_width;
    int scene_height;
    const char* scene_type;

    // Tilemap extras
    const char* tile_image_type;
    int tile_map_rows;              // TILEMAP_*_HEIGHT (em tiles)
    int tile_map_cols;              // TILEMAP_*_WIDTH (em tiles)
    const int* tile_data;           // TILEMAP_*_DATA - ponteiro para array de dados dos tiles
    // int tile_data_size;          // TILEMAP_*_DATA_SIZE - tamanho do array
};

struct Settings
{
    ResourceType type;              // Tipo

    // Settings extras
    const char* start_scene_id;     // SETTINGS_STARTSCENEID
    int start_x;                    // SETTINGS_STARTX
    int start_y;                    // SETTINGS_STARTY
    int move_speed;                 // SETTINGS_STARTMOVESPEED
    int anim_speed;                 // SETTINGS_STARTANIMSPEED
    const char* direction;          // SETTINGS_STARTDIRECTION

    int color_mode;                 // COLOR_MODE

};

#endif // RESOURCE_TYPES_H
