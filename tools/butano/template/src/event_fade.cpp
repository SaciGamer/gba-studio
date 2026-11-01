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

// Funções auxiliares privadas (não expostas no .h)
bool run_fade(const int fadeSpeed, FadeType fadeType, Fade& state) {
    if(state.active) {
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
                state.active = false;
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
                state.active = false;
                bn::blending::set_fade_alpha(bn::blending_fade_alpha(1)); // totalmente escuro
                BN_LOG("runFade: fade end");
                return true; // terminou, pode prosseguir
            }
        }
    }

    return false;
}

EventStatus run_fade_status(const FadeEventData& data, FadeType fadeType, Fade& state)
{
    if(!state.active)
    {
        bn::blending::set_transparency_alpha(bn::fixed(1));
        state.speed = data.speed < 1 ? 1 : data.speed;
        state.active = true;
        if(fadeType == FadeType::IN) bn::blending::set_fade_alpha(bn::blending_fade_alpha(1));
        else bn::blending::set_fade_alpha(bn::blending_fade_alpha(0));
    }
    return run_fade(state.speed, fadeType, state)
        ? EventStatus::completed : EventStatus::running;
}

bool run_fade(const FadeEventData& data, FadeType fadeType, Fade& state)
{
    return run_fade_status(data, fadeType, state) == EventStatus::completed;
}

bool run_fade(const void* args, FadeType fadeType, Fade& state) {
    if(!args) return true;
    return run_fade(*static_cast<const FadeEventData*>(args), fadeType, state);
}

bool run_fade(const int fadeSpeed, FadeType fadeType, bool active)
{
    fade.speed = fadeSpeed;
    fade.active = active;
    return run_fade(fadeSpeed, fadeType, fade);
}

bool run_fade(const void* args, FadeType fadeType)
{
    return run_fade(args, fadeType, fade);
}
