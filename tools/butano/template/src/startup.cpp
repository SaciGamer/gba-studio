/**
 * {{PROJECT_NAME}} - GBA Game
 * Author: {{AUTHOR}}
 * Version: {{VERSION}}
 * 
 * Built with GBA Studio engine for Butano
 */

#include "startup.h"

// #include "bn_regular_bg_items_gba_studio.h"
// #include "bn_regular_bg_items_light_bg.h"

// #include "bn_regular_bg_items_gba_studio_startup_anim.h"
#include "bn_direct_bitmap_items_gba_studio_startup_anim.h"

// #include "bn_sprite_items_sphere_light.h"
// #include "bn_sprite_items_diamond_light.h"

// #include "bn_sprite_items_lyrics_gamer_boy.h"
// #include "bn_sprite_builder.h"

// #include "bn_sprite_palette_items_lyrics_alt.h"
// #include "bn_sprite_items_lyrics_g.h"
// #include "bn_sprite_items_lyrics_a.h"
// #include "bn_sprite_items_lyrics_m.h"
// #include "bn_sprite_items_lyrics_e.h"
// #include "bn_sprite_items_lyrics_r.h"
// #include "bn_sprite_items_lyrics_b.h"
// #include "bn_sprite_items_lyrics_o.h"
// #include "bn_sprite_items_lyrics_y.h"

#include "bn_log.h"

#include "graphics_manager.h"

#include "event_fade.h"

#include "bn_color_effect.h"

// AUDIO
#include "bn_audio.h"
#include "bn_music_actions.h"
#include "bn_sound_actions.h"

// #include "bn_music_items.h"
#include "bn_sound_items.h"
// #include "startup_intro_frames.h"

// Don't have transparence to words
// void show_start_screen()
// {
//     // Fundo Branco
//     bn::bg_palettes::set_transparent_color(bn::color(31, 31, 31)); 

//     // Sprite da logo "GBA Studio"
//     bn::regular_bg_ptr gba_studio_logo = bn::regular_bg_ptr::create(bn::regular_bg_items::gba_studio);

//     gba_studio_logo.set_z_order(3);

//     GraphicsManager::instance().startup_screen(gba_studio_logo);

//     bn::vector<LetraAnim, 8> letras;
//     // bn::vector<bn::color, 12> lyric_colors;

//     int destino_y = -20;

//     // Posição final
//     letras.push_back({bn::sprite_items::lyrics_g.create_sprite(-90, 0), 10});    // G
//     letras.push_back({bn::sprite_items::lyrics_a.create_sprite(-68, 0), 15});    // A
//     letras.push_back({bn::sprite_items::lyrics_m.create_sprite(-43, 0), 20});    // M
//     letras.push_back({bn::sprite_items::lyrics_e.create_sprite(-7, 0), 25});     // E
//     letras.push_back({bn::sprite_items::lyrics_r.create_sprite(11, 0), 30});     // R
//     letras.push_back({bn::sprite_items::lyrics_b.create_sprite(45, 0), 35});     // B
//     letras.push_back({bn::sprite_items::lyrics_o.create_sprite(72, 0), 40});     // O
//     letras.push_back({bn::sprite_items::lyrics_y.create_sprite(96, 0), 45});     // Y

//     // bn::blending::set_transparency_alpha(0.2);
//     // luz_esferica.set_blending_bottom_enabled(false);

//     // bn::sprite_palette_ptr luz_esferica_palette = bn::sprite_palette_ptr(luz_esferica.palette());
//     // luz_esferica_palette.set_fade(bn::color(31, 31, 31), bn::fixed(0.5));

