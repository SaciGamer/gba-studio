/**
 * {{PROJECT_NAME}} - GBA Game
 * Author: {{AUTHOR}}
 * Version: {{VERSION}}
 * 
 * Built with GBA Studio engine for Butano
 */

#include "event_change_layer.h"

#include "bn_log.h"
#include "bn_core.h"

#include "graphics_manager.h"
#include "script_command_manager.h"
#include "resource_types.h"

#include "utils.h"

bool run_change_layer(const void* args, const bn::string<64> scene_id) {
    if(!args) return true;
    return run_change_layer(*static_cast<const LayerChangeEventData*>(args), scene_id);
}

bool run_change_layer(const LayerChangeEventData& data, const bn::string<64>& scene_id) {
    (void) scene_id;
    if(!data.background_id) return true;
    BN_LOG("[EVENT_CHANGE_LAYER] begin layer=", data.layer_id, " background=", data.background_id);
    GraphicsManager::instance().change_single_layer(data.layer_id, bn::string<64>(data.background_id), true);
    BN_LOG("[EVENT_CHANGE_LAYER] complete layer=", data.layer_id);
    return true;
}

bool run_visible_background(const void* args, const bn::string<64> scene_id) {
    if(!args) return true;
    return run_visible_background(*static_cast<const LayerVisibilityEventData*>(args), scene_id);
}

bool run_visible_background(const LayerVisibilityEventData& data, const bn::string<64>& scene_id) {
    (void) scene_id;
    GraphicsManager::instance().set_layer_visible(data.layer_id, data.visible);
    return true;
}

bool run_background_scroll(const void* args, const bn::string<64> scene_id) {
    if(!args) return true;
    return run_background_scroll(*static_cast<const BackgroundScrollEventData*>(args), scene_id);
}

bool run_background_scroll(const BackgroundScrollEventData& data, const bn::string<64>& scene_id) {
    (void) scene_id;
    GraphicsManager::instance().scroll_background(data.layer_id, data.x, data.y);
    return true;
}

bool run_background_parallax(const void* args, const bn::string<64> scene_id) {
    if(!args) return true;
    return run_background_parallax(*static_cast<const BackgroundParallaxEventData*>(args), scene_id);
}

bool run_background_parallax(const BackgroundParallaxEventData& data, const bn::string<64>& scene_id) {
    (void) scene_id;
    GraphicsManager::instance().set_background_parallax(data.layer_id, data.x, data.y);
    return true;
}

bool run_change_palette_background(const void* args, const bn::string<64> scene_id) {
    (void) scene_id;
    if(!args) return true;
    return run_change_palette_background(*static_cast<const PaletteLayerEventData*>(args), scene_id);
}

bool run_change_palette_background(const PaletteLayerEventData& data, const bn::string<64>& scene_id) {
    (void) scene_id;
    GraphicsManager::instance().change_palette_layer(data.layer_id, data.palette_ids, data.restore_palette);
    return true;
}
