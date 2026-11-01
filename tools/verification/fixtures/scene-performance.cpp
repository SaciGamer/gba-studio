// Appended only to benchmark ROMs; never included in shipped runtime sources.
#include "bn_timer.h"
#include "bn_sprites.h"
#include "script_trigger_manager.h"
#include <new>

void GraphicsManager::verify_scene_performance()
{
    static int sample = 0;
    static int ticks = 0;
    static int checksum = 0;
    alignas(Scenes) static BN_DATA_EWRAM_BSS unsigned char scene_storage[sizeof(Scenes)];
    static Scenes* scene = nullptr;
    static BN_DATA_EWRAM_BSS Sprites body;
    static int frames[64] = {};
    static BN_DATA_EWRAM_BSS SpriteAnimationDefinition clips[32];
    static BN_DATA_EWRAM_BSS SceneCollision collisions[128];
    static BN_DATA_EWRAM_BSS ScriptTrigger triggers[64];
    static const int tile_frames[] = { 0, 0 };
    static BN_DATA_EWRAM_BSS TileAnimation tiles[32];
    static BN_DATA_EWRAM_BSS ScriptTriggerManager trigger_manager;
    constexpr int samples = 32;
    constexpr int phases = 7;
    if(!currentScene || player_slot < 0) return;
    if(sample >= samples * phases) {
#ifndef SCENE_PERFORMANCE_BASELINE
        static bool checked = false;
        if(!checked) {
            auto item = get_sprite_item_from_name(bn::string<64>(body.graphics_name));
            BN_ASSERT(item, "Capacity fixture sprite missing");
            for(int index = 17; index < 128; ++index) {
                auto created = create_sprite(*item, (index % 16) * 14 - 112, (index / 16) * 18 - 64);
                BN_ASSERT(created, "Unable to allocate 128 shared sprites");
            }
            BN_ASSERT(bn::sprites::used_items_count() == 128, "Capacity fixture must reach the hardware object count");
            remove_sprite(*sprites[17]);
            auto recycled = create_sprite(body, *item, 0, 0, "right");
            BN_ASSERT(recycled && created_sprite_root == 17, "Full high-water table must reuse a freed slot");
            recycled.reset();
            for(int index = 17; index < 128; ++index) if(sprites[index]) remove_sprite(*sprites[index]);
            BN_ASSERT(bn::sprites::used_items_count() == 17, "Capacity fixture leaked sprite handles");
            BN_LOG("[SPRITE_CAPACITY_OK]128 live sprites; recycled full table");
            checked = true;
        }
#endif
        return;
    }
    if(sample == 0) {
        BN_ASSERT(actor_count == 16, "Benchmark requires 16 live actors");
        body = *sprite_resources[player_slot];
        for(int i = 0; i < 32; ++i) {
            const char* type = i % 4 == 0 ? "idle" : i % 4 == 1 ? "movement" : i % 4 == 2 ? "jump" : "climb";
            clips[i] = { nullptr, "clip", type, frames, 64, false };
            tiles[i] = { i % 4, i / 4, tile_frames, 2, 8, true, 0 };
        }
        body.animations = clips;
        body.animations_count = 32;
        for(int i = 0; i < sprite_count; ++i) if(sprites[i] && sprite_resources[i]) {
            sprite_resources[i] = &body;
            sprite_animations[i] = &clips[0];
            sprite_main_states[i] = nullptr;
            sprite_animation_speeds[i] = 5;
        }
        for(int i = 0; i < 128; ++i) collisions[i] = { 300 + i * 8, 300, 8, 8, "solid" };
        collisions[127] = { 0, 140, 256, 8, "solid" };
        for(auto& trigger : triggers) trigger = { 300, 300, 8, 8, TriggerActivation::enter, true, false, 0, nullptr, 0, nullptr, 0 };
        scene = new(scene_storage) Scenes(*currentScene);
        scene->collisions = collisions; scene->collisions_count = 128;
        scene->triggers = triggers; scene->triggers_count = 64;
        scene->tile_animations = tiles; scene->tile_animations_count = 32;
        currentScene = scene;
        BN_LOG("[SCENE_LOAD] actors=", actor_count, " sprites=", bn::sprites::used_items_count(), " colliders=128 triggers=64 tiles=32");
    }
    const int phase = sample / samples;
    InputManager::instance().queue_default_action("RIGHT");
    InputManager::instance().poll();
    player_world_x = 100; player_world_y = 100;
    bn::timer timer;
    switch(phase) {
        case 0: move_player_from_input(); break;
        case 1: set_player_animation(true); break;
        case 2: update_sprites(); break;
        case 3: trigger_manager.update(*scene, 100, 100, false, false, false); break;
        case 4: update_tile_animations(); break;
        case 5: update_default_palettes(); break;
        case 6: update_actor_residency(); break;
        default: break;
    }
    ticks += timer.elapsed_ticks();
    checksum += player_world_x + player_world_y + sprite_animation_frames[player_slot];
    ++sample;
    if(sample % samples == 0) {
        const char* names[] = { "movement", "player_animation", "sprites", "triggers", "tiles", "palettes", "residency" };
        BN_LOG("[SCENE_PERFORMANCE] ", names[phase], " ticks=", ticks, " checksum=", checksum);
        ticks = checksum = 0;
    }
}