//     // lyric_colors.push_back(bn::color(16, 0, 31)); // Purple
//     // lyric_colors.push_back(bn::color(31, 28, 31)); // Light Purple
//     // lyric_colors.push_back(bn::color(31, 0, 31)); // Pink
//     // lyric_colors.push_back(bn::color(31, 0, 16)); // Black Pink
//     // lyric_colors.push_back(bn::color(31, 0, 0));  // Red
//     // lyric_colors.push_back(bn::color(31, 16, 0)); // Orange
//     // lyric_colors.push_back(bn::color(31, 31, 0)); // Yellow
//     // lyric_colors.push_back(bn::color(16, 31, 0)); // Limmon
//     // lyric_colors.push_back(bn::color(0, 31, 0));  // Green
//     // lyric_colors.push_back(bn::color(0, 31, 16)); // Light Green 
//     // lyric_colors.push_back(bn::color(0, 31, 31)); // Cian Blue 
//     // lyric_colors.push_back(bn::color(0, 16, 31)); // Light Blue
//     // lyric_colors.push_back(bn::color(0, 0, 31));  // Blue
    
//     // Inicialmente invisíveis
//     for(auto& letra : letras)
//     {
//         letra.sprite.set_visible(false);
//         if (letra.x_final == 11){
//             letra.sprite.set_x(letra.x_final + 25);
//         } else if (letra.x_final > 0) {
//             letra.sprite.set_x(letra.x_final - 25);
//         } else {
//             letra.sprite.set_x(letra.x_final + 25);
//         }

//         // Coloca todas as cores
//         // for(int i = 0; i < 12; i++)
//         // {
//         //     letra.spritePalette.set_color(i+1, lyric_colors[i]);
//         // }
//         // letra.sprite.set_blending_enabled(true); // para desaparecer
//         letra.spritePalette.set_color(1, bn::color(16, 0, 31)/*lyric_colors[0]*/); // funciona com apenas uma cor!

//         // letra.sprite.set_blending_enabled(true);
//         // letra.spritePalette.set_fade(lyric_colors[bn::min(++letra.index_color, lyric_colors.size()-1)], 1); // Não preisa usar o Fade
//     }

//     // FADE IN
//     bn::blending::set_fade_alpha(bn::blending_fade_alpha(1));
//     bn::blending::set_white_fade_color();
//     // bn::blending::set_fade_color(bn::blending::fade_color_type::WHITE);
//     while (!runFade(1, FadeType::IN, true)) {
//         bn::core::update();
//     }

//     // bn::music_items::cyberrid.play(0.5);
//     bn::sound_items::gba_startup.play(1);

//     int frame = 0;
//     while(frame < 135)
//     {
//         ++frame;

//         for(auto& l : letras)
//         {
//             if(frame >= l.start_frame)
//             {
//                 if(!l.started)
//                 {
//                     l.sprite.set_visible(true);
//                     l.sprite.set_scale(3.0f); // começa grande 3.0f
//                     l.started = true;
//                 }

//                 // Escala diminuindo até 1.0
//                 float scale = bn::max(1.0f, 3.0f - ((frame - l.start_frame) * 0.05f));
//                 l.sprite.set_scale(scale);
//                 // l.sprite.set_double_size_mode(bn::sprite_double_size_mode::AUTO);

//                 int y_offset = bn::sin((frame - l.start_frame) * 0.01f).to_float() * -120;
//                 if(l.onda <= 26) {
//                     l.sprite.set_y(60 + y_offset);

//                     if (l.sprite.y() <= destino_y) {
//                         ++l.onda;
//                     }
                     
//                     if (l.onda >= 20) {
//                         if (l.x_final == 11 && l.x_final < l.sprite.x()) {
//                             l.sprite.set_x(l.sprite.x() - 1);
//                         } else if (l.x_final > l.sprite.x() && l.x_final > 0) {
//                             l.sprite.set_x(l.sprite.x() + 1);
//                         } else if (l.x_final < l.sprite.x() && l.x_final < 0) {
//                             l.sprite.set_x(l.sprite.x() - 1);
//                         }
//                     } 
//                 } else {
//                     if (l.x_final == 11 && l.x_final < l.sprite.x()) {
//                         l.sprite.set_x(l.sprite.x() - 1);
//                     } else if (l.x_final > l.sprite.x() && l.x_final > 0) {
//                         l.sprite.set_x(l.sprite.x() + 1);
//                     } else if (l.x_final < l.sprite.x() && l.x_final < 0) {
//                         l.sprite.set_x(l.sprite.x() - 1);
//                     } else {
//                         l.update();
//                     }
//                 }

