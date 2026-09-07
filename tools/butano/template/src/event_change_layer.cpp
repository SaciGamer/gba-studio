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

bn::vector<LayerArgs, 4> changeLayer;

bool run_change_layer(const void* args, const bn::string<64> scene_id) {
    if (changeLayer.size() != 0) {
        // Carrega backgrounds a partir dos IDs já definidos
        // auto scene = GraphicsManager::instance().load_next_scene_by_id(scene_id);

        // bn::string<64> scene_type = scene->scene_type;
        // BN_LOG("Scene type: ", scene_type.data());
        // if(scene_type != "Logo" && scene_type != "Point Click") {
        //     BN_LOG("Renderizando cena com REGULAR BG");
        //     GraphicsManager::instance().load_next_regular_background_by_id(changeLayer);
        // } else {
        //     BN_LOG("Renderizando cena com BITMAP BG");
        //     GraphicsManager::instance().load_next_bitmap_background_by_id(changeLayer);
        // }
        GraphicsManager::instance().change_layer(changeLayer);
        
        changeLayer.clear();
        return true;
    } else {
        BN_LOG("runChangeLayer intancia nova");
        changeLayer.clear();

        const void* const* root = static_cast<const void* const*>(args);
        const void* const* layers = static_cast<const void* const*>(root[0]);

        for(int i = 0; i < 4; i++) {
            const void* const* layerArray = static_cast<const void* const*>(layers[i]);

            const int* idStr = static_cast<const int*>(layerArray[0]);
            const char* bgId = static_cast<const char*>(layerArray[1]);
            const bool* visStr = static_cast<const bool*>(layerArray[2]);

            LayerArgs layer;
            layer.layer_id = *idStr;
            layer.background_id = bgId ? bn::string<64>(bgId) : bn::string<64>();
            layer.visible = *visStr;

            BN_LOG("runChangeLayer LayerArgs Layer: ", layer.layer_id);
            BN_LOG("runChangeLayer LayerArgs BackgroundID: ", layer.background_id);
            BN_LOG("runChangeLayer LayerArgs visible: ", layer.visible);

            changeLayer.push_back(layer);
        }

    }

    return false;
}