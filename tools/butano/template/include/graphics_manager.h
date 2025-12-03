#ifndef {{GRAPHICS_NAME_UPPER}}_H
#define {{GRAPHICS_NAME_UPPER}}_H

#include "bn_core.h"
#include "bn_sprite_ptr.h"
#include "bn_sprite_item.h"
#include "bn_regular_bg_ptr.h"
#include "bn_regular_bg_item.h"
#include "bn_optional.h"
#include "bn_string.h"
#include "bn_bg_palettes.h"
#include "bn_sprite_palettes.h"

/**
 * Graphics Manager for {{PROJECT_NAME}}
 * Handles sprite and background rendering
 */
class GraphicsManager {
private:
    static constexpr int MAX_SPRITES = 128;
    bn::optional<bn::sprite_ptr> sprites[MAX_SPRITES];
    int sprite_count;
    bn::optional<bn::regular_bg_ptr> current_bg;

public:
    GraphicsManager();
    ~GraphicsManager();

    /**
     * Initialize graphics
     */
    void initialize();

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
};

#endif // {{GRAPHICS_NAME_UPPER}}_H