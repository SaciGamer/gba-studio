#ifndef {{GRAPHICS_NAME_UPPER}}_H
#define {{GRAPHICS_NAME_UPPER}}_H

#include "bn_core.h"
#include "runtime_capacity.h"
#include "gba_studio_features.h"
#include "bn_sprite_ptr.h"
#include "bn_sprite_item.h"
#include "bn_sprite_tiles_item.h"
#include "bn_regular_bg_ptr.h"
#include "bn_bg_palette_ptr.h"
#include "bn_regular_bg_tiles_ptr.h"
#include "bn_regular_bg_item.h"
#if GBA_STUDIO_FEATURE_BACKGROUND_TRANSFORM
#include "bn_affine_bg_ptr.h"
#include "bn_affine_bg_item.h"
#include "bn_affine_bg_tiles_ptr.h"
#endif
#include "bn_sp_direct_bitmap_bg_painter.h"
#include "bn_direct_bitmap_item.h"
#include "bn_bg_palettes.h"
#include "bn_optional.h"
#include "bn_string.h"
#include "bn_sprite_palettes.h"
#include "gba_studio_features.h"
#if GBA_STUDIO_FEATURE_SAVE
#include "game_save_state.h"
#endif
#include "bn_vector.h"
#include "bn_array.h"
#include "bn_sprite_text_generator.h"
#include <cstdint>
#include "actor_motion_physics.h"


#include "graphics_items.h"
#include "resources.h"
#include "resource_registry.h"

class ShooterKit;

/**
 * Graphics Manager for {{PROJECT_NAME}}
 * Handles sprite, background, tilemap rendering
 */
class GraphicsManager {
private:
    static constexpr int MAX_SPRITES = 128;
    bn::optional<bn::sprite_ptr> sprites[MAX_SPRITES];
    bn::optional<bn::sprite_tiles_item> sprite_tiles_items[MAX_SPRITES];
    const Sprites* sprite_resources[MAX_SPRITES] = {};
    const SpriteAnimationDefinition* sprite_animations[MAX_SPRITES] = {};
    const char* sprite_main_states[MAX_SPRITES] = {};
    int sprite_animation_frames[MAX_SPRITES] = {};
    int sprite_animation_updates[MAX_SPRITES] = {};
    int sprite_animation_speeds[MAX_SPRITES] = {};
    // 0 = normal looping, 1 = play once, 2 = paused on the current frame.
    int8_t sprite_animation_modes[MAX_SPRITES] = {};
    bool sprite_animation_reverse[MAX_SPRITES] = {};
    int sprite_composite_part_index[MAX_SPRITES] = {};
    bool sprite_script_motion[MAX_SPRITES] = {};
    int8_t sprite_script_climb_direction[MAX_SPRITES] = {};
    int sprite_count = 0;
    int player_slot = -1;
    bn::string<16> player_direction = "right";
    const ScriptCommandData* actor_interaction_script = nullptr;
    int actor_interaction_count = 0;
    const char* actor_interaction_actor_id = nullptr;
    int player_world_x = 0;
    int player_world_y = 0;
    // Platformer vertical motion uses Q8 fixed point so low gravity remains
    // smooth while world positions and collision bounds stay pixel-aligned.
    int player_vertical_velocity_q8 = 0;
    int player_vertical_remainder_q8 = 0;
    int player_diagonal_remainder_q16 = 0;
    bool player_grounded = false;
    bool player_climbing = false;
    int player_ignored_platform_index = -1;
    bool player_drop_through_active = false;
    bn::string<64> actor_ids[GBA_STUDIO_MAX_ACTORS];
    const SceneActor* actor_definitions[GBA_STUDIO_MAX_ACTORS] = {};
    uint8_t actor_initialization[GBA_STUDIO_MAX_ACTORS] = {}; // 0: pending, 1: running, 2: complete
    int actor_slots[GBA_STUDIO_MAX_ACTORS] = {};
    int actor_world_x[GBA_STUDIO_MAX_ACTORS] = {};
    int actor_world_y[GBA_STUDIO_MAX_ACTORS] = {};
    PlayerPhysics actor_physics[GBA_STUDIO_MAX_ACTORS];
    actor_motion::State actor_physics_state[GBA_STUDIO_MAX_ACTORS];
    bool actor_physics_enabled[GBA_STUDIO_MAX_ACTORS] = {};
    void update_actor_physics();
    int actor_direction_override[GBA_STUDIO_MAX_ACTORS] = {};
    struct TriggerValues { int values[5]{}; bool active = false; };
    bn::array<TriggerValues, 64> trigger_values;
    struct ActorResidence {
        const SceneActor* definition = nullptr;
        int x = 0, y = 0;
        bool enabled = false, visible = true;
        bool active = false;
    };
    bn::vector<ActorResidence, GBA_STUDIO_MAX_ACTOR_DEFINITIONS> actor_residences;
    ActorResidence* actor_residence(const char* id);
    const ActorResidence* actor_residence(const char* id) const;
    bool actor_on_screen(const SceneActor& actor, int x, int y, int active_index = -1) const;
    void update_actor_residency();
    int actor_count = 0;
    int created_sprite_root = -1;
    struct EmoteAnimationState {
        bn::string<64> actor_id;
        bn::optional<bn::sprite_ptr> sprite;
        int elapsed_frames = 0;
        int distance = 12;
        bool occupied = false;
    };
    bn::array<EmoteAnimationState, 16> emote_animations;
    static constexpr int MAX_SHOOTER_PROJECTILE_SPRITES = 16;
#if GBA_STUDIO_FEATURE_SHOOTER
    bn::optional<bn::sprite_ptr> shooter_projectile_sprites[MAX_SHOOTER_PROJECTILE_SPRITES];
    int shooter_projectile_indices[MAX_SHOOTER_PROJECTILE_SPRITES] = {};
    bn::optional<bn::sprite_ptr> shooter_drop_sprites[MAX_SHOOTER_PROJECTILE_SPRITES];
    bn::string<64> shooter_drop_ids[MAX_SHOOTER_PROJECTILE_SPRITES];
    bn::vector<bn::sprite_ptr, 48> shooter_hud_sprites;
#endif
    int camera_x = 0;
    int camera_y = 0;

