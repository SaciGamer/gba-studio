#ifndef {{GRAPHICS_NAME_UPPER}}_H
#define {{GRAPHICS_NAME_UPPER}}_H

#include "bn_core.h"
#include "bn_sprite_ptr.h"
#include "bn_sprite_item.h"
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
    int sprite_count = 0;

    const Scenes* currentScene;
    bn::vector<bn::regular_bg_ptr, 4> current_bgs;
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
     * Render scene
     */
    void render_scene_regular_bg(const Scenes& scene);
    void render_scene_bitmap_bg(const Scenes& scene);

    /**
     * Loading next scene
     */
    const Scenes* loadNextSceneById(const bn::string<64>& scene_id);

    /**
     * Create sprite
     */
    bn::optional<bn::sprite_ptr> create_sprite(const bn::sprite_item& item, int x, int y);

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