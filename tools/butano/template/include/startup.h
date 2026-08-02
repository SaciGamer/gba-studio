#include "bn_core.h"

#include "bn_display.h"
#include "bn_math.h"

#include "bn_regular_bg_ptr.h"
#include "bn_direct_bitmap_item.h"

#include "bn_sprite_ptr.h"
#include "bn_sprite_tiles_ptr.h"
#include "bn_sprite_palette_ptr.h"
#include "bn_sprite_text_generator.h"
#include "bn_sprite_font.h"

#include "bn_blending.h"

#include "bn_bg_palette_ptr.h"

enum class Estado { ESTICANDO, SOLTO };

struct LetraAnim
{
    bn::sprite_ptr sprite;

    int start_frame;
    bool started = false;
    int onda = 0;
    bool quicar = false;
    bn::sprite_palette_ptr spritePalette;
    float intensidade = 0.0f;
    int index_color = 0;

    bn::fixed x_final;

    // Efeito mola
    bn::fixed y_final = -20;
    bn::fixed velocidade = 0;
    bn::fixed k = 0.10;                 // rigidez da mola
    bn::fixed damping = 0.85;           // amortecimento
    bn::fixed deslocamento_max = 20;    // altura máxima de esticar
    Estado estado = Estado::ESTICANDO;
    
    LetraAnim(bn::sprite_ptr s, int sf) :
        sprite(s),
        start_frame(sf),
        spritePalette(bn::sprite_palette_ptr(s.palette()))
    {
        sprite.set_palette(spritePalette);
        x_final = sprite.x();
    }

    void update() {
        if(estado == Estado::ESTICANDO) {
            // sobe até o ponto máximo
            sprite.set_y(sprite.y() - 1);

            if(sprite.y() <= y_final - deslocamento_max) {
                estado = Estado::SOLTO; // chegou no ponto de soltar
            }
        }
        else if(estado == Estado::SOLTO) {
            bn::fixed deslocamento = sprite.y() - y_final;
            bn::fixed forca = -k * deslocamento;

            velocidade += forca;
            velocidade *= damping;

            bn::fixed novo_y = sprite.y() + velocidade;

            if(novo_y > y_final) {
                novo_y = y_final;
                if(velocidade > 0) {
                    velocidade = -velocidade * damping;
                }
            }

            sprite.set_y(novo_y);
        }
    }

};

// void show_start_screen();

void start_screen_anim();

// void play_startup_animation();