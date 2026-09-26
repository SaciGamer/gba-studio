// resource_types.h
#ifndef RESOURCE_TYPES_H
#define RESOURCE_TYPES_H

#include <cstdint>
#include "bn_color.h"
#include "event_change_layer.h"

enum class ResourceType : uint8_t
{
    unknown = 0,
    settings,
    background,
    scene,
    sprite,
    tileset,
    tilemap
};

enum class VariableType : uint8_t
{
    number,
    boolean,
    string
};

struct VariableDefinition
{
    const char* id;
    VariableType type;
    int number_value;
    bool boolean_value;
    const char* string_value;
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
    const char* paletteId;
    int x;
    int y;
};

enum class EventStatus : uint8_t
{
    running,
    completed,
    failed
};

struct WaitEventData
{
    int seconds;
    int frames;
    const char* units;
};

struct ButtonWaitEventData {
    const char* button;
    const char* const* buttons;
    int buttons_count;
    bool override_button;
};

struct ButtonHeldEventData {
    const char* const* buttons;
    int buttons_count;
};

struct FadeEventData
{
    int speed;
};

struct CameraEventData
{
    int x;
    int y;
};

struct SceneChangeEventData
{
    const char* scene_id;
    int x;
    int y;
    const char* direction;
    int fade_speed;
};

struct LayerChangeEventData
{
    int layer_id;
    const char* background_id;
};

struct LayerVisibilityEventData
{
    int layer_id;
    bool visible;
};

struct PaletteLayerEventData
{
    int layer_id;
    bool restore_palette;
    const char* const* palette_ids;
};

struct BackgroundPalette
{
    const char* id;
    const bn::color* colors;
    int colors_count;
};

struct ScriptValueData {
    VariableType type;
    bool is_variable;
    const char* variable_id;
    int number_value;
    bool boolean_value;
    const char* string_value;
    const char* button;
};

struct ScriptConditionData {
    ScriptValueData left;
    ScriptValueData right;
    const char* operation;
};

struct ScriptCommandData {
    const char* id;
    const char* command;
    // ponteiro genérico para args, pode ser outro struct
    const void* args;
    const int argCount;
    const uint8_t schemaVersion;
    const int nextIndex;
    const int falseIndex;
    const int loopIndex;
};

struct VariableSetValueData {
    const char* variable_id;
    VariableType type;
    int number_value;
    bool boolean_value;
    const char* string_value;
    const char* source_variable_id;
};

enum class TriggerActivation : uint8_t { enter, exit, stay, interact, touch, input, timer };

struct ScriptProgram {
    const char* id;
    const ScriptCommandData* commands;
    int commands_count;
};

struct ScriptTrigger {
    const char* id;
    int x;
    int y;
    int width;
    int height;
    TriggerActivation activation;
    bool enabled;
    bool once;
    int cooldown_frames;
    const ScriptCommandData* on_enter;
    int on_enter_count;
    const ScriptCommandData* on_leave;
    int on_leave_count;
};

struct ActorMoveEventData {
    const char* actor_id;
    int x;
    int y;
};
struct ActorSpawnEventData { const char* actor_id; int x; int y; };
struct ActorRemoveEventData { const char* actor_id; };
struct ActorVisibilityEventData { const char* actor_id; bool visible; };
struct ActorAnimationSpeedEventData { const char* actor_id; int speed; };
struct ActorPriorityEventData { const char* actor_id; int priority; };
struct SceneActor {
    const char* id;
    const char* sprite_id;
    int x;
    int y;
    const char* direction;
    const ScriptCommandData* on_interact;
    int on_interact_count;
};
struct SceneCollision { const char* id; int x; int y; int width; int height; const char* side; };
struct PlayMusicEventData { const char* music_id; int volume; };
struct PlaySoundEventData { const char* sound_id; int volume; };
struct MusicVolumeEventData { int volume; };
struct DialogueEventData {
    const char* text;
    const char* dialogue_font;
    bool show_frame;
    const char* horizontal_align;
    const char* vertical_align;
    bool animate;
    const char* animation_speed;
};
struct DialogueChoiceEventData {
    const char* prompt;
    const char* option_a;
    const char* option_b;
    const char* result_variable;
};
struct VariableTextEventData {
    const char* variable_id;
    int x;
    int y;
    const char* font;
};
struct ForEventData { const char* variable_id; int start; int end; int step; };

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
    int camera_x;
    int camera_y;
    const char* scene_type;

    // Tilemap extras
    const char* tile_image_type;
    int tile_map_rows;              // TILEMAP_*_HEIGHT (em tiles)
    int tile_map_cols;              // TILEMAP_*_WIDTH (em tiles)
    const int* tile_data;           // TILEMAP_*_DATA - ponteiro para array de dados dos tiles
    // int tile_data_size;          // TILEMAP_*_DATA_SIZE - tamanho do array
    const ScriptTrigger* triggers;
    int triggers_count;
    const SceneActor* actors;
    int actors_count;
    const SceneCollision* collisions;
    int collisions_count;
};

struct SpriteCanvasPiece
{
    int source_x;
    int source_y;
    int width;
    int height;
    int canvas_x;
    int canvas_y;
};

struct ScriptDefinition {
    const char* id;
    const ScriptCommandData* commands;
    int commands_count;
};

struct SpriteCanvasFrameDefinition
{
    const char* state_id;
    const char* state_type;
    const char* animation_id;
    const char* frame_id;
    int canvas_width;
    int canvas_height;
    int first_piece;
    int pieces_count;
};

// A sequence exported by the Sprite Editor. `frames` indexes the generated
// Butano sprite sheet, avoiding assumptions about its layout at runtime.
struct SpriteAnimationDefinition
{
    const char* state_id;
    const char* state_type;
    const char* animation_id;
    const char* animation_type;
    const int* frames;
    int frames_count;
    bool flip_right_to_create_left_frames;
};

struct Sprites
{
    ResourceType type;
    const char* id;
    const char* name;
    const char* filename;
    const char* graphics_name;       // Butano-safe asset identifier
    int image_width;
    int image_height;
    int frame_width;
    int frame_height;
    int animation_speed;
    int idle_frame;
    int canvas_origin_x;
    int canvas_origin_y;
    int collision_x;
    int collision_y;
    int collision_width;
    int collision_height;
    const SpriteAnimationDefinition* animations;
    int animations_count;
    const SpriteCanvasFrameDefinition* canvas_frames;
    int canvas_frames_count;
    const SpriteCanvasPiece* canvas_pieces;
    int canvas_pieces_count;
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
    int fade_direction;             // SETTINGS_FADEDIRECTION (0 white, 1 black)

    const char* player_sprite_id;   // SETTINGS_PLAYERSPRITEID
    const char* ui_cursor_image;    // SETTINGS_UICURSORIMAGE
    const char* ui_frame_image;     // SETTINGS_UIFRAMEIMAGE
    int player_frame_width;         // SETTINGS_PLAYERFRAMEWIDTH
    int player_frame_height;        // SETTINGS_PLAYERFRAMEHEIGHT
    int player_frames_per_direction;// SETTINGS_PLAYERFRAMESPERDIRECTION
    int player_anim_speed;          // SETTINGS_PLAYERANIMSPEED
    int player_idle_frame;          // SETTINGS_PLAYERIDLEFRAME
    const SpriteCanvasFrameDefinition* player_canvas_frames;
    int player_canvas_frames_count;
    const SpriteCanvasPiece* player_canvas_pieces;
    int player_canvas_pieces_count;
};

#endif // RESOURCE_TYPES_H
