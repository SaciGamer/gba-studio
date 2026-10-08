#ifndef {{GRAPHICS_NAME_UPPER}}_H
#define {{GRAPHICS_NAME_UPPER}}_H

#include "bn_core.h"
#include "bn_sprite_ptr.h"
#include "bn_sprite_item.h"
#include "bn_sprite_tiles_item.h"
#include "bn_regular_bg_ptr.h"
#include "bn_bg_palette_ptr.h"
#include "bn_regular_bg_tiles_ptr.h"
#include "bn_regular_bg_item.h"
#include "bn_sp_direct_bitmap_bg_painter.h"
#include "bn_direct_bitmap_item.h"
#include "bn_bg_palettes.h"
#include "bn_palette_bitmap_bg_painter.h"
#include "bn_optional.h"
#include "bn_string.h"
#include "bn_sprite_palettes.h"
#include "bn_vector.h"
#include "bn_sprite_text_generator.h"
#include <cstdint>
#include "actor_motion_physics.h"

#include "palette_bitmap_manager.h"

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
    bool sprite_script_motion[MAX_SPRITES] = {};
    int8_t sprite_script_climb_direction[MAX_SPRITES] = {};
    int sprite_count = 0;
    int player_slot = -1;
    bn::string<16> player_direction = "right";
    const ScriptCommandData* actor_interaction_script = nullptr;
    int actor_interaction_count = 0;
    int player_world_x = 0;
    int player_world_y = 0;
    // Platformer vertical motion uses Q8 fixed point so low gravity remains
    // smooth while world positions and collision bounds stay pixel-aligned.
    int player_vertical_velocity_q8 = 0;
    int player_vertical_remainder_q8 = 0;
    bool player_grounded = false;
    bool player_climbing = false;
    bn::string<64> actor_ids[16];
    int actor_slots[16] = {};
    int actor_world_x[16] = {};
    int actor_world_y[16] = {};
    int actor_count = 0;
    static constexpr int MAX_SHOOTER_PROJECTILE_SPRITES = 16;
    bn::optional<bn::sprite_ptr> shooter_projectile_sprites[MAX_SHOOTER_PROJECTILE_SPRITES];
    int shooter_projectile_indices[MAX_SHOOTER_PROJECTILE_SPRITES] = {};
    bn::optional<bn::sprite_ptr> shooter_drop_sprites[MAX_SHOOTER_PROJECTILE_SPRITES];
    bn::string<64> shooter_drop_ids[MAX_SHOOTER_PROJECTILE_SPRITES];
    bn::vector<bn::sprite_ptr, 48> shooter_hud_sprites;
    int camera_x = 0;
    int camera_y = 0;

    const Scenes* currentScene;
    uint32_t scene_revision = 0;

    bn::vector<bn::string<64>, 4> current_bgs_id;
    bn::vector<bn::optional<bn::regular_bg_ptr>, 4> current_bgs;
    bn::vector<int, 4> current_bgs_x;
    bn::vector<int, 4> current_bgs_y;
    bn::vector<int, 4> current_bgs_parallax_x;
    bn::vector<int, 4> current_bgs_parallax_y;
    bn::optional<bn::sp_direct_bitmap_bg_ptr> current_bitmap_bgs;

    bn::optional<bn::palette_bitmap_bg_ptr> current_palette_btmp_bg;

    const Scenes* tile_animation_scene = nullptr;
    int tile_animation_frames[32] = {};
    int tile_animation_ticks[32] = {};
    bool tile_animation_initialized[32] = {};

    void update_tile_animations();
    void update_sprite_effects();

    // Tilemap support
    // bn::optional<PaletteBitmapManager> tilemap_manager;
    // bn::string<64> current_tileset_name;
    // bn::string<64> current_tilemap_name;

public:
    GraphicsManager();
    ~GraphicsManager();

    static GraphicsManager& instance();

    void startup_screen(bn::regular_bg_ptr gba_studio_logo);
    void startup_screen_bitmap(bn::direct_bitmap_item gba_studio_logo);

    /**
     * Initialize graphics
     */
    const Scenes* initialize();
    void initialize_tilemap(const Scenes* scene);

    /**
     * Getter and Setter Manage Scene
     */
    void setScene(const Scenes* scene) { currentScene = scene; ++scene_revision; }
    const Scenes* getScene() const { return currentScene; }
    uint32_t get_scene_revision() const { return scene_revision; }

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

    void spawn_player(const Scenes& scene, int tile_x, int tile_y, const char* direction);
    bool spawn_actor(const char* actor_id, int x, int y);
    bool move_actor(const char* actor_id, int x, int y);
    const Sprites* read_script_actor_state(const char* actor_id, actor_motion::State& state) const;
    bool apply_script_actor_state(const char* actor_id, const actor_motion::State& state, actor_motion::Action action);
    void stop_script_actor_motion(const char* actor_id);
    bool remove_actor(const char* actor_id);
    bool set_actor_visible(const char* actor_id, bool visible);
    bool set_all_actors_visible(bool visible);
    bool set_actor_animation_speed(const char* actor_id, int speed);
    bool set_actor_state(const char* actor_id, const char* state_id);
    bool set_actor_priority(const char* actor_id, int priority);
    bool set_actor_effect(const char* actor_id, int rotation, int scale_percent, bool visible, const char* fade_color, int fade_intensity, int duration_frames);
    bool update_actor_interaction(bool interact_pressed);
    void move_player_from_input();
    void set_player_animation(bool moving, const char* requested_type = nullptr);
    bool player_on_ladder(int x, int y) const;
    void set_camera_position(int x, int y);
    int read_numeric_actor_property(const char* actor_id, int property) const;
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
    void change_single_layer(int layer_id, const bn::string<64>& background_id, bool visible);
    void change_palette_layer(int layer_id, const char* const* palette_ids, bool restore_palette);
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
    void sync_shooter_projectiles(const ShooterKit& shooter, const char* sprite_id);
    void sync_shooter_drops(const ShooterKit& shooter);
    void sync_shooter_hud(const ShooterKit& shooter);

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
