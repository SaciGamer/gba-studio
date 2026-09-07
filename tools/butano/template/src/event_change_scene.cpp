/**
 * {{PROJECT_NAME}} - GBA Game
 * Author: {{AUTHOR}}
 * Version: {{VERSION}}
 * 
 * Built with GBA Studio engine for Butano
 */

#include "event_change_scene.h"

#include "bn_log.h"
#include "bn_core.h"
#include "bn_string.h"

#include "event_fade.h"
#include "graphics_manager.h"
#include "script_command_manager.h"
#include "resource_types.h"

ChangeScene changeScene;

bool run_change_scene(const void* args) {
    if (changeScene.active) {
        if(run_fade(changeScene.fadeSpeed, FadeType::OUT, true)) {
            changeScene.active = false;

            // aqui troca a cena de fato
            const Scenes* nextScene = GraphicsManager::instance().load_next_scene_by_id(changeScene.next_scene_id);
            // bn::blending::set_fade_alpha(bn::blending_fade_alpha(0)); // totalmente claro, reset
            
            BN_LOG("runChangeScene sceneName: ", nextScene->name);
            return true;
        }
    } else {
        BN_LOG("runChangeScene intancia nova");
        const void* const* strArgs = static_cast<const void* const*>(args);
        
        const char* next_scene_id = reinterpret_cast<const char*>(strArgs[0]);
        const char* direction = reinterpret_cast<const char*>(strArgs[3]);
        const int* fadeSpeed = reinterpret_cast<const int*>(strArgs[4]);

        changeScene.next_scene_id = next_scene_id;                              // id da próxima cena   
        changeScene.direction = direction;                                      // direção
        changeScene.fadeSpeed = *fadeSpeed;                                     // velocidade do fade
        
        changeScene.countFixed = bn::fixed(0);                                  // contador
        changeScene.active = true;                                              // ativador
    }

    return false;
}