    PlayerPhysics player_physics;
    const Scenes* currentScene = nullptr;
    uint32_t scene_revision = 0;

    bn::vector<bn::string<64>, 4> current_bgs_id;
    bn::vector<bn::optional<bn::regular_bg_ptr>, 4> current_bgs;
#if GBA_STUDIO_FEATURE_BACKGROUND_TRANSFORM
    bn::array<bn::optional<bn::affine_bg_ptr>, 4> current_affine_bgs;
    bool affine_layer(int layer_id) const;
    bool load_affine_background(int layer_id, const bn::string<64>& background_id, bool visible, const char* graphics_name = nullptr);
#endif
    int bitmap_paint_x = 0;
    int bitmap_paint_y = 0;
    bn::vector<int, 4> current_bgs_x;
    bn::vector<int, 4> current_bgs_y;
    bn::vector<int, 4> current_bgs_parallax_x;
    bn::vector<int, 4> current_bgs_parallax_y;
    bn::optional<bn::sp_direct_bitmap_bg_ptr> current_bitmap_bgs;
    const BackgroundPalette* default_palette_overrides[16] = {};
    const char* const* layer_palette_overrides[4] = {};
    const bn::color* slot_palette_sources[4] = {};
    const Backgrounds* slot_palette_backgrounds[4] = {};
    int slot_palette_native_ids[4] = { -1, -1, -1, -1 };
    uint32_t slot_palette_scene_revision = 0;
    void update_default_palettes();
    const BackgroundPalette* resolve_slot_palette(int slot) const;
    const BackgroundPalette* resolve_palette_reference(const char* id, int fallback_slot) const;

#if GBA_STUDIO_FEATURE_BACKGROUND_ANIMATION
    struct BackgroundAnimationState {
        const BackgroundAnimationEventData* data = nullptr;
        int frame = 0;
        int ticks = 0;
        int offset_x = 0;
        int offset_y = 0;
        bn::optional<bn::direct_bitmap_item> bitmap_item;
        bool active = false;
    };
    BackgroundAnimationState background_animations[4];
    void update_background_animations();
    bool paint_background_animation_frame(int layer_id, const BackgroundAnimationEventData& data, int frame);
#endif


    const Scenes* tile_animation_scene = nullptr;
    int tile_animation_frames[32] = {};
    int tile_animation_ticks[32] = {};
    bool tile_animation_initialized[32] = {};

    void update_tile_animations();
    void update_sprite_effects();
    void update_emote_animations();
    void set_sprite_group_position(int root_slot, int world_x, int world_y);
    int sprite_group_parts(int root_slot) const;