//                 if ((frame - l.start_frame) % 6 == 0) {
//                     l.intensidade = bn::min(l.intensidade + 0.1f, 0.9f);
//                     l.spritePalette.set_hue_shift_intensity(l.intensidade);
//                 } 
//             }
//         }

//         bn::core::update();
//     }

//     // bn::regular_bg_ptr ligth_logo = bn::regular_bg_ptr::create(bn::regular_bg_items::light_bg);
//     // ligth_logo.set_blending_enabled(true);

//     // EFEITO LUZ
//     bn::sprite_ptr luz_esferica = bn::sprite_items::sphere_light.create_sprite(0, destino_y - 8);
//     bn::sprite_palette_ptr luz_paleta = bn::sprite_palette_ptr(luz_esferica.palette());
    
//     // luz_paleta.set_brightness(1);

//     // bn::blending::set_transparency_alpha(bn::fixed(0.5));
//     luz_esferica.set_visible(false);
//     luz_esferica.set_blending_enabled(true);

//     bn::blending::set_transparency_alpha(0.3);

//     // bn::color base_color = bn::color(0, 0, 8);   // blue
//     // bn::color alvo_color = bn::color(16, 0, 16);    // purple

//     const bn::sprite_palette_item& first_source_palette_item = bn::sprite_items::sphere_light.palette_item();
//     const bn::sprite_palette_item& second_source_palette_item = bn::sprite_palette_items::lyrics_alt;

//     bn::fixed x = -200;
//     while(x < 450)
//     {
//         luz_esferica.set_x(x);
//         x += bn::fixed(3.5); // move a faixa para a direita

//         for(auto& letra : letras)
//         {
//             int distancia_luz = 20;
//             bn::fixed distancia = bn::abs(letra.sprite.x() - (x - distancia_luz));

//             // intensidade do efeito: mais forte quando a luz está perto
//             bn::fixed intensidade = (distancia < bn::fixed(18)) ? bn::fixed(1) : bn::max(bn::fixed(0), bn::fixed(1) - distancia / bn::fixed(200));

//             // mistura entre paleta base e alternativa
//             alignas(int) bn::array<bn::color, 16> dest_palette_colors;
//             bn::sprite_palette_item dest_palette_item(dest_palette_colors, first_source_palette_item.bpp());

//             bn::color_effect::blend(
//                 first_source_palette_item.colors_ref(), 
//                 second_source_palette_item.colors_ref(),
//                 intensidade, 
//                 dest_palette_colors
//             );

//             letra.spritePalette.set_colors(dest_palette_colors);

//         }

//         bn::core::update();
//     }

//     bn::blending::set_transparency_alpha(1);

//     gba_studio_logo.set_blending_enabled(true);
//     for(auto& letra : letras)
//     {
//         letra.sprite.set_blending_enabled(true); // para desaparecer
//     }

//     // FADE OUT
//     while (!runFade(1, FadeType::OUT, true)) {
//         bn::core::update();
//     }

//     // bn::blending::set_fade_color(bn::blending::fade_color_type::BLACK);
//     bn::blending::set_black_fade_color();
// }

// Decompress image
// void decompress_frame(int frame_index,
//                       const bn::array<bn::color, 27840 * 160>& full_buffer,
//                       bn::array<bn::color, 240 * 160>& frame_buffer)
// {
//     int x_offset = frame_index * 240;
//     BN_LOG("x_offset:", x_offset);

//     for(int y = 0; y < 160; y++)
//     {
//         for(int x = 0; x < 240; x++)
//         {
//             frame_buffer[y * 240 + x] = full_buffer[y * 27840 + (x_offset + x)];
//         }
//     }
// }

