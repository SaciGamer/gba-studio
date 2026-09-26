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
    if(!data.background_id) return true;
    GraphicsManager::instance().change_single_layer(data.layer_id, bn::string<64>(data.background_id), true);
    return true;
}

/* Legacy positional ABI retained only for old generated headers. */
bool run_change_layer_legacy(const void* args, const bn::string<64> scene_id) {
    if(!args) return true;
    // ResourceBuilder emits the event object fields directly: layerId followed
    // by backgroundId. The previous implementation expected an obsolete array
    // of four layers and dereferenced invalid pointers for Logo/Point Click.
    const void* const* root = static_cast<const void* const*>(args);
    const int* layer_id = static_cast<const int*>(root[0]);
    const char* background_id = static_cast<const char*>(root[1]);
    if(!layer_id || !background_id) return true;

    GraphicsManager::instance().change_single_layer(*layer_id, bn::string<64>(background_id), true);
    return true;
}

bool run_visible_background(const void* args, const bn::string<64> scene_id) {
    if(!args) return true;
    return run_visible_background(*static_cast<const LayerVisibilityEventData*>(args), scene_id);
}

bool run_visible_background(const LayerVisibilityEventData& data, const bn::string<64>& scene_id) {
    GraphicsManager::instance().set_layer_visible(data.layer_id, data.visible);
    return true;
}

bool run_visible_background_legacy(const void* args, const bn::string<64> scene_id) {
    if(!args) return true;
    const void* const* root = static_cast<const void* const*>(args);
    const int* layer_id = static_cast<const int*>(root[0]);
    const bool* visible = static_cast<const bool*>(root[1]);
    if(!layer_id || !visible) return true;
    GraphicsManager::instance().set_layer_visible(*layer_id, *visible);
    return true;
}

bool run_change_palette_background(const void* args, const bn::string<64> scene_id) {
    if(!args) return true;
    return run_change_palette_background(*static_cast<const PaletteLayerEventData*>(args), scene_id);
}

bool run_change_palette_background(const PaletteLayerEventData& data, const bn::string<64>& scene_id) {
    GraphicsManager::instance().change_palette_layer(data.layer_id, data.palette_ids, data.restore_palette);
    return true;
}

bool run_change_palette_background_legacy(const void* args, const bn::string<64> scene_id) {
    if(!args) return true;
    const void* const* root = static_cast<const void* const*>(args);
    const int* layer_id = static_cast<const int*>(root[0]);
    const bool* restore_palette = static_cast<const bool*>(root[1]);
    const char* const* palette_ids = root[2] ? static_cast<const char* const*>(root[2]) : nullptr;
    if(!layer_id || !restore_palette) return true;
    GraphicsManager::instance().change_palette_layer(*layer_id, palette_ids, *restore_palette);
    return true;
}
