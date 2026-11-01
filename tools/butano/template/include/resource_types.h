// resource_types.h
#ifndef RESOURCE_TYPES_H
#define RESOURCE_TYPES_H

#include <cstdint>
#include "player_physics.h"
#include "numeric_values.h"
#include "bn_color.h"
#include "event_change_layer.h"
#include "combat_config.h"
#include "spawner_timeline.h"
#include "shooter_config.h"

// Generated resource tables can contain many relocated pointers. Keeping
// these tables in EWRAM prevents otherwise valid projects from exhausting
// the 32 KiB IWRAM region used by the runtime. This belongs to the editable
// template and does not modify the Butano library.
#ifndef GBA_STUDIO_EWRAM_DATA
#define GBA_STUDIO_EWRAM_DATA __attribute__((section(".ewram")))
#endif
#ifndef GBA_STUDIO_EWRAM_SCRIPT_DATA
#define GBA_STUDIO_EWRAM_SCRIPT_DATA __attribute__((section(".ewram_script_data")))
#endif

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
    const char* symbol = nullptr;
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
//     int start_x_pixels;            // SETTINGS_STARTX (tiles converted to pixels)
//     int start_y_pixels;            // SETTINGS_STARTY (tiles converted to pixels)
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

    const char* id;             // *_ID quando existir
    
    const char* name;           // chave de lookup (ex.: "settings", "castle_novo")

    int image_width;            // IMAGE_WIDTH
    int image_height;           // IMAGE_HEIGHT

};

struct RegularBgMapCellOverride
{
    int cell_index;
    uint16_t cell;
};

struct SceneLayer
{
    int layerId;                // LAYER_ID
    const char* backgroundId;   // BACKGROUND_ID
    const char* paletteId;
    int x;
    int y;
    int z_order;                 // ordering among backgrounds
    const RegularBgMapCellOverride* map_cell_overrides;
    int map_cell_overrides_count;
    bool affine = false;
    const char* affine_graphics_name = nullptr;
};

struct InputBinding
{
    const char* action;
    const char* const* buttons;
    int buttons_count;
};

struct SceneInputMap
{
    const char* scene_type;
    const InputBinding* bindings;
    int bindings_count;
};

struct TileAnimation
{
    int layer_id;
    int target_tile_index;
    const int* frame_tile_indices;
    int frames_count;
    int duration_frames;
    bool loop;
    int initial_frame;
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
    const char* const* buttons;
    int buttons_count;
    bool override_button;
};
struct ButtonActionEventData { const char* button; bool custom; };

struct ButtonScriptRemoveEventData {
    const char* const* buttons;
    int buttons_count;
};

struct ButtonPressWaitEventData {
    const char* const* buttons;
    int buttons_count;
};

struct WaitInputEventData {
    const char* action;
    int timeout_frames;
};

struct TriggerEnabledEventData {
    const char* trigger_id;
    bool enabled;
};

struct ActorFacingEventData {
    const char* actor_id;
    const char* target_actor_id;
    bool look_x = true;
    bool look_y = true;
    int distance_x = 0;
    int distance_y = 0;
};

struct ButtonHeldEventData {
    const char* const* buttons;
    int buttons_count;
};

struct InputGroupEventData {
    const char* group;
    bool enabled;
};

struct RumbleEventData {
    int duration_frames;
    int intensity;
};

struct ShooterStartEventData {
    const char* wave_id;
};

struct ShooterLoadStageEventData {
    const char* wave_id;
    const char* music_id;
    int music_volume;
    const char* background_id;
    int background_layer;
};

struct ShooterBackgroundModeEventData {
    int layer_id;
    bool visible;
    int scroll_x;
    int scroll_y;
    int parallax_x;
    int parallax_y;
};

struct ShooterPauseEventData {
    bool paused;
};

struct ShooterPlayerEnabledEventData {
    bool enabled;
};

struct ShooterBossSpawnEventData {
    const char* archetype_id;
    int x;
    int y;
    const char* drop_id;
};

struct ShooterBossPhaseEventData {
    int phase;
};

struct ShooterWaitSignalEventData {
    const char* signal;
    int timeout_frames;
};

struct SaveEventData {
    int slot;
    const char* variable_id;
    const char* variable_ids;
    int schema;
    bool write;
};
struct VariablesSaveEventData { int slot; bool all_variables; const char* const* variable_ids; int variables_count; };
struct GameDataEventData { int slot; uint32_t point; bool local_actions = false; };
struct ScriptCommandData;
struct GameSavePoint { uint32_t key; const ScriptCommandData* program; int count; int on_load; };

