#ifndef PALETTE_BITMAP_MANAGER_H
#define PALETTE_BITMAP_MANAGER_H

#include "bn_core.h"
#include "bn_optional.h"
#include "bn_string.h"
#include "bn_vector.h"
#include "bn_palette_bitmap_bg_ptr.h"
#include "bn_palette_bitmap_bg_painter.h"
#include "bn_palette_bitmap_pixels_item.h"
#include "bn_palette_bitmap_roi.h"

/**
 * Generic Palette Bitmap Manager for GBA-Studio
 * Handles tile-based map rendering using palette bitmaps
 */
// class PaletteBitmapManager {
// private:
//     bn::optional<bn::palette_bitmap_bg_ptr> bg;
//     bn::optional<bn::palette_bitmap_bg_painter> painter;
//     bn::optional<bn::palette_bitmap_pixels_item> pixels_item;

//     // Tile map data
//     bn::vector<bn::vector<int, 64>, 64> tile_map;
//     int tile_width = 0;
//     int tile_height = 0;
//     int map_width = 0;
//     int map_height = 0;

//     // Rendering parameters
//     int offset_x = 0;
//     int offset_y = 0;

// public:
//     PaletteBitmapManager();
//     ~PaletteBitmapManager();

//     /**
//      * Initialize with tileset and map data
//      * @param tileset_item The palette bitmap pixels item for the tileset
//      * @param map_data 2D vector containing tile indices
//      * @param tile_w Width of each tile in pixels
//      * @param tile_h Height of each tile in pixels
//      * @param map_w Width of the map in tiles
//      * @param map_h Height of the map in tiles
//      * @param offset_x X offset for rendering
//      * @param offset_y Y offset for rendering
//      */
//     void initialize(
//         const bn::palette_bitmap_pixels_item& tileset_item,
//         const bn::vector<bn::vector<int, 64>, 64>& map_data,
//         int tile_w = 16,
//         int tile_h = 16,
//         int map_w = 20,
//         int map_h = 15,
//         int offset_x = 0,
//         int offset_y = 0
//     );

//     /**
//      * Render the tile map
//      */
//     void render_map();

//     /**
//      * Update a specific tile in the map
//      * @param x Tile X position
//      * @param y Tile Y position
//      * @param tile_index New tile index
//      */
//     void update_tile(int x, int y, int tile_index);

//     /**
//      * Fill a rectangular area with a tile
//      * @param start_x Start X position
//      * @param start_y Start Y position
//      * @param width Width of area
//      * @param height Height of area
//      * @param tile_index Tile index to fill with
//      */
//     void fill_area(int start_x, int start_y, int width, int height, int tile_index);

//     /**
//      * Clear the entire map with a specific tile
//      * @param tile_index Tile index to clear with
//      */
//     void clear_map(int tile_index = 0);

//     /**
//      * Get tile index at position
//      * @param x X position
//      * @param y Y position
//      * @return Tile index or -1 if out of bounds
//      */
//     int get_tile(int x, int y) const;

//     /**
//      * Check if manager is initialized
//      */
//     bool is_initialized() const;

//     /**
//      * Get map dimensions
//      */
//     int get_map_width() const { return map_width; }
//     int get_map_height() const { return map_height; }
//     int get_tile_width() const { return tile_width; }
//     int get_tile_height() const { return tile_height; }

// private:
//     /**
//      * Calculate tileset position for a tile index
//      * @param tile_index Tile index
//      * @param tiles_per_row Number of tiles per row in tileset
//      * @return Pair of (x, y) position in tileset
//      */
//     bn::pair<int, int> get_tileset_position(int tile_index, int tiles_per_row) const;

//     /**
//      * Render a single tile at screen position
//      * @param screen_x Screen X position
//      * @param screen_y Screen Y position
//      * @param tile_index Tile index to render
//      */
//     void render_single_tile(int screen_x, int screen_y, int tile_index);
// };

#endif // PALETTE_BITMAP_MANAGER_H