    // Tilemap support
    // bn::optional<PaletteBitmapManager> tilemap_manager;
    // bn::string<64> current_tileset_name;
    // bn::string<64> current_tilemap_name;

public:
#if GBA_STUDIO_FEATURE_BACKGROUND_ANIMATION
    bool animate_background(const BackgroundAnimationEventData& data);
#endif
#if GBA_STUDIO_FEATURE_SPRITE_EFFECTS
    bool set_actor_visual_effect(const char* actor_id, int operation, int value, int color);
    void set_global_sprite_blending();
#endif
#if GBA_STUDIO_FEATURE_BACKGROUND_TRANSFORM
    bool transform_background(int layer_id, int operation, int x, int y);
#endif
    GraphicsManager();
    ~GraphicsManager();

    static GraphicsManager& instance();

    void startup_screen(bn::regular_bg_ptr gba_studio_logo);
    void startup_screen_bitmap(bn::direct_bitmap_item gba_studio_logo);

    /**
     * Initialize graphics
     */
    const Scenes* initialize();

    /**
     * Getter and Setter Manage Scene
     */
    void setScene(const Scenes* scene) {
        update_input_scene_type(scene);
        player_physics.reset();
        for(int i = 0; i < GBA_STUDIO_MAX_ACTORS; ++i) {
            actor_physics[i].reset();
            actor_physics_state[i] = {};
            actor_physics_enabled[i] = false;
        }
        currentScene = scene;
        for(int& direction : actor_direction_override) direction = -1;
        for(auto& values : trigger_values) values.active = false;
        for(auto& definition : actor_definitions) definition = nullptr;
        for(auto& initialization : actor_initialization) initialization = 0;
        player_ignored_platform_index = -1;
        player_drop_through_active = false;
        ++scene_revision;
    }
    bool stop_physics(const StopPhysicsEventData& data);
    void update_input_scene_type(const Scenes* scene);
    bool configure_movement(const MovementEventData& data);
    bool set_physics_setting(const PhysicsSettingEventData& data);
    bool apply_vertical_impulse(const VerticalImpulseEventData& data);
    const Scenes* getScene() const { return currentScene; }
    uint32_t get_scene_revision() const { return scene_revision; }
#if GBA_STUDIO_FEATURE_SAVE
    bool capture_game_world(GameWorldState& state) const;
    bool restore_game_world(const GameWorldState& state);
    const char* game_actor_id(uint32_t key) const;
#endif

    /**
     * Initialize slots of layers
     */
    void init_bg_slots();

    /**
     * Render scene
     */
    void render_scene_regular_bg(const Scenes& scene);
    void render_scene_bitmap_bg(const Scenes& scene);

    /**
     * Loading next scene
     */
    const Scenes* load_next_scene_by_id(const bn::string<64>& scene_id);

    void spawn_player(const Scenes& scene, int tile_x, int tile_y, const char* direction, bool anchor_pixels = false);
    bool spawn_actor(const char* actor_id, int x, int y, bool from_prefab = false);
    bool move_actor(const char* actor_id, int x, int y);
    const Sprites* read_script_actor_state(const char* actor_id, actor_motion::State& state) const;
    bool script_actor_blocked(const char* actor_id, const Sprites& body, int x, int y) const;
    int script_actor_minimum_distance(const char* actor_id, const Sprites& body, int x, int y) const;
    bool apply_script_actor_state(const char* actor_id, const actor_motion::State& state, actor_motion::Action action);
    void stop_script_actor_motion(const char* actor_id);
    bool remove_actor(const char* actor_id, bool offscreen = false);
    bool remove_prefab_actors(const char* prefab_id);
    bool set_actor_visible(const char* actor_id, bool visible);
    bool set_all_actors_visible(bool visible);
    bool set_actor_animation_speed(const char* actor_id, int speed);
    bool control_actor_animation(const ActorAnimationControlEventData& data);
    bool set_actor_state(const char* actor_id, const char* state_id);
    bool set_actor_priority(const char* actor_id, int priority);
    bool set_actor_transform(const char* actor_id, int operation, int value, int duration_frames, int color = 0xffffff);
    bool set_actor_effect(const char* actor_id, int rotation, int scale_percent, bool visible, const char* fade_color, int fade_intensity, int duration_frames);
    bool actor_is_facing(const char* actor_id, const char* target_actor_id, bool look_x = true, bool look_y = true, int distance_x = 0, int distance_y = 0) const;
    bool player_overlaps_trigger(const ScriptTrigger& trigger, int x, int y) const;
    bool update_actor_interaction(bool interact_pressed);
    void update_actor_initialization(bool allow_scene_actors = true);
    void update_actor_scripts(bool allow_scene_actors = true);
    bool show_emote(const char* actor_id, const char* emote_id, int distance = 12);
    void move_player_from_input();
    void set_player_animation(bool moving, const char* requested_type = nullptr);
    bool player_on_ladder(int x, int y) const;
    void set_camera_position(int x, int y);
    int read_numeric_actor_property(const char* actor_id, int property) const;
    bool write_numeric_actor_property(const char* actor_id, int property, int value);
    ScriptTrigger get_script_trigger(int index, const ScriptTrigger& source) const;
    const ScriptTrigger& resolve_script_trigger(int index, const ScriptTrigger& source, ScriptTrigger& modified) const;
    int read_numeric_trigger_property(const char* id, int property) const;
    bool write_numeric_trigger_property(const char* id, int property, int value);
    int get_camera_x() const { return camera_x; }
    int get_camera_y() const { return camera_y; }
    int get_player_world_x() const { return player_world_x; }
    int get_player_world_y() const { return player_world_y; }

