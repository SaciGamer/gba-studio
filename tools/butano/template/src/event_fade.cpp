/**
 * {{PROJECT_NAME}} - GBA Game
 * Author: {{AUTHOR}}
 * Version: {{VERSION}}
 * 
 * Built with GBA Studio engine for Butano
 */

#include "event_fade.h"

#include "bn_log.h"
#include "bn_core.h"

Fade fade;

namespace fade_functions {
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
}

// Funções auxiliares privadas (não expostas no .h)
bool runFade(const int fadeSpeed, FadeType fadeType, bool active) {
    if(active) {
        int skipped = bn::core::skip_frames();
        int fps = 60 / (skipped + 1);   // se skip=0 → 60, se skip=1 → 30, etc.

        bn::fixed step = bn::fixed(1) / (fadeSpeed * fps);
        bn::fixed alpha = bn::blending::fade_alpha();

        if (fadeType == FadeType::IN) {         // FADE-IN
            if(alpha > bn::fixed(0)) {
                bn::blending::set_fade_alpha(std::max(alpha - step, bn::fixed(0)));
                // BN_LOG("runFade: fade processando: ", std::max(alpha - step, bn::fixed(0)));
                return false; // continua rodando
            } else {
                fade.active = false;
                bn::blending::set_fade_alpha(bn::blending_fade_alpha(0)); // totalmente claro
                BN_LOG("runFade: fade end");
                return true; // terminou, pode prosseguir
            }
        } else if (fadeType == FadeType::OUT) { // FADE-OUT
            if(alpha < bn::fixed(1)) {
                bn::blending::set_fade_alpha(std::min(alpha + step, bn::fixed(1)));
                // BN_LOG("runFade: fade processando: ", std::min(alpha + step, bn::fixed(1)));
                return false; // continua rodando
            } else {
                fade.active = false;
                bn::blending::set_fade_alpha(bn::blending_fade_alpha(1)); // totalmente escuro
                BN_LOG("runFade: fade end");
                return true; // terminou, pode prosseguir
            }
        }
    }

    return false;
}

bool runFade(const void* args, FadeType fadeType) {
    if (!fade.active) {
        // converte o ponteiro genérico para array de strings
        const char* const* strArgs = static_cast<const char* const*>(args);

        // pega o tempo do fade (em frames)
        fade.speed = fade_functions::to_int(strArgs[0]);
        BN_LOG("runFade: fadeTime = ", fade.speed);
        fade.active = true;

        // bn::blending::set_fade_color(bn::color(0,0,0));
        if (fadeType == FadeType::IN) {         // FADE-IN
            bn::blending::set_fade_alpha(bn::blending_fade_alpha(1));
        } else if (fadeType == FadeType::OUT) { // FADE-OUT
            bn::blending::set_fade_alpha(bn::blending_fade_alpha(0));
        }
    }

    return runFade(fade.speed, fadeType, fade.active);
}