void start_screen_anim()
{
    // Fundo Branco
    bn::bg_palettes::set_transparent_color(bn::color(31, 31, 31)); 

    // LOGO ANIM
    // Create background
    bn::sp_direct_bitmap_bg_ptr bmp_bg = bn::sp_direct_bitmap_bg_ptr::create();
    bmp_bg.set_blending_enabled(true);
    bn::sp_direct_bitmap_bg_painter painter(bmp_bg);

    // Create spritesheet
    const auto& spritesheet = bn::direct_bitmap_items::gba_studio_startup_anim;

    // Fill background
    painter.fill(bn::color(0, 0, 0));
    // Draw a first frame
    painter.blit(0, 0, spritesheet);

    // FADE IN
    bn::blending::set_fade_alpha(bn::blending_fade_alpha(1));
    bn::blending::set_white_fade_color();
    // bn::blending::set_fade_color(bn::blending::fade_color_type::WHITE);
    while (!runFade(1, FadeType::IN, true)) {
        bn::core::update();
    }

    // bn::music_items::cyberrid.play(0.5);
    // Start Music
    bn::sound_items::gba_startup.play(1);

    int current_frame = 0;
    while(current_frame < 135)
    {
        if (current_frame < 104)
            painter.blit(-current_frame * 240, 0, spritesheet);
        current_frame++;
        
        bn::core::update();
    }

    bn::blending::set_transparency_alpha(1);

    // FADE OUT
    while (!runFade(1, FadeType::OUT, true)) {
        bn::core::update();
    }

    // bn::blending::set_fade_color(bn::blending::fade_color_type::BLACK);
    bn::blending::set_black_fade_color();

}

// So much size
// void play_startup_animation()
// {
//     // Fundo Branco
//     bn::bg_palettes::set_transparent_color(bn::color(31, 31, 31)); 

//     bn::vector<bn::direct_bitmap_item, 104> frames; 
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_0);
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_1);
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_2);
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_3);
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_4);
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_5);
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_6);
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_7);
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_8);
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_9);
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_10);
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_11);
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_12);
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_13);
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_14);
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_15);
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_16);
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_17);
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_18);
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_19);
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_20);
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_21);
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_22);
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_23);
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_24);
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_25);
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_26);
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_27);
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_28);
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_29);
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_30);
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_31);
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_32);
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_33);
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_34);
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_35);
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_36);
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_37);
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_38);
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_39);
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_40);
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_41);
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_42);
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_43);
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_44);
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_45);
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_46);
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_47);
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_48);
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_49);
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_50);
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_51);
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_52);
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_53);
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_54);
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_55);
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_56);
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_57);
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_58);
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_59);
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_60);
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_61);
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_62);
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_63);
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_64);
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_65);
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_66);
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_67);
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_68);
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_69);
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_70);
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_71);
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_72);
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_73);
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_74);
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_75);
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_76);
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_77);
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_78);
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_79);
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_80);
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_81);
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_82);
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_83);
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_84);
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_85);
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_86);
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_87);
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_88);
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_89);
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_90);
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_91);
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_92);
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_93);
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_94);
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_95);
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_96);
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_97);
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_98);
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_99);
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_100);
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_101);
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_102);
//     frames.push_back(bn::direct_bitmap_items::gba_studio_startup_103);

//     bn::sp_direct_bitmap_bg_ptr bmp_bg = bn::sp_direct_bitmap_bg_ptr::create();
//     bmp_bg.set_blending_enabled(true);
//     bn::sp_direct_bitmap_bg_painter painter(bmp_bg);

//     // Fill background
//     painter.fill(bn::color(0, 0, 0));
//     painter.unsafe_blit(0, 0, frames[0]);

//     // FADE IN
//     bn::blending::set_fade_alpha(bn::blending_fade_alpha(1));
//     bn::blending::set_white_fade_color();
//     while (!runFade(1, FadeType::IN, true)) {
//         bn::core::update();
//     }

//     bn::sound_items::gba_startup.play(1);
//     for(int i = 0; i < frames.size(); i++)
//     {
//         painter.unsafe_blit(0, 0, frames[i]);
//         bn::core::update();
//     }

//     bn::blending::set_transparency_alpha(1);

//     // FADE OUT
//     while (!runFade(1, FadeType::OUT, true)) {
//         bn::core::update();
//     }

//     bn::blending::set_black_fade_color();
// }