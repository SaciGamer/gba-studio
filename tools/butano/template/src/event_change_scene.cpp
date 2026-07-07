#include "event_change_scene.h"

#include "bn_log.h"
#include "bn_core.h"
#include "bn_string.h"

#include "event_fade.h"
#include "graphics_manager.h"
#include "script_command_manager.h"
#include "resource_types.h"

ChangeScene changeScene;

namespace change_scene_functions {
    int to_int(const char* str) {
        int result = 0;
        while(*str) {
            if(*str >= '0' && *str <= '9') {
                result = result * 10 + (*str - '0');
            }
            ++str;
        }
        return result;
    }

    bn::fixed to_fixed(const char* str) {
        int integerPart = 0;
        int fractionalPart = 0;
        int divisor = 1;
        bool afterDecimal = false;

        while (*str) {
            if (*str == '.') {
                afterDecimal = true;
            } else if (*str >= '0' && *str <= '9') {
                if (!afterDecimal) {
                    integerPart = integerPart * 10 + (*str - '0');
                } else {
                    fractionalPart = fractionalPart * 10 + (*str - '0');
                    divisor *= 10;
                }
            }
            ++str;
        }

        float result = integerPart + (divisor > 1 ? (float)fractionalPart / divisor : 0.0f);
        return bn::fixed(result);
    }
}

bool runChangeScene(const void* args) {
    if (changeScene.active) {
        if(runFade(changeScene.fadeSpeed, FadeType::OUT, true)) {
            changeScene.active = false;

            // aqui troca a cena de fato
            const Scenes* nextScene = GraphicsManager::instance().loadNextSceneById(changeScene.next_scene_id);
            // bn::blending::set_fade_alpha(bn::blending_fade_alpha(0)); // totalmente claro, reset
            
            BN_LOG("runChangeScene sceneName: ", nextScene->name);
            return true;
        }
    } else {
        BN_LOG("runChangeScene intancia nova");
        const char* const* strArgs = static_cast<const char* const*>(args);

        changeScene.next_scene_id = strArgs[0];                                 // id da próxima cena   
        changeScene.direction = strArgs[3];                                     // direção
        changeScene.fadeSpeed = change_scene_functions::to_int(strArgs[4]);     // velocidade do fade
        
        changeScene.countFixed = bn::fixed(0);                                  // contador
        changeScene.active = true;                                              // ativador
    }

    return false;
}