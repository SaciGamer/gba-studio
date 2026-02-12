# GBA-Studio Tilemap System

## Overview

The GBA-Studio now includes a generic tilemap rendering system based on Butano's PaletteBitmap functionality. This system allows for dynamic tile-based map rendering that can be controlled from the GBA-Studio editor.

## Architecture

### Core Components

1. **PaletteBitmapManager**: Generic class for tilemap rendering
   - Handles tileset loading and tile positioning
   - Supports dynamic tile updates and area filling
   - Configurable tile and map dimensions

2. **GraphicsManager Integration**: Extended to support tilemaps
   - Automatic tileset and tilemap loading from scene configuration
   - Seamless integration with existing sprite/background systems

3. **Resource System**: Extended resource types
   - `Tileset`: Contains tile graphics and dimensions
   - `Tilemap`: Contains map data and dimensions
   - Scene resources now include tileset_id and tilemap_id fields

## Usage

### Basic PaletteBitmapManager Usage

```cpp
#include "palette_bitmap_manager.h"

// Create tile map data (2D vector)
bn::vector<bn::vector<int>, 64> tile_map;
// Initialize your tile data...

// Create and initialize manager
PaletteBitmapManager palette_mgr;
palette_mgr.initialize(
    tileset_pixels_item,  // bn::palette_bitmap_pixels_item
    tile_map,            // 2D tile index array
    16, 16,             // tile width, height
    20, 15,             // map width, height in tiles
    0, 0                // render offset x, y
);

// Render the map
palette_mgr.render_map();

// Update individual tiles
palette_mgr.update_tile(x, y, tile_index);

// Fill areas
palette_mgr.fill_area(start_x, start_y, width, height, tile_index);
```

### GraphicsManager Integration

```cpp
#include "graphics_manager.h"

GraphicsManager graphics_mgr;
graphics_mgr.initialize();           // Loads background
graphics_mgr.initialize_tilemap();   // Loads tileset and tilemap

// In game loop
graphics_mgr.render_tilemap();       // Render tilemap
graphics_mgr.update_sprites();       // Render sprites
```

## GBA-Studio Integration

### Resource Generation

GBA-Studio will generate:

1. **Tileset Resources**:
   - `bn_palette_bitmap_items_[name].h/cpp` files
   - Resource registry entries with tile dimensions

2. **Tilemap Resources**:
   - Static arrays containing tile indices
   - Resource entries with map dimensions

3. **Scene Configuration**:
   - `tileset_id` and `tilemap_id` fields in scene resources

### Auto-generated Functions

GBA-Studio will generate lookup functions:

```cpp
// Auto-generated tileset getter
bn::optional<bn::palette_bitmap_pixels_item> get_tileset_item_from_name(const bn::string<64>& name);

// Auto-generated tilemap resource getter
const Resource* get_tilemap_resource_from_name(const bn::string<64>& name);
```

## File Structure

```
tools/butano/template/
├── include/
│   ├── palette_bitmap_manager.h      # Generic tilemap manager
│   ├── graphics_manager.h           # Extended with tilemap support
│   └── resource_types.h             # Extended resource types
├── src/
│   ├── palette_bitmap_manager.cpp   # Manager implementation
│   ├── graphics_manager.cpp         # Extended implementation
│   └── tilemap_integration_example.cpp # Usage examples
```

## API Reference

### PaletteBitmapManager

#### Methods
- `initialize()`: Setup tileset and map data
- `render_map()`: Render entire tilemap
- `update_tile(x, y, index)`: Update single tile
- `fill_area(x, y, w, h, index)`: Fill rectangular area
- `clear_map(index)`: Clear map with tile
- `get_tile(x, y)`: Get tile at position
- `is_initialized()`: Check if ready

#### Parameters
- **Tileset**: Butano palette bitmap pixels item
- **Tile Map**: 2D vector of tile indices
- **Dimensions**: Tile size, map size in tiles
- **Offset**: Rendering position offset

### GraphicsManager Extensions

#### New Methods
- `initialize_tilemap()`: Load scene's tileset/tilemap
- `render_tilemap()`: Render current tilemap
- `update_tile(x, y, index)`: Update tile
- `fill_tile_area(x, y, w, h, index)`: Fill area
- `clear_tilemap(index)`: Clear tilemap
- `get_tile_at(x, y)`: Get tile value
- `is_tilemap_initialized()`: Check tilemap status

## Performance Considerations

- Tilemaps render using palette bitmaps for efficiency
- Individual tile updates are optimized
- Large maps may require viewport culling (future enhancement)
- Memory usage scales with map size

## Future Enhancements

- Viewport culling for large maps
- Multiple layers support
- Collision detection integration
- Animation support for tiles
- Tile property system (solid, water, etc.)

## Migration from Old System

The old hardcoded tile rendering has been replaced with the generic system. To migrate:

1. Replace hardcoded tile rendering with PaletteBitmapManager
2. Use GraphicsManager for automatic resource loading
3. Configure tilesets and tilemaps in GBA-Studio
4. Update scene configurations with tileset/tilemap IDs