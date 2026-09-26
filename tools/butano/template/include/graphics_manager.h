#ifndef {{GRAPHICS_NAME_UPPER}}_H
#define {{GRAPHICS_NAME_UPPER}}_H

#include "bn_core.h"
#include "bn_sprite_ptr.h"
#include "bn_sprite_item.h"
#include "bn_sprite_tiles_item.h"
#include "bn_regular_bg_ptr.h"
#include "bn_regular_bg_item.h"
#include "bn_sp_direct_bitmap_bg_painter.h"
#include "bn_direct_bitmap_item.h"
#include "bn_bg_palettes.h"
#include "bn_palette_bitmap_bg_painter.h"
#include "bn_optional.h"
#include "bn_string.h"
#include "bn_sprite_palettes.h"
#include "bn_vector.h"

#include "palette_bitmap_manager.h"

#include "graphics_items.h"
#include "resources.h"
#include "resource_registry.h"

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
    int sprite_animation_frames[MAX_SPRITES] = {};
    int sprite_animation_updates[MAX_SPRITES] = {};
    int sprite_animation_speeds[MAX_SPRITES] = {};
    int sprite_count = 0;
    int player_slot = -1;
    bn::string<16> player_direction = "right";
    const ScriptCommandData* actor_interaction_script = nullptr;
    int actor_interaction_count = 0;
    int player_world_x = 0;
    int player_world_y = 0;
    bn::string<64> actor_ids[16];
    int actor_slots[16] = {};
    int actor_world_x[16] = {};
    int actor_world_y[16] = {};
    int actor_count = 0;
    int camera_x = 0;
    int camera_y = 0;

    const Scenes* currentScene;

    bn::vector<bn::string<64>, 4> current_bgs_id;
    bn::vector<bn::optional<bn::regular_bg_ptr>, 4> current_bgs;
    bn::vector<int, 4> current_bgs_x;
    bn::vector<int, 4> current_bgs_y;
    bn::optional<bn::sp_direct_bitmap_bg_ptr> current_bitmap_bgs;

    bn::optional<bn::palette_bitmap_bg_ptr> current_palette_btmp_bg;

    // Tilemap support
    // bn::optional<PaletteBitmapManager> tilemap_manager;
    // bn::string<64> current_tileset_name;
    // bn::string<64> current_tilemap_name;

public:
    GraphicsManager();
    ~GraphicsManager();

    static GraphicsManager& instance() {
        static GraphicsManager gm;
        return gm;
    }

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
    void setScene(const Scenes* scene) { currentScene = scene; }
    const Scenes* getScene() const { return currentScene; }

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
    bool remove_actor(const char* actor_id);
    bool set_actor_visible(const char* actor_id, bool visible);
    bool set_all_actors_visible(bool visible);
    bool set_actor_animation_speed(const char* actor_id, int speed);
    bool set_actor_priority(const char* actor_id, int priority);
    bool update_actor_interaction(bool interact_pressed);
    void move_player_from_input();
    void set_player_animation(bool moving);
    void set_camera_position(int x, int y);
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