    /**
     * Loading next regular backgrounds
     */
    bn::vector<bn::regular_bg_ptr, 4> load_next_regular_background_by_id(const bn::vector<LayerArgs, 4>& changeLayer);

    /**
     * Loading next bitmap backgrounds
     */
    bn::optional<bn::sp_direct_bitmap_bg_ptr> load_next_bitmap_background_by_id(const bn::vector<LayerArgs, 4>& changeLayer);
    void change_layer(const bn::vector<LayerArgs, 4>& changeLayer);
    void change_single_layer(int layer_id, const bn::string<64>& background_id, bool visible, bool defer_bitmap_paint = false);
    void change_palette_layer(int layer_id, const char* const* palette_ids, bool restore_palette);
    void change_default_palettes(const char* const* palette_ids);
    void set_layer_visible(int layer_id, bool visible);
    void scroll_background(int layer_id, int x, int y);
    void set_background_parallax(int layer_id, int x, int y);
    bn::optional<bn::bg_palette_ptr> get_layer_palette(int layer_id) const;

    /**
     * Create sprite
     */
    bn::optional<bn::sprite_ptr> create_sprite(const bn::sprite_item& item, int x, int y);
    bn::optional<bn::sprite_ptr> create_ui_sprite(const char* graphics_name, int x, int y);
    bn::optional<bn::sprite_ptr> create_ui_sprite_frame(const char* graphics_name, int x, int y, int frame);
    bn::optional<bn::regular_bg_ptr> create_ui_frame_bg(const char* graphics_name);
    bn::optional<bn::sprite_ptr> create_sprite(const Sprites& resource, const bn::sprite_item& item,
                                                int x, int y, const char* direction);

    /**
     * Remove sprite
     */
    void remove_sprite(const bn::sprite_ptr& sprite);

    /**
     * Update all sprites
     */
    void update_sprites();
#if GBA_STUDIO_FEATURE_SHOOTER
    void sync_shooter_projectiles(const ShooterKit& shooter, const char* sprite_id);
    void sync_shooter_drops(const ShooterKit& shooter);
    void sync_shooter_hud(const ShooterKit& shooter);
#endif

    /**
     * Clear all sprites
     */
    void clear_sprites();

    /**
     * Get sprite count
     */
    int get_sprite_count() const;

//     // Tilemap methods

//     /**
//      * Initialize tilemap for current scene
//      */
//     void initialize_tilemap();

//     /**
//      * Render tilemap
//      */
//     void render_tilemap();

//     /**
//      * Update tile at position
//      */
//     void update_tile(int x, int y, int tile_index);

//     /**
//      * Fill area with tile
//      */
//     void fill_tile_area(int start_x, int start_y, int width, int height, int tile_index);

//     /**
//      * Clear tilemap
//      */
//     void clear_tilemap(int tile_index = 0);

//     /**
//      * Get tile at position
//      */
//     int get_tile_at(int x, int y) const;

//     /**
//      * Check if tilemap is initialized
//      */
//     bool is_tilemap_initialized() const;

// private:
//     /**
//      * Load tileset item by name
//      */
//     bn::optional<bn::palette_bitmap_pixels_item> get_tileset_item(const bn::string<64>& name);

//     /**
//      * Convert tile data array to 2D vector
//      */
//     bn::vector<bn::vector<int, 64>, 64> convert_tile_data_to_map(
//         const int* tile_data,
//         int data_size,
//         int map_width,
//         int map_height
//     );
};

#endif // {{GRAPHICS_NAME_UPPER}}_H