struct HbeEffectEventData {
    const char* preset;
    int intensity;
    int layer_id;
    bool enabled;
};
struct BlendAlphaEventData { int alpha; };

struct ShooterStatEventData {
    const char* stat;
    int value;
    bool additive;
};

struct ShooterGrantEventData {
    const char* grant;
    int value;
};

struct FadeEventData
{
    int speed;
};

struct CameraEventData
{
    int x;
    int y;
    bool animated = false;
    int speed_q8 = 256;
};
struct CameraFollowEventData { bool enabled; const char* actor_id = "__PLAYER__"; bool clamp_to_scene = false; int dead_zone_width = 0; int dead_zone_height = 0; bool lock_x = false; bool lock_y = false; bool persist_across_scenes = false; };
struct CameraShakeEventData { int frames; int amplitude; int axis = 0; };

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

struct BackgroundScrollEventData
{
    int layer_id;
    int x;
    int y;
};

struct BackgroundParallaxEventData
{
    int layer_id;
    int x;
    int y;
};

struct BackgroundTransformEventData
{
    int layer_id;
    int x;
    int y;
};

struct BackgroundAnimationEventData
{
    int layer_id;
    const char* regular_background_id;
    const char* bitmap_background_id;
    int frame_count;
    int start_frame;
    int frame_delta;
    int step_x;
    int step_y;
    int duration_frames;
    bool loop;
};

struct PaletteLayerEventData
{
    int layer_id;
    bool restore_palette;
    const char* const* palette_ids;
};

struct DefaultPalettesEventData { const char* const* palette_ids; };

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
    const char* command;
    // ponteiro genérico para args, pode ser outro struct
    const void* args;
    const int nextIndex;
    const int falseIndex;
    const int loopIndex;
    const NumericEventValues* numeric_values = nullptr;
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

struct ScriptTrigger {
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
    const char* id = nullptr;
};

struct ActorMoveEventData {
    const char* actor_id;
    int x;
    int y;
    bool animated = false;
    int speed_q8 = 256;
    int animation_speed = -1;
    bool collide_walls = true;
    bool collide_actors = false;
    int lock_axis = 0; // 0: none, 1: horizontal, 2: vertical
    int movement_type = 0; // 0: horizontal first, 1: vertical first, 2: diagonal
    bool options_enabled = false; // Preserve legacy instant-placement semantics.
};
struct ActorSpawnEventData { const char* actor_id; int x; int y; bool from_prefab = false; };
struct ActorRemoveEventData { const char* actor_id; bool from_prefab = false; };
struct ActorVisibilityEventData { const char* actor_id; bool visible; };
struct ShowEmoteEventData { const char* actor_id; const char* emote_id; int distance = 12; };
struct ActorAnimationSpeedEventData { const char* actor_id; int speed; };
struct ActorAnimationControlEventData { const char* actor_id; const char* action; const char* state_id; const char* animation_id; int speed; int frame; bool reverse; };
struct ActorDirectionEventData { const char* actor_id; int direction; };
struct ActorStateEventData { const char* actor_id; const char* state_id; };
struct ActorPriorityEventData { const char* actor_id; int priority; };
struct SceneActor {
    const char* id;
    const char* sprite_id;
    int x;
    int y;
    const char* direction;
    int animation_speed;
    const ScriptCommandData* on_init;
    int on_init_count;
    const ScriptCommandData* on_interact;
    int on_interact_count;
    const ScriptCommandData* on_update;
    int on_update_count;
    const char* spawn_prefab_id = nullptr;
    bool keep_running_while_offscreen = false;
};
struct SceneCollision { int x; int y; int width; int height; const char* side; };
struct PlayMusicEventData { const char* music_id; int volume; bool loop; };
struct PlayJingleEventData { const char* music_id; int volume; };
struct PlaySoundEventData {
    const char* sound_id;
    int volume;       // 0..100 percent
    int speed;        // 25..400 percent, converted to Butano's fixed rate
    int panning;      // -100..100 percent
    int priority;     // Butano range -32767..32767
    const char* group_id;
};
struct SoundStopEventData { const char* group_id; };
struct MusicVolumeEventData { int volume; };
struct MusicFadeEventData { int target_volume; int duration_frames; };
struct DialogueEventData {
    const char* text;
    const char* dialogue_font;
    bool show_frame;
    const char* horizontal_align;
    const char* vertical_align;
    bool animate;
    const char* animation_speed;
    const char* avatar_image;
    int avatar_size;
    const char* avatar_placement;
    const char* avatar_anchor;
    int avatar_x;
    int avatar_y;
};
struct UiSetTextEventData {
    const char* ui_id;
    const char* text;
    int x;
    int y;
    const char* font;
};
struct UiSetValueEventData {
    const char* ui_id;
    const char* label;
    int value;
    int x;
    int y;
    const char* font;
};
struct UiAnimateEventData {
    const char* ui_id;
    const char* animation;
    int x;
    int y;
    int speed_units;
    int duration_frames;
};
struct UiTargetEventData {
    const char* ui_id;
};
struct UiAnimationStopEventData {
    const char* ui_id;
};
struct SpriteEffectEventData {
    const char* actor_id;
    int rotation;
    int scale;
    bool visible;
    const char* fade_color;
    int fade_intensity;
    int duration_frames;
};

struct ActorTransformEventData {
    const char* actor_id;
    int value;
    int duration_frames;
};
struct ActorVisualEventData {
    const char* actor_id;
    int value;
    int color;
    int duration_frames = 1;
};
struct DialogueChoiceEventData {
    const char* prompt;
    const char* option_a;
    const char* option_b;
    const char* result_variable;
    const char* options;
    const char* dialogue_font;
    bool show_frame;
    const char* horizontal_align;
    const char* vertical_align;
    bool animate;
    const char* animation_speed;
    bool allow_cancel;
    const char* avatar_image;
    int avatar_size;
    const char* avatar_placement;
    const char* avatar_anchor;
    int avatar_x;
    int avatar_y;
    int columns = 1;
    bool column_major = false;
    int initial_selection = 0;
    int menu_position = 0;
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

    // const char* tilemap_id;          // ID do tilemap da cena
    
    // Scene
    int scene_width;
    int scene_height;
    int camera_x;
    int camera_y;
    const char* scene_type;

    const ScriptTrigger* triggers;
    int triggers_count;
    const SceneActor* actors;
    int actors_count;
    const SceneCollision* collisions;
    int collisions_count;
    const TileAnimation* tile_animations;
    int tile_animations_count;
    const SpawnerTimeline* spawner_timelines;
    int spawner_timelines_count;
};

struct ScriptParameterDefinition {
    VariableDefinition variable;
    bool by_reference;
};
struct ScriptCallArgument {
    const char* parameter_id;
    const NumericProgram* number;
    const char* string_value;
    const char* string_variable_id;
    NumericInstruction reference;
    bool has_reference;
};
struct CallScriptEventData {
    const char* script_id;
    const ScriptCallArgument* arguments = nullptr;
    int arguments_count = 0;
};
struct ScriptDefinition {
    const char* id;
    const ScriptCommandData* commands;
    int commands_count;
    const ScriptParameterDefinition* parameters = nullptr;
    int parameters_count = 0;
};

// A sequence exported by the Sprite Editor. `frames` indexes the generated
// Butano sprite sheet, avoiding assumptions about its layout at runtime.
struct SpriteAnimationDefinition
{
    const char* state_id;
    const char* animation_id;
    const char* animation_type;
    const int* frames;
    int frames_count;
    bool flip_right_to_create_left_frames;
};

struct Sprites
{
    const char* id;
    const char* name;
    const char* graphics_name;       // Butano-safe asset identifier
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
    int canvas_width;
    int canvas_height;
    int composite_columns;
    int composite_rows;
};

struct Settings
{

    // Settings extras
    const char* start_scene_id;     // SETTINGS_STARTSCENEID
    int start_x_pixels;                    // SETTINGS_STARTX (tiles converted to pixels)
    int start_y_pixels;                    // SETTINGS_STARTY (tiles converted to pixels)
    int move_speed;                 // SETTINGS_STARTMOVESPEED
    int anim_speed;                 // SETTINGS_STARTANIMSPEED
    const char* direction;          // SETTINGS_STARTDIRECTION

    int fade_direction;             // SETTINGS_FADEDIRECTION (0 white, 1 black)

    const char* player_sprite_id;   // SETTINGS_PLAYERSPRITEID
    const char* ui_cursor_image;    // SETTINGS_UICURSORIMAGE
    const char* ui_frame_image;     // SETTINGS_UIFRAMEIMAGE
    const InputBinding* input_bindings;
    int input_bindings_count;
    const CombatConfig* combat_config;
    const ShooterConfig* shooter_config;
    unsigned short input_group_masks[3] = { 0x3cf, 0x3f3, 1 };
    const SceneInputMap* scene_input_maps = nullptr;
    int scene_input_maps_count = 0;
};

#endif // RESOURCE_TYPES_H
