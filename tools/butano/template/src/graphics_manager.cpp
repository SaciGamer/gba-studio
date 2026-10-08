/**
 * {{PROJECT_NAME}} - GBA Game
 * Author: {{AUTHOR}}
 * Version: {{VERSION}}
 * 
 * Built with GBA Studio engine for Butano
 */

#include "bn_string.h"
#include "bn_log.h"
#include "bn_vector.h"
#include "bn_regular_bg_ptr.h"
#include "bn_regular_bg_map_cell_info.h"
#include "bn_regular_bg_map_ptr.h"
#include "bn_bg_palette_item.h"
#include "bn_bg_palette_ptr.h"
#include "bn_sprite_palette_ptr.h"
#include "bn_array.h"

#include "graphics_manager.h"
#include "actor_motion_manager.h"
#include "actor_manager.h"
#include "shooter_kit.h"
#include "script_command_manager.h"
#include "bn_keypad.h"
#include "camera_manager.h"
#include "input_manager.h"
#include "common_variable_8x8_sprite_font.h"

#ifndef BN_DATA_EWRAM_BSS
#define BN_DATA_EWRAM_BSS __attribute__((section(".sbss")))
#endif

GraphicsManager& GraphicsManager::instance()
{
    // Sprite/background state is large enough to crowd the IWRAM stack and
    // overwrite the audio mixer during graphics updates. Keep it in EWRAM.
    static BN_DATA_EWRAM_BSS GraphicsManager gm;
    return gm;
}

namespace
{
    bool animation_frames_fit(const SpriteAnimationDefinition& animation, int graphics_count)
    {
        if(!animation.frames || animation.frames_count <= 0 || graphics_count <= 0) return false;
        for(int index = 0; index < animation.frames_count; ++index)
            if(animation.frames[index] < 0 || animation.frames[index] >= graphics_count) return false;
        return true;
    }

    struct SpriteEffectState
    {
        int frame;
        int duration;
        int start_rotation;
        int target_rotation;
        int start_scale;
        int target_scale;
        int start_fade;
        int target_fade;
        bool active;
        bool fade_white;
    };

    BN_DATA_EWRAM_BSS SpriteEffectState sprite_effect_states[16];
}

bn::optional<bn::regular_bg_item> get_bg_item_from_name(const bn::string<64>& name)
{
    BN_LOG("..: get_bg_item_from_name, name: ", name.data(), " :..");

    {{BACKGROUND_CONDITIONALS_FROM_NAME}}
    /* Example if
    if(name == bn::string<64>("castle_novo"))
        return bn::regular_bg_items::castle_novo;
    */
    return bn::nullopt;
}

bn::optional<bn::direct_bitmap_item> get_bitmap_bg_item_from_name(const bn::string<64>& name)
{
    BN_LOG("..: get_bitmap_bg_item_from_name, name: ", name.data(), " :..");

    {{BITMAP_BACKGROUND_CONDITIONALS_FROM_NAME}}
    /* Exemplo:
    if(name == bn::string<64>("logo_bg"))
        return bn::direct_bitmap_items::logo_bg;
    */

    return bn::nullopt;
}

bn::optional<bn::sprite_item> get_sprite_item_from_name(const bn::string<64>& name)
{
    (void) name;
    (void) name;
    (void) name;
    {{SPRITE_CONDITIONALS_FROM_NAME}}
    return bn::nullopt;
}

// Gera background direto (bitmap sem paleta)
void generate_dp_direct_bitmap_bg_manager(int tilemap_rows, int tilemap_cols, const int* tile_data)
{
    for(int row = 0; row < tilemap_rows; row++) {
        for(int col = 0; col < tilemap_cols; col++) {
            int value = tile_data[row * tilemap_cols + col];
            // Exemplo: chamar função que desenha pixel/tile direto
            // draw_direct_bitmap_tile(row, col, value);
            BN_LOG("Draw Direct BG Tile", row, col, "=", value);
        }
    }
}

// Gera background usando paleta
void generate_palette_bitmap_bg_manager(bn::optional<bn::palette_bitmap_bg_ptr>& bg, int tilemap_rows, int tilemap_cols, const int* tile_data)
{
    BN_LOG("..: generate_palette_bitmap_bg_manager :..");

    // int tile_size = 16;
    // int start_x = 0;
    // int start_y = 0;

    BN_LOG("bg.has_value() = ", bg.has_value());
    BN_LOG("tilemap_rows = ", tilemap_rows);
    BN_LOG("tilemap_cols = ", tilemap_cols);
    BN_LOG("tile_data = ", tile_data);

    // if(!bg)
    // {
    //     BN_LOG("Tentando criar BG...");
    //     bg = bn::palette_bitmap_bg_ptr::create(bn::palette_bitmap_items::dungeon_tile_set_16_cores.palette_item());
    //     BN_LOG("bg_manager Criou o Background");
    // }
    
    // const bn::palette_bitmap_pixels_item& item = bn::palette_bitmap_items::dungeon_tile_set_16_cores.pixels_item();
    // BN_LOG("bg_manager Criou o item");

    // bn::palette_bitmap_bg_painter painter(*bg);
    // BN_LOG("bg_manager Criou o painter");

    // painter.clear();
    // BN_LOG("bg_manager Limpou o painter");

    // int tileset_cols = item.dimensions().width() / tile_size;
    // int tileset_rows = item.dimensions().height() / tile_size;
    // BN_LOG("Tileset cols:", tileset_cols, "rows:", tileset_rows);

    // for(int row = 0; row < tilemap_rows; row++) {
    //     for(int col = 0; col < tilemap_cols; col++) {
    //         int value = tile_data[row * tilemap_cols + col];

    //         if (value == -1)
    //             continue;

    //         int roi_x = (value % tileset_cols) * tile_size;
    //         int roi_y = (value / tileset_cols) * tile_size;

    //         //Desenhando pixel/tile por paleta
    //         painter.blit(
    //             start_x + col * tile_size,                  // posição X na tela
    //             start_y + row * tile_size,                  // posição Y na tela
    //             bn::palette_bitmap_roi(                     // BMP
    //                 item,                                   // image
    //                 roi_x,                                  // X dentro do tileset (image)
    //                 roi_y,                                  // Y dentro do tileset (image)
    //                 tile_size,                              // largura  
    //                 tile_size                               // altura
    //             )
    //         );

    //         // BN_LOG("bg_manager Tile", row, col, "=", value);
    //     }
    // }

    // painter.flip_page_later();
    BN_LOG("Tilemap initialized successfully!");
}

// ----------------- Implementação da classe -----------------

GraphicsManager::GraphicsManager() : sprite_count(0)
{
    for(int& index : shooter_projectile_indices) index = -1;
}
GraphicsManager::~GraphicsManager() {}

const Scenes* GraphicsManager::initialize()
{
    // ### CARREGAR BACKGROUND ###
    // 1. Pega o settings
    const Settings* settings = get_settings();
    if(!settings)
    {
        BN_LOG("Settings não encontrado");
        return nullptr;
    }

    // An empty Starting Scene is deliberate: never silently boot an arbitrary
    // scene, because that makes a project appear to ignore its configuration.
    const Scenes* scene = settings->start_scene_id && settings->start_scene_id[0] != '\0'
        ? GraphicsManager::load_next_scene_by_id(settings->start_scene_id)
        : nullptr;

    if(scene)
    {
        spawn_player(*scene, settings->start_x, settings->start_y, settings->direction);
    }

    return scene;
}

void GraphicsManager::spawn_player(const Scenes& scene, int tile_x, int tile_y, const char* direction)
{
    BN_LOG("Player init: begin");
    const Settings* settings = get_settings();
    if(!settings || !settings->player_sprite_id || settings->player_sprite_id[0] == '\0')
    {
        return;
    }

    const Sprites* player = get_sprite_by_id(bn::string<64>(settings->player_sprite_id));
    if(!player)
    {
        BN_LOG("Player sprite resource not found: ", settings->player_sprite_id);
        return;
    }

    auto item = get_sprite_item_from_name(bn::string<64>(player->graphics_name));
    if(!item.has_value())
    {
        BN_LOG("Player sprite item not found: ", player->name);
        return;
    }

    // Editor coordinates are scene tiles from its upper-left. Butano sprite
    // coordinates use the screen centre and the centre of the sprite itself.
    constexpr int TILE_SIZE = 16;
    constexpr int SCREEN_CENTER_X = 120;
    constexpr int SCREEN_CENTER_Y = 80;
    camera_x = scene.camera_x;
    camera_y = scene.camera_y;
    // The editor's canvas origin is the point anchored to the actor/player
    // position. Butano sprite coordinates refer to the sprite centre.
    player_world_x = tile_x * TILE_SIZE + player->canvas_origin_x;
    player_world_y = tile_y * TILE_SIZE + player->canvas_origin_y;
    player_vertical_velocity_q8 = 0;
    player_vertical_remainder_q8 = 0;
    player_grounded = false;
    player_climbing = false;
    const int x = player_world_x - camera_x - SCREEN_CENTER_X + (player->frame_width / 2) - player->canvas_origin_x;
    const int y = player_world_y - camera_y - SCREEN_CENTER_Y + (player->frame_height / 2) - player->canvas_origin_y;
    player_direction = direction ? direction : "right";
    BN_LOG("Player init: create sprite at frame dimensions ", player->frame_width, "x", player->frame_height);
    const auto player_sprite = create_sprite(*player, item.value(), x, y, player_direction.data());
    if(!player_sprite.has_value())
    {
        BN_LOG("Unable to allocate the player sprite slot");
        return;
    }
    player_slot = sprite_count - 1;
    BN_LOG("Player init: sprite created in slot ", player_slot);
    set_camera_position(camera_x, camera_y);
    BN_LOG("Player init: camera positioned");
}

void GraphicsManager::set_player_animation(bool moving, const char* requested_type)
{
    if(player_slot < 0 || player_slot >= sprite_count || !sprites[player_slot].has_value()) return;
    const Sprites* player = sprite_resources[player_slot];
    if(!player || !player->animations) return;
    const int graphics_count = sprite_tiles_items[player_slot].has_value()
        ? sprite_tiles_items[player_slot]->graphics_count() : 0;

    const char* family = moving ? "moving-" : "idle-";
    bn::string<32> directional_id(family);
    directional_id += player_direction;
    const SpriteAnimationDefinition* selected = nullptr;
    const SpriteAnimationDefinition* fallback = nullptr;
    for(int index = 0; index < player->animations_count; ++index)
    {
        const SpriteAnimationDefinition& animation = player->animations[index];
        if(sprite_main_states[player_slot] && bn::string<64>(animation.state_id ? animation.state_id : "") != sprite_main_states[player_slot]) continue;
        if(!animation_frames_fit(animation, graphics_count)) continue;
        const bn::string<32> animation_id(animation.animation_id ? animation.animation_id : "");
        const bn::string<16> animation_type(animation.animation_type ? animation.animation_type : "");
        if(animation_type == (requested_type ? requested_type : moving ? "movement" : "idle"))
        {
            if(!fallback) fallback = &animation;
            if(animation_id == directional_id || animation_id == (moving ? "moving" : "idle"))
            {
                selected = &animation;
                if(animation_id == directional_id) break;
            }
        }
    }
    selected = selected ? selected : fallback;
    if (!selected && requested_type) { set_player_animation(false); return; }
    if (!selected && sprite_animations[player_slot] && sprite_animations[player_slot]->animation_type &&
        bn::string<16>(sprite_animations[player_slot]->animation_type) == "climb") sprite_animations[player_slot] = nullptr;
    if(selected && sprite_animations[player_slot] != selected)
    {
        sprite_animations[player_slot] = selected;
        sprite_animation_frames[player_slot] = 0;
        sprite_animation_updates[player_slot] = 0;
        if(sprite_tiles_items[player_slot].has_value())
        {
            sprites[player_slot]->set_tiles(sprite_tiles_items[player_slot].value(), selected->frames[0]);
        }
    }
    if(selected)
    {
        const bn::string<32> animation_id(selected->animation_id ? selected->animation_id : "");
        sprites[player_slot]->set_horizontal_flip(player_direction == "left" &&
            (animation_id == "moving-right" || animation_id == "idle-right" ||
             animation_id == "running" || animation_id == "moving" || animation_id == "idle") &&
            selected->flip_right_to_create_left_frames);
    }
}

bool GraphicsManager::update_actor_interaction(bool interact_pressed)
{
    if(!currentScene || !currentScene->actors) return false;
    if(interact_pressed && !actor_interaction_script)
    {
        const int interaction_range = 16;
        int best_index = -1;
        int best_distance = 1000000;
        for(int index = 0; index < currentScene->actors_count; ++index)
        {
            const SceneActor& actor = currentScene->actors[index];
            // Scene actor coordinates are the sprite canvas anchor, matching
            // the editor preview. Do not convert them to the sprite's
            // top-left corner for interaction checks.
            const int actor_x = actor.x;
            const int actor_y = actor.y;
            const int dx = actor_x > player_world_x ? actor_x - player_world_x : player_world_x - actor_x;
            const int dy = actor_y > player_world_y ? actor_y - player_world_y : player_world_y - actor_y;
            if(dx <= interaction_range && dy <= interaction_range && actor.on_interact && actor.on_interact_count > 0)
            {
                const int distance = dx + dy;
                if(distance < best_distance) { best_distance = distance; best_index = index; }
            }
        }
        if(best_index >= 0)
        {
            actor_interaction_script = currentScene->actors[best_index].on_interact;
            actor_interaction_count = currentScene->actors[best_index].on_interact_count;
            ScriptCommand::instance().restart(currentScene->id, actor_interaction_script);
        }
    }
    if(!actor_interaction_script) return false;
    const bool completed = ScriptCommand::instance().execute(currentScene->id, actor_interaction_script, actor_interaction_count);
    if(completed)
    {
        actor_interaction_script = nullptr;
        actor_interaction_count = 0;
    }
    return true;
}

bool GraphicsManager::spawn_actor(const char* actor_id, int x, int y)
{
    if(!currentScene || !actor_id) return false;
    for(int i = 0; i < actor_count; ++i)
    {
        if(bn::string<64>(actor_ids[i]) == actor_id) return move_actor(actor_id, x, y);
    }
    const SceneActor* definition = nullptr;
    for(int i = 0; i < currentScene->actors_count; ++i)
    {
        if(currentScene->actors[i].id && bn::string<64>(currentScene->actors[i].id) == actor_id)
        {
            definition = &currentScene->actors[i];
            break;
        }
    }
    if(!definition || !definition->sprite_id) return false;
    const Sprites* resource = get_sprite_by_id(bn::string<64>(definition->sprite_id));
    auto item = resource ? get_sprite_item_from_name(bn::string<64>(resource->graphics_name)) : bn::optional<bn::sprite_item>();
    if(!resource || !item.has_value() || actor_count >= 16) return false;
    // x/y are the canvas anchor used by the editor. Butano sprites are
    // positioned by their center, so convert the anchor to the frame center
    // while preserving canvas_origin offsets.
    const int screen_x = x - camera_x - 120 + resource->frame_width / 2 - resource->canvas_origin_x;
    const int screen_y = y - camera_y - 80 + resource->frame_height / 2 - resource->canvas_origin_y;
    auto sprite = create_sprite(*resource, item.value(), screen_x, screen_y, definition->direction);
    if(!sprite.has_value()) return false;
    if(ActorManager::instance().spawn(bn::string<64>(actor_id), x, y).slot < 0)
    {
        remove_sprite(sprite.value());
        return false;
    }
    actor_ids[actor_count] = actor_id;
    actor_slots[actor_count] = sprite_count - 1;
    actor_world_x[actor_count] = x;
    actor_world_y[actor_count] = y;
    ++actor_count;
    return true;
}

const Sprites* GraphicsManager::read_script_actor_state(const char* actor_id, actor_motion::State& state) const
{
    if(!actor_id) return nullptr;
    if(bn::string<64>(actor_id) == "__PLAYER__") {
        if(player_slot < 0 || !sprites[player_slot]) return nullptr;
        state = {}; state.x = player_world_x; state.y = player_world_y;
        state.velocity_q8 = player_vertical_velocity_q8; state.remainder_q8 = player_vertical_remainder_q8;
        state.grounded = player_grounded; state.climbing = player_climbing;
        state.direction = player_direction == "left" ? 3 : player_direction == "up" ? 0 : player_direction == "down" ? 2 : 1;
        return sprite_resources[player_slot];
    }
    for(int i = 0; i < actor_count; ++i) if(actor_ids[i] == actor_id && actor_slots[i] >= 0 && sprites[actor_slots[i]]) {
        state = {}; state.x = actor_world_x[i]; state.y = actor_world_y[i];
        return sprite_resources[actor_slots[i]];
    }
    return nullptr;
}

bool GraphicsManager::apply_script_actor_state(const char* actor_id, const actor_motion::State& state, actor_motion::Action action)
{
    int slot = -1;
    const bool player = actor_id && bn::string<64>(actor_id) == "__PLAYER__";
    int old_x = 0, old_y = 0;
    if(player) {
        slot = player_slot; old_x = player_world_x; old_y = player_world_y;
        player_world_x = state.x; player_world_y = state.y;
        player_vertical_velocity_q8 = state.velocity_q8; player_vertical_remainder_q8 = state.remainder_q8;
        player_grounded = state.grounded; player_climbing = state.climbing;
        player_direction = state.direction == 3 ? "left" : state.direction == 0 ? "up" : state.direction == 2 ? "down" : "right";
    } else {
        for(int i = 0; actor_id && i < actor_count; ++i) if(actor_ids[i] == actor_id) {
            slot = actor_slots[i]; old_x = actor_world_x[i]; old_y = actor_world_y[i];
            actor_world_x[i] = state.x; actor_world_y[i] = state.y;
            ActorManager::instance().set_position_by_id(actor_ids[i], state.x, state.y);
            break;
        }
    }
    if(slot < 0 || slot >= sprite_count || !sprites[slot] || !sprite_resources[slot]) return false;
    const auto& resource = *sprite_resources[slot];
    const bool moving = state.x != old_x || state.y != old_y;
    const char* requested = state.climbing ? "climb" : actor_motion::platformer(*currentScene) && !state.grounded && state.x == old_x ? "jump" : moving ? "movement" : "idle";
    if(player) set_player_animation(moving, state.climbing ? "climb" : actor_motion::platformer(*currentScene) && !state.grounded && state.x == old_x ? "jump" : nullptr);
    else if(resource.animations && sprite_tiles_items[slot]) {
        const char* direction = state.direction == 3 ? "left" : state.direction == 0 ? "up" : state.direction == 2 ? "down" : "right";
        bn::string<32> directional(moving ? "moving-" : "idle-"); directional += direction;
        const SpriteAnimationDefinition* selected = nullptr;
        for(int i = 0; i < resource.animations_count; ++i) {
            const auto& clip = resource.animations[i];
            if(sprite_main_states[slot] && !actor_motion::same_text(clip.state_id, sprite_main_states[slot])) continue;
            if(!clip.animation_type || bn::string<16>(clip.animation_type) != requested || !animation_frames_fit(clip, sprite_tiles_items[slot]->graphics_count())) continue;
            if(!selected) selected = &clip;
            if(clip.animation_id && bn::string<32>(clip.animation_id) == directional) { selected = &clip; break; }
        }
        if(selected) {
            if(sprite_animations[slot] != selected) {
                sprite_animations[slot] = selected; sprite_animation_frames[slot] = sprite_animation_updates[slot] = 0;
                sprites[slot]->set_tiles(*sprite_tiles_items[slot], selected->frames[0]);
            }
            sprites[slot]->set_horizontal_flip(state.direction == 3 && selected->flip_right_to_create_left_frames);
        }
    }
    sprite_script_motion[slot] = true;
    sprite_script_climb_direction[slot] = state.climbing && state.y != old_y ? (state.y > old_y ? 1 : -1) : 0;
    sprites[slot]->set_position(state.x - camera_x - 120 + resource.frame_width / 2 - resource.canvas_origin_x,
        state.y - camera_y - 80 + resource.frame_height / 2 - resource.canvas_origin_y);
    (void) action;
    return true;
}

void GraphicsManager::stop_script_actor_motion(const char* actor_id)
{
    int slot = actor_id && bn::string<64>(actor_id) == "__PLAYER__" ? player_slot : -1;
    for(int i = 0; actor_id && slot < 0 && i < actor_count; ++i) if(actor_ids[i] == actor_id) slot = actor_slots[i];
    if(slot >= 0 && slot < sprite_count) {
        if(slot == player_slot) set_player_animation(false, player_climbing ? "climb" : nullptr);
        else if(sprite_resources[slot] && sprite_tiles_items[slot]) {
            const auto& resource = *sprite_resources[slot];
            for(int i = 0; resource.animations && i < resource.animations_count; ++i) {
                const auto& clip = resource.animations[i];
                if(sprite_main_states[slot] && !actor_motion::same_text(clip.state_id, sprite_main_states[slot])) continue;
                if(clip.animation_type && bn::string<16>(clip.animation_type) == "idle" && animation_frames_fit(clip, sprite_tiles_items[slot]->graphics_count())) {
                    sprite_animations[slot] = &clip; sprite_animation_frames[slot] = sprite_animation_updates[slot] = 0;
                    sprites[slot]->set_tiles(*sprite_tiles_items[slot], clip.frames[0]);
                    break;
                }
            }
        }
        sprite_script_climb_direction[slot] = 0;
        sprite_script_motion[slot] = slot != player_slot && sprite_animations[slot] && sprite_animations[slot]->animation_type && bn::string<16>(sprite_animations[slot]->animation_type) == "climb";
    }
}

bool GraphicsManager::move_actor(const char* actor_id, int x, int y)
{
    if(!actor_id) return false;
    if(bn::string<64>(actor_id) == "__PLAYER__")
    {
        if(player_slot < 0 || player_slot >= sprite_count || !sprites[player_slot].has_value()) return false;
        const Sprites* resource = sprite_resources[player_slot];
        if(!currentScene || !resource || !actor_motion::clamp_destination(*currentScene, *resource, x, y)) return false;
        player_world_x = x;
        player_world_y = y;
        player_vertical_velocity_q8 = 0;
        player_vertical_remainder_q8 = 0;
        player_grounded = false;
        const int offset_x = resource ? (resource->frame_width / 2) - resource->canvas_origin_x : 0;
        const int offset_y = resource ? (resource->frame_height / 2) - resource->canvas_origin_y : 0;
        sprites[player_slot]->set_position(x - camera_x - 120 + offset_x, y - camera_y - 80 + offset_y);
        return true;
    }
    for(int i = 0; i < actor_count; ++i)
    {
        if(bn::string<64>(actor_ids[i]) == actor_id && actor_slots[i] >= 0 && actor_slots[i] < sprite_count && sprites[actor_slots[i]].has_value())
        {
            const Sprites* resource = sprite_resources[actor_slots[i]];
            if(!currentScene || !resource || !actor_motion::clamp_destination(*currentScene, *resource, x, y)) return false;
            // Keep actor positions in the same canvas-anchor coordinate space
            // used by the scene editor and the initial spawn path.
            const int target_x = x;
            const int target_y = y;
            const int old_x = actor_world_x[i];
            const int old_y = actor_world_y[i];
            const int dx = target_x - old_x;
            const int dy = target_y - old_y;
            const int collision_width = resource ? bn::max(1, resource->collision_width) : 16;
            const int collision_height = resource ? bn::max(1, resource->collision_height) : 8;
            const int collision_offset_x = resource ? resource->collision_x : -8;
            const int collision_offset_y = resource ? resource->collision_y : -4;
            const auto overlaps = [&](const SceneCollision& collision) {
                return target_x + collision_offset_x < collision.x + collision.width &&
                       target_x + collision_offset_x + collision_width > collision.x &&
                       target_y + collision_offset_y < collision.y + collision.height &&
                       target_y + collision_offset_y + collision_height > collision.y;
            };
            bool blocked = false;
            for(int collision_index = 0; currentScene && currentScene->collisions && collision_index < currentScene->collisions_count; ++collision_index) {
                const SceneCollision& collision = currentScene->collisions[collision_index];
                if(!overlaps(collision)) continue;
                const bn::string<16> side = collision.side ? collision.side : "solid";
                const bool hit = side == "solid" ||
                    (side == "top" && dy > 0 && old_y + collision_offset_y + collision_height <= collision.y) ||
                    (side == "down" && dy < 0 && old_y + collision_offset_y >= collision.y + collision.height) ||
                    (side == "left" && dx > 0 && old_x + collision_offset_x + collision_width <= collision.x) ||
                    (side == "right" && dx < 0 && old_x + collision_offset_x >= collision.x + collision.width);
                if(hit) { blocked = true; break; }
            }
            if(blocked) return false;
            const int offset_x = resource ? resource->frame_width / 2 - resource->canvas_origin_x : 0;
            const int offset_y = resource ? resource->frame_height / 2 - resource->canvas_origin_y : 0;
            sprites[actor_slots[i]]->set_position(target_x - camera_x - 120 + offset_x, target_y - camera_y - 80 + offset_y);
            actor_world_x[i] = target_x;
            actor_world_y[i] = target_y;
            ActorManager::instance().set_position_by_id(actor_ids[i], target_x, target_y);
            return true;
        }
    }
    return false;
}

bool GraphicsManager::remove_actor(const char* actor_id)
{
    if(!actor_id) return false;
    for(int i = 0; i < actor_count; ++i)
    {
        if(bn::string<64>(actor_ids[i]) == actor_id)
        {
            if(actor_slots[i] >= 0 && actor_slots[i] < sprite_count) sprites[actor_slots[i]].reset();
            for(int j = i; j + 1 < actor_count; ++j) {
                actor_ids[j] = actor_ids[j + 1];
                actor_slots[j] = actor_slots[j + 1];
                actor_world_x[j] = actor_world_x[j + 1];
                actor_world_y[j] = actor_world_y[j + 1];
            }
            --actor_count;
            return true;
        }
    }
    return false;
}

bool GraphicsManager::set_actor_visible(const char* actor_id, bool visible)
{
    if(!actor_id) return false;
    if(bn::string<64>(actor_id) == "__PLAYER__")
    {
        if(player_slot < 0 || player_slot >= sprite_count || !sprites[player_slot].has_value()) return false;
        sprites[player_slot]->set_visible(visible);
        return true;
    }
    for(int i = 0; i < actor_count; ++i)
        if(bn::string<64>(actor_ids[i]) == actor_id && actor_slots[i] >= 0 && actor_slots[i] < sprite_count && sprites[actor_slots[i]].has_value())
        { sprites[actor_slots[i]]->set_visible(visible); return true; }
    return false;
}

bool GraphicsManager::set_all_actors_visible(bool visible)
{
    if(player_slot >= 0 && player_slot < sprite_count && sprites[player_slot].has_value())
        sprites[player_slot]->set_visible(visible);
    for(int index = 0; index < actor_count; ++index)
        if(actor_slots[index] >= 0 && actor_slots[index] < sprite_count && sprites[actor_slots[index]].has_value())
            sprites[actor_slots[index]]->set_visible(visible);
    return true;
}

bool GraphicsManager::set_actor_state(const char* actor_id, const char* state_id)
{
    if(!actor_id || !state_id || !*state_id) return false;
    int slot = actor_motion::same_text(actor_id, "__PLAYER__") ? player_slot : -1;
    for(int i = 0; slot < 0 && i < actor_count; ++i) if(actor_ids[i] == actor_id) slot = actor_slots[i];
    if(slot < 0 || slot >= sprite_count || !sprites[slot] || !sprite_resources[slot] || !sprite_tiles_items[slot]) return false;
    const auto& resource = *sprite_resources[slot];
    const auto* current = sprite_animations[slot];
    const bool facing_left = slot == player_slot ? player_direction == "left" : sprites[slot]->horizontal_flip() ||
        (current && (actor_motion::same_text(current->animation_id, "idle-left") || actor_motion::same_text(current->animation_id, "moving-left")));
    bn::string<32> desired_id(current && current->animation_id ? current->animation_id : "");
    if(current && (actor_motion::same_text(current->animation_type, "idle") || actor_motion::same_text(current->animation_type, "movement"))) {
        desired_id = actor_motion::same_text(current->animation_type, "idle") ? "idle-" : "moving-";
        const char* direction = slot == player_slot ? player_direction.data() : facing_left ? "left" : "right";
        desired_id += direction;
    }
    const SpriteAnimationDefinition* selected = nullptr;
    int best = -1;
    for(int i = 0; resource.animations && i < resource.animations_count; ++i) {
        const auto& clip = resource.animations[i];
        if(!actor_motion::same_text(clip.state_id, state_id) || !animation_frames_fit(clip, sprite_tiles_items[slot]->graphics_count())) continue;
        const int score = clip.animation_id && bn::string<32>(clip.animation_id) == desired_id ? 4
            : current && actor_motion::same_text(clip.animation_id, current->animation_id) ? 3
            : current && actor_motion::same_text(clip.animation_type, current->animation_type) ? 2
            : actor_motion::same_text(clip.animation_type, "idle") ? 1 : 0;
        if(score > best) { selected = &clip; best = score; }
    }
    if(!selected) { BN_LOG("Set Actor State: state or valid frames not found"); return false; }
    sprite_main_states[slot] = selected->state_id;
    sprite_animations[slot] = selected;
    sprite_animation_frames[slot] = sprite_animation_updates[slot] = 0;
    sprites[slot]->set_tiles(*sprite_tiles_items[slot], selected->frames[0]);
    const bn::string<32> selected_id(selected->animation_id ? selected->animation_id : "");
    sprites[slot]->set_horizontal_flip(facing_left && selected->flip_right_to_create_left_frames &&
        (selected_id == "idle-right" || selected_id == "moving-right" || selected_id == "idle" || selected_id == "moving" || selected_id == "running"));
    return true;
}

bool GraphicsManager::set_actor_animation_speed(const char* actor_id, int speed)
{
    if(!actor_id || speed < 0 || speed > 60) return false;
    if(bn::string<64>(actor_id) == "__PLAYER__")
    {
        if(player_slot < 0 || player_slot >= sprite_count) return false;
        sprite_animation_speeds[player_slot] = speed;
        return true;
    }
    for(int i = 0; i < actor_count; ++i)
        if(bn::string<64>(actor_ids[i]) == actor_id && actor_slots[i] >= 0 && actor_slots[i] < sprite_count)
        { sprite_animation_speeds[actor_slots[i]] = speed; return true; }
    return false;
}

bool GraphicsManager::set_actor_priority(const char* actor_id, int priority)
{
    if(!actor_id || priority < 0 || priority > 3) return false;
    if(bn::string<64>(actor_id) == "__PLAYER__")
    {
        if(player_slot < 0 || player_slot >= sprite_count || !sprites[player_slot].has_value()) return false;
        sprites[player_slot]->set_bg_priority(priority);
        return true;
    }
    for(int i = 0; i < actor_count; ++i)
        if(bn::string<64>(actor_ids[i]) == actor_id && actor_slots[i] >= 0 && actor_slots[i] < sprite_count && sprites[actor_slots[i]].has_value())
        { sprites[actor_slots[i]]->set_bg_priority(priority); return true; }
    return false;
}

bool GraphicsManager::set_actor_effect(const char* actor_id, int rotation, int scale_percent, bool visible, const char* fade_color, int fade_intensity, int duration_frames)
{
    if(!actor_id || duration_frames < 1 || duration_frames > 600) return false;
    for(int index = 0; index < actor_count; ++index)
    {
        if(actor_ids[index] != actor_id) continue;
        const int slot = actor_slots[index];
        if(slot < 0 || slot >= MAX_SPRITES || !sprites[slot].has_value()) return false;
        const int target_rotation = bn::clamp(rotation, -180, 180);
        const int target_scale = bn::clamp(scale_percent, 10, 400);
        const int target_fade = bn::clamp(fade_intensity, 0, 100);
        const bool fade_enabled = fade_color && (fade_color[0] == 'b' || fade_color[0] == 'w');
        bn::sprite_palette_ptr palette(sprites[slot]->palette());
        const int current_fade = int(palette.fade_intensity() * 100);
        if(duration_frames == 1)
        {
            sprites[slot]->set_rotation_angle(bn::fixed(target_rotation));
            sprites[slot]->set_scale(bn::fixed(target_scale) / 100);
            sprites[slot]->set_visible(visible);
            if(fade_enabled)
            {
                const bn::color fade_tint = fade_color[0] == 'w' ? bn::color(31, 31, 31) : bn::color(0, 0, 0);
                palette.set_fade(fade_tint, bn::fixed(target_fade) / 100);
            }
            else palette.set_fade_intensity(bn::fixed(0));
            sprite_effect_states[index].active = false;
        }
        else
        {
            SpriteEffectState& state = sprite_effect_states[index];
            state.active = true;
            state.frame = 0;
            state.duration = duration_frames;
            state.start_rotation = int(sprites[slot]->rotation_angle());
            state.target_rotation = target_rotation;
            state.start_scale = int(sprites[slot]->horizontal_scale() * 100);
            state.target_scale = target_scale;
            state.start_fade = current_fade;
            state.target_fade = fade_enabled ? target_fade : 0;
            state.fade_white = fade_enabled && fade_color[0] == 'w';
            sprites[slot]->set_visible(visible);
        }
        return true;
    }
    return false;
}

void GraphicsManager::update_sprite_effects()
{
    for(int index = 0; index < actor_count; ++index)
    {
        const int slot = actor_slots[index];
        SpriteEffectState& state = sprite_effect_states[index];
        if(!state.active || slot < 0 || slot >= sprite_count || !sprites[slot].has_value()) continue;
        const int duration = bn::max(state.duration, 1);
        const int frame = bn::min(++state.frame, duration);
        const int rotation = state.start_rotation +
            (state.target_rotation - state.start_rotation) * frame / duration;
        const int scale = state.start_scale +
            (state.target_scale - state.start_scale) * frame / duration;
        const int fade = state.start_fade +
            (state.target_fade - state.start_fade) * frame / duration;
        sprites[slot]->set_rotation_angle(bn::fixed(rotation));
        sprites[slot]->set_scale(bn::fixed(scale) / 100);
        bn::sprite_palette_ptr palette(sprites[slot]->palette());
        if(state.target_fade > 0 || state.start_fade > 0)
            palette.set_fade(state.fade_white ? bn::color(31, 31, 31) : bn::color(0, 0, 0), bn::fixed(fade) / 100);
        else palette.set_fade_intensity(bn::fixed(0));
        if(frame >= duration) state.active = false;
    }
}

int GraphicsManager::read_numeric_actor_property(const char* actor_id, int property) const
{
    if(!actor_id) return 0;
    int slot = -1, x = 0, y = 0;
    const char* direction = "right";
    if(bn::string<64>(actor_id) == "__PLAYER__") {
        slot = player_slot; x = player_world_x; y = player_world_y; direction = player_direction.data();
    } else {
        for(int index = 0; index < actor_count; ++index) if(actor_ids[index] == actor_id) {
            slot = actor_slots[index]; x = actor_world_x[index]; y = actor_world_y[index];
            if(currentScene) for(int actor = 0; actor < currentScene->actors_count; ++actor)
                if(bn::string<64>(currentScene->actors[actor].id) == actor_id) direction = currentScene->actors[actor].direction;
            break;
        }
    }
    if(slot < 0 || slot >= sprite_count || !sprites[slot]) { BN_LOG("Numeric actor property: actor not found"); return 0; }
    if(property == 0) return x;
    if(property == 1) return y;
    if(property == 2) {
        const bn::string<16> facing(direction ? direction : "right");
        return facing == "up" ? 0 : facing == "right" ? 1 : facing == "down" ? 2 : 3;
    }
    if(property == 3) return sprite_animation_frames[slot];
    if(property == 4) return sprite_animation_speeds[slot];
    return 0;
}

void GraphicsManager::set_camera_position(int x, int y)
{
    if(!currentScene)
    {
        return;
    }
    camera_x = x;
    camera_y = y;
    if(player_slot >= 0 && player_slot < sprite_count && sprites[player_slot].has_value())
    {
        const Sprites* player = sprite_resources[player_slot];
        const int offset_x = player ? (player->frame_width / 2) - player->canvas_origin_x : 0;
        const int offset_y = player ? (player->frame_height / 2) - player->canvas_origin_y : 0;
        sprites[player_slot]->set_position(player_world_x - camera_x - 120 + offset_x, player_world_y - camera_y - 80 + offset_y);
    }
    for(int i = 0; i < current_bgs.size(); ++i)
    {
        if(current_bgs[i].has_value())
        {
            const Backgrounds* background = i < current_bgs_id.size()
                ? get_background_by_id(current_bgs_id[i]) : nullptr;
            const int width = background && background->image_width > 0 ? background->image_width : 240;
            const int height = background && background->image_height > 0 ? background->image_height : 160;
            const int image_x = i < current_bgs_x.size() ? current_bgs_x[i] : 0;
            const int image_y = i < current_bgs_y.size() ? current_bgs_y[i] : 0;
            const int parallax_x = i < current_bgs_parallax_x.size() ? current_bgs_parallax_x[i] : 100;
            const int parallax_y = i < current_bgs_parallax_y.size() ? current_bgs_parallax_y[i] : 100;
            current_bgs[i]->set_position(image_x + width / 2 - 120 - (camera_x * parallax_x) / 100,
                image_y + height / 2 - 80 - (camera_y * parallax_y) / 100);
        }
    }
}

bool GraphicsManager::player_on_ladder(int x, int y) const
{
    if(!currentScene || !currentScene->scene_type || !currentScene->collisions ||
       player_slot < 0 || player_slot >= sprite_count) return false;
    const bn::string<16> type(currentScene->scene_type);
    if(type != "Platformer" && type != "Platform") return false;
    const Sprites* player = sprite_resources[player_slot];
    if(!player) return false;
    for(int index = 0; index < currentScene->collisions_count; ++index)
    {
        const SceneCollision& area = currentScene->collisions[index];
        if(area.side && bn::string<16>(area.side) == "ladder" &&
           x + player->collision_x < area.x + area.width && x + player->collision_x + bn::max(1, player->collision_width) > area.x &&
           y + player->collision_y < area.y + area.height && y + player->collision_y + bn::max(1, player->collision_height) > area.y) return true;
    }
    return false;
}

void GraphicsManager::move_player_from_input()
{
    if(player_slot < 0 || player_slot >= sprite_count || !sprites[player_slot].has_value() || !currentScene)
    {
        return;
    }
    const Settings* settings = get_settings();
    const int speed = settings ? bn::max(1, settings->move_speed) : 1;
    int dx = 0;
    int dy = 0;
    const bn::string<64> scene_type = currentScene->scene_type ? currentScene->scene_type : "";
    const bool platformer = scene_type == "Platformer" || scene_type == "Platform";
    const bool logo = scene_type == "Logo";
    constexpr int FIXED_POINT_SCALE = 256;
    constexpr int PLATFORM_GRAVITY_Q8 = FIXED_POINT_SCALE / 4;
    constexpr int PLATFORM_JUMP_SPEED_Q8 = -5 * FIXED_POINT_SCALE;
    constexpr int PLATFORM_MAX_FALL_SPEED_Q8 = 6 * FIXED_POINT_SCALE;

    if(logo) return;
    if(InputManager::instance().held("move_left")) dx = -speed;
    else if(InputManager::instance().held("move_right")) dx = speed;
    if(InputManager::instance().held("move_up")) dy = -speed;
    else if(InputManager::instance().held("move_down")) dy = speed;
    if(!dx && !dy && !platformer) {
        set_player_animation(false);
        return;
    }

    const Sprites* player = sprite_resources[player_slot];
    const int half_width = player ? player->frame_width / 2 : 0;
    const int half_height = player ? player->frame_height / 2 : 0;
    const int old_x = player_world_x;
    const int old_y = player_world_y;
    const int min_x = player ? player->canvas_origin_x : half_width;
    const int min_y = player ? player->canvas_origin_y : half_height;
    const int max_x = bn::max(min_x, currentScene->scene_width - (player ? player->frame_width : half_width * 2) + min_x);
    const int max_y = bn::max(min_y, currentScene->scene_height - (player ? player->frame_height : half_height * 2) + min_y);
    const int collision_width = player ? bn::max(1, player->collision_width) : bn::max(1, half_width * 2);
    const int collision_height = player ? bn::max(1, player->collision_height) : bn::max(1, half_height * 2);
    const int collision_offset_x = player ? player->collision_x : -half_width;
    const int collision_offset_y = player ? player->collision_y : -half_height;
    const auto overlaps = [&](int x, int y, const SceneCollision& collision) {
        return x + collision_offset_x < collision.x + collision.width &&
               x + collision_offset_x + collision_width > collision.x &&
               y + collision_offset_y < collision.y + collision.height &&
               y + collision_offset_y + collision_height > collision.y;
    };
    const auto blocked = [&](int test_x, int test_y, int test_dx, int test_dy, const SceneCollision& collision) {
        if(!overlaps(test_x, test_y, collision)) return false;
        const bn::string<16> side = collision.side ? collision.side : "solid";
        if(side == "solid") return true;
        // Ladder tops support standing; activated climbing passes through them.
        if(side == "ladder") return platformer && !player_climbing && test_dy > 0 &&
            old_y + collision_offset_y + collision_height <= collision.y;
        if(side == "top") return test_dy > 0 && old_y + collision_offset_y + collision_height <= collision.y;
        if(side == "down") return test_dy < 0 && old_y + collision_offset_y >= collision.y + collision.height;
        if(side == "left") return test_dx > 0 && old_x + collision_offset_x + collision_width <= collision.x;
        if(side == "right") return test_dx < 0 && old_x + collision_offset_x >= collision.x + collision.width;
        return false;
    };
    const auto blockedAt = [&](int test_x, int test_y, int test_dx, int test_dy) {
        for(int index = 0; currentScene->collisions && index < currentScene->collisions_count; ++index)
            if(blocked(test_x, test_y, test_dx, test_dy, currentScene->collisions[index])) return true;
        return false;
    };

    if(platformer)
    {
        // Probe one pixel below the player's configured collision box so a
        // player spawned on a platform can jump on the first input frame.
        player_grounded = old_y >= max_y || blockedAt(old_x, old_y + 1, 0, 1);
        const bool jump_pressed = InputManager::instance().pressed("jump");
        const int climb_input = dy;
        // Down can reattach from a collision box resting exactly on the top.
        const bool on_ladder = player_on_ladder(old_x, old_y) ||
            (climb_input > 0 && player_on_ladder(old_x, old_y + 1));
        if(!on_ladder) player_climbing = false;
        const bool jumping = jump_pressed && (player_grounded || player_climbing);
        if(on_ladder && climb_input && !jumping) player_climbing = true;
        dy = player_climbing ? climb_input : 0;
        if(jumping)
        {
            player_vertical_velocity_q8 = PLATFORM_JUMP_SPEED_Q8;
            player_vertical_remainder_q8 = 0;
            dy = 0;
            player_grounded = false;
            player_climbing = false;
        }

        if(player_climbing && !jumping)
        {
            // Only an activated ladder suspends gravity. Released controls hold
            // the player still; merely touching a ladder never starts climbing.
            player_vertical_velocity_q8 = 0;
            player_vertical_remainder_q8 = 0;
            player_grounded = false;
        }
        else if(player_grounded && !jumping)
        {
            player_vertical_velocity_q8 = 0;
            player_vertical_remainder_q8 = 0;
            dy = 0;
        }
        else
        {
            player_vertical_velocity_q8 = bn::min(
                PLATFORM_MAX_FALL_SPEED_Q8,
                player_vertical_velocity_q8 + PLATFORM_GRAVITY_Q8);
            player_vertical_remainder_q8 += player_vertical_velocity_q8;
            dy = player_vertical_remainder_q8 / FIXED_POINT_SCALE;
            player_vertical_remainder_q8 -= dy * FIXED_POINT_SCALE;
        }
    }

    if(dx < 0) player_direction = "left";
    else if(dx > 0) player_direction = "right";
    else if(!platformer && dy < 0) player_direction = "up";
    else if(!platformer && dy > 0) player_direction = "down";

    const int next_x = bn::clamp(old_x + dx, min_x, max_x);
    const int raw_next_y = old_y + dy;
    const int next_y = bn::clamp(raw_next_y, min_y, max_y);

    // Resolve each axis independently. Testing the complete diagonal at once
    // and then accepting the other axis can let the player pass through a
    // corner when both directions are held.
    int resolved_x = old_x;
    int resolved_y = old_y;
    if(dx != 0 && !blockedAt(next_x, old_y, dx, 0)) resolved_x = next_x;
    if(dy != 0)
    {
        if(!blockedAt(resolved_x, next_y, 0, dy))
        {
            resolved_y = next_y;
            if(platformer && dy > 0 && raw_next_y >= max_y) player_grounded = true;
        }
        else if(platformer)
        {
            // A downward collision lands on the floor/platform; an upward
            // collision ends the jump against a ceiling.
            player_grounded = dy > 0;
            player_vertical_velocity_q8 = 0;
            player_vertical_remainder_q8 = 0;
        }
    }
    if(platformer && dy > 0 && next_y == max_y && resolved_y == max_y)
    {
        player_grounded = true;
        player_vertical_velocity_q8 = 0;
        player_vertical_remainder_q8 = 0;
    }
    player_world_x = resolved_x;
    player_world_y = resolved_y;
    if(!platformer || !player_on_ladder(resolved_x, resolved_y)) player_climbing = false;
    // Keep a stationary jump animated throughout ascent, apex and descent.
    // A ceiling collision stops velocity without grounding the player.
    if(platformer && !player_climbing)
        player_grounded = resolved_y >= max_y || blockedAt(resolved_x, resolved_y + 1, 0, 1);
    const bool airborne = platformer && !player_grounded && !player_climbing;
    set_player_animation(resolved_x != old_x || resolved_y != old_y,
        player_climbing ? "climb" : airborne && !dx ? "jump" : nullptr);
    const int offset_x = player ? (player->frame_width / 2) - player->canvas_origin_x : 0;
    const int offset_y = player ? (player->frame_height / 2) - player->canvas_origin_y : 0;
    sprites[player_slot]->set_position(player_world_x - camera_x - 120 + offset_x, player_world_y - camera_y - 80 + offset_y);
}

void GraphicsManager::init_bg_slots()
{
    current_bgs.clear();
    current_bgs_id.clear();
    current_bgs_x.clear();
    current_bgs_y.clear();
    current_bgs_parallax_x.clear();
    current_bgs_parallax_y.clear();
    for(int i = 0; i < 4; i++)
    {
        current_bgs.push_back(bn::optional<bn::regular_bg_ptr>());
        current_bgs_id.push_back(bn::string<64>());
        current_bgs_x.push_back(0);
        current_bgs_y.push_back(0);
        current_bgs_parallax_x.push_back(100);
        current_bgs_parallax_y.push_back(100);
    }
}


void GraphicsManager::render_scene_regular_bg(const Scenes& scene) 
{
    // Limpa backgrounds ativos
    current_bgs.clear();
    current_bitmap_bgs.reset();
    current_bgs_id.clear();
    current_bgs_x.clear();
    current_bgs_y.clear();
    current_bgs_parallax_x.clear();
    current_bgs_parallax_y.clear();

    bn::core::update();  

    GraphicsManager::init_bg_slots();

    BN_LOG("..: render_scene_regular_bg :..");
    for(int i = 0; i < scene.backgrounds_layers_size; i++)
    {
        const SceneLayer& layer = scene.backgrounds_layers[i];
        if(layer.layerId < 0 || layer.layerId >= 4)
        {
            BN_LOG("Invalid regular BG layer id: ", layer.layerId);
            continue;
        }

        if(layer.backgroundId && layer.backgroundId[0] != '\0')
        {
            // 4.1 Busca o recurso de background pelo ID
            const Backgrounds* bg_resource = get_background_by_id(bn::string<64>(layer.backgroundId));
            if(!bg_resource)
            {
                BN_LOG("Background não encontrado com ID: ", layer.backgroundId);
                continue;
            }
            BN_LOG("Background encontrado: ", bg_resource->name);

            // 4.2 Cria o background ativo
            auto bg_item = get_bg_item_from_name(bg_resource->name);
            if(bg_item.has_value())
            {
                auto bg_ptr = bn::regular_bg_ptr::create(bg_item.value());
                if(layer.paletteId && layer.paletteId[0] != '\0')
                {
                    const BackgroundPalette* palette = get_background_palette_by_id(bn::string<64>(layer.paletteId));
                    if(palette && palette->colors && palette->colors_count > 0)
                    {
                        bn::bg_palette_item palette_item(
                            bn::span<const bn::color>(palette->colors, palette->colors_count),
                            bn::bpp_mode::BPP_4);
                        bg_ptr.set_palette(palette_item);
                    }
                    else
                    {
                        BN_LOG("Palette not found: ", layer.paletteId);
                    }
                }
                if(layer.map_cell_overrides && layer.map_cell_overrides_count > 0)
                {
                    auto map_copy = bn::regular_bg_map_ptr::allocate_optional(
                        bg_ptr.map().dimensions(), bg_ptr.tiles(), bg_ptr.palette());
                    if(map_copy)
                    {
                        auto source_cells = bg_ptr.map().cells_ref();
                        auto destination_cells = map_copy->vram();
                        if(source_cells && destination_cells)
                        {
                            const int copy_count = source_cells->size() < destination_cells->size() ?
                                source_cells->size() : destination_cells->size();
                            for(int cell_index = 0; cell_index < copy_count; ++cell_index)
                            {
                                (*destination_cells)[cell_index] = (*source_cells)[cell_index];
                            }
                            for(int override_index = 0; override_index < layer.map_cell_overrides_count; ++override_index)
                            {
                                const RegularBgMapCellOverride& cell_override = layer.map_cell_overrides[override_index];
                                if(cell_override.cell_index >= 0 && cell_override.cell_index < destination_cells->size())
                                {
                                    (*destination_cells)[cell_override.cell_index] = cell_override.cell;
                                }
                            }
                            bg_ptr.set_map(*map_copy);
                        }
                    }
                }
                // Editor layers are ordered back-to-front (0..3), while
                // Butano uses priority 0 for the frontmost background.
                bg_ptr.set_priority(3 - bn::clamp(layer.layerId, 0, 3));
                bg_ptr.set_z_order(bn::clamp(layer.z_order, -32767, 32767));
                bg_ptr.set_blending_enabled(true);

                bg_ptr.set_position(layer.x + bg_resource->image_width / 2 - 120 - camera_x,
                    layer.y + bg_resource->image_height / 2 - 80 - camera_y);
                current_bgs[layer.layerId] = bg_ptr;
                current_bgs_id[layer.layerId] = layer.backgroundId;
                current_bgs_x[layer.layerId] = layer.x;
                current_bgs_y[layer.layerId] = layer.y;

                BN_LOG("Background carregado com sucesso: ", bg_resource->name);
            }
            else
            {
                BN_LOG("Background item não encontrado: ", bg_resource->name);
            }
        } 
        else
        {
            // Se não há backgroundId, garante que a posição fique vazia
            if(layer.layerId >= current_bgs_id.size())
            {
                current_bgs_id.resize(layer.layerId + 1);
            }
            current_bgs_id[layer.layerId] = bn::string<64>();
        }
    }
}

void GraphicsManager::render_scene_bitmap_bg(const Scenes& scene)
{
    // Limpa backgrounds ativos
    current_bgs.clear();
    current_bitmap_bgs.reset();
    current_bgs_id.clear();
    for(int slot = 0; slot < 4; ++slot) current_bgs_id.push_back(bn::string<64>());

    bn::core::update();  

    BN_LOG("..: render_scene_bitmap_bg :..");

    for(int i = 0; i < scene.backgrounds_layers_size; i++)
    {
        const SceneLayer& layer = scene.backgrounds_layers[i];

        // Buscar apenas pela camada 2
        if(layer.layerId == 2 && layer.backgroundId && layer.backgroundId[0] != '\0')
        {
            const Backgrounds* bg_resource = get_background_by_id(bn::string<64>(layer.backgroundId));
            if(!bg_resource)
            {
                BN_LOG("Background não encontrado com ID: ", layer.backgroundId);
                continue;
            }

            BN_LOG("Background encontrado: ", bg_resource->name);

            // Cria o bitmap background ativo
            auto bmp_bg_item = get_bitmap_bg_item_from_name(bg_resource->name);
            if(bmp_bg_item.has_value())
            {
                // esse 
                // bn::sp_direct_bitmap_bg_builder builder(bg_item.value());
                // bn::sp_direct_bitmap_bg_ptr bg_bmp_ptr = bn::sp_direct_bitmap_bg_ptr::create(builder);
                // bg_bmp_ptr.set_priority(2);

                // ou esse
                // Cria um bitmap BG vazio (BG2)
                bn::sp_direct_bitmap_bg_ptr bmp_bg = bn::sp_direct_bitmap_bg_ptr::create();
                // bmp_bg.set_priority(2);
                bmp_bg.set_blending_enabled(true);

                // Usa o painter para desenhar a imagem dentro do BG
                bn::sp_direct_bitmap_bg_painter painter(bmp_bg);
                
                // Scene layer coordinates are the image top-left in the editor
                // and in the runtime. Camera pan moves that origin on screen.
                int x = layer.x - camera_x;
                int y = layer.y - camera_y;

                painter.fill(bn::color(0, 0, 0));  // limpa tudo com preto
                painter.blit(x, y, bmp_bg_item.value());

                // Guarda no current_bitmap_bg
                current_bitmap_bgs = bmp_bg;
                current_bgs_id[layer.layerId] = layer.backgroundId;

                BN_LOG("Bitmap BG carregado com sucesso: ", bg_resource->name);
                continue;
            }
            else
            {
                BN_LOG("Bitmap BG item não encontrado: ", bg_resource->name);
            }
        }
        current_bgs_id[layer.layerId] = bn::string<64>();
    }
}

// Load regular backgrounds by ID
bn::vector<bn::regular_bg_ptr, 4> GraphicsManager::load_next_regular_background_by_id(
    const bn::vector<LayerArgs, 4>& changeLayer)
{
    bn::vector<bn::regular_bg_ptr, 4> result;
    result.clear();
    current_bitmap_bgs.reset();
    bn::core::update();
    // current_bgs.clear();

    BN_LOG("..: loadNextRegularBackgroundById :..");

    for(int i = 0; i < changeLayer.size(); i++)
    {
        const LayerArgs& layer = changeLayer[i];

        if(!layer.background_id.empty())
        {
            const Backgrounds* bg_resource = get_background_by_id(layer.background_id);
            if(!bg_resource)
            {
                BN_LOG("Background não encontrado com ID: ", layer.background_id);
                continue;
            }

            auto bg_item = get_bg_item_from_name(bg_resource->name);
            if(!bg_item.has_value())
            {
                BN_LOG("Background item não encontrado: ", bg_resource->name);
                continue;
            }

            BN_LOG("Background item POS: ", i);
            BN_LOG("Background item current_bgs: ", current_bgs.size());

            // Se já existe um regular BG nessa posição
            if(i < current_bgs.size() && current_bgs[i].has_value() && i < current_bgs_id.size() && !current_bgs_id[i].empty())
            {
                if(current_bgs_id[i] == layer.background_id)
                {
                    BN_LOG("..: Regular BG já existe :..");
                    // Mesmo ID → só atualiza propriedades
                    current_bgs[i]->set_visible(layer.visible);
                    current_bgs[i]->set_priority(3 - bn::clamp(layer.layer_id, 0, 3));
                    current_bgs[i]->set_z_order(bn::clamp(layer.layer_id, -32767, 32767));
                    result.push_back(current_bgs[i].value());

                    BN_LOG("Regular BG atualizado: ", bg_resource->name);
                }
                else
                {
                    // ID diferente → substitui imagem
                    BN_LOG("..: Regular BG substituindo imagem :..");
                    current_bgs[i].reset();

                    auto bg_ptr = bn::regular_bg_ptr::create(bg_item.value());
                    bg_ptr.set_priority(3 - bn::clamp(layer.layer_id, 0, 3));
                    bg_ptr.set_z_order(bn::clamp(layer.layer_id, -32767, 32767));
                    bg_ptr.set_blending_enabled(true);
                    bg_ptr.set_visible(layer.visible);

                    current_bgs[i] = bg_ptr;
                    current_bgs_id[i] = layer.background_id;
                    result.push_back(bg_ptr);

                    BN_LOG("Regular BG substituído: ", bg_resource->name);
                }
            }
            else
            {
                // Não existe → cria novo
                BN_LOG("..: Regular BG criando novo :..");
                current_bgs[i].reset();

                auto bg_ptr = bn::regular_bg_ptr::create(bg_item.value());
                bg_ptr.set_priority(3 - bn::clamp(layer.layer_id, 0, 3));
                bg_ptr.set_z_order(bn::clamp(layer.layer_id, -32767, 32767));
                bg_ptr.set_blending_enabled(true);
                bg_ptr.set_visible(layer.visible);

                if(i < current_bgs.size())
                {
                    current_bgs[i] = bg_ptr;
                }
                else
                {
                    current_bgs.push_back(bg_ptr);
                }
                if(i >= current_bgs_id.size()) current_bgs_id.resize(i + 1);
                current_bgs_id[i] = layer.background_id;
                result.push_back(bg_ptr);

                BN_LOG("Regular BG criado: ", bg_resource->name);
            }
        }
        else
        {
            // Se não há background_id, limpa posição
            if(i < current_bgs.size()) current_bgs[i].reset();
            if(i < current_bgs_id.size())
            {
                current_bgs_id[i] = bn::string<64>();
            }
            BN_LOG("Regular BG ID vazio na posição: ", i);
        }
    }

    return result;
}

// Load bitmap backgrounds by ID
bn::optional<bn::sp_direct_bitmap_bg_ptr> GraphicsManager::load_next_bitmap_background_by_id(
    const bn::vector<LayerArgs, 4>& changeLayer)
{
    BN_LOG("..: loadNextBitmapBackgroundById :..");
    current_bgs.clear();
    bn::core::update();

    for(int i = 0; i < changeLayer.size(); i++)
    {
        const LayerArgs& layer = changeLayer[i];

        if(!layer.background_id.empty() && i == 2)
        {
            const Backgrounds* bg_resource = get_background_by_id(layer.background_id);
            if(!bg_resource)
            {
                BN_LOG("Background não encontrado com ID: ", layer.background_id);
                continue;
            }

            auto bmp_bg_item = get_bitmap_bg_item_from_name(bg_resource->name);
            if(!bmp_bg_item.has_value())
            {
                BN_LOG("Bitmap BG item não encontrado: ", bg_resource->name);
                continue;
            }

            // Se já existe um bitmap carregado
            if(current_bitmap_bgs.has_value())
            {
                BN_LOG("..: Background Bitmap existe :..");

                // Se for o mesmo ID, só atualiza visibilidade
                if(!current_bgs_id[i].empty() && current_bgs_id[i] == layer.background_id)
                {
                    BN_LOG("..: Background Bitmap alterando propriedades :..");

                    current_bitmap_bgs->set_visible(layer.visible);
                    return current_bitmap_bgs;
                }
                else
                {
                    // Se for diferente, reaproveita o mesmo objeto e substitui a imagem
                    BN_LOG("..: Background Bitmap alterando imagem :..");

                    bn::sp_direct_bitmap_bg_painter painter(*current_bitmap_bgs);
                    int x = -camera_x;
                    int y = -camera_y;

                    painter.fill(bn::color(0, 0, 0));
                    painter.blit(x, y, bmp_bg_item.value());

                    current_bitmap_bgs->set_visible(layer.visible);
                    current_bgs_id[i] = layer.background_id;
                    
                    BN_LOG("Bitmap BG substituído: ", bg_resource->name);
                    return current_bitmap_bgs;
                }
            }
            else
            {
                // Se não existe, cria novo
                BN_LOG("..: Background Bitmap criando novo :..");

                current_bitmap_bgs.reset();
                bn::core::update(); 

                bn::sp_direct_bitmap_bg_ptr bmp_bg = bn::sp_direct_bitmap_bg_ptr::create();
                bmp_bg.set_blending_enabled(true);

                bn::sp_direct_bitmap_bg_painter painter(bmp_bg);
                int x = -camera_x;
                int y = -camera_y;

                painter.fill(bn::color(0, 0, 0));
                painter.blit(x, y, bmp_bg_item.value());

                bmp_bg.set_visible(layer.visible);

                current_bitmap_bgs = bmp_bg;
                current_bgs_id[i] = layer.background_id;

                BN_LOG("Bitmap BG criado: ", bg_resource->name);
                return current_bitmap_bgs;
            }
        }

        if(i == 2) current_bitmap_bgs.reset();
        if(i >= current_bgs_id.size()) current_bgs_id.resize(i + 1);
        current_bgs_id[i] = bn::string<64>();
        BN_LOG("Bitmap BG ID: ", i, current_bgs_id[i].data());

    }

    return bn::optional<bn::sp_direct_bitmap_bg_ptr>();
}

void GraphicsManager::change_layer(const bn::vector<LayerArgs, 4>& changeLayer) {
    bn::string<64> scene_type = currentScene->scene_type;
    BN_LOG("[change_layer] Scene type: ", scene_type.data());
    if(!(scene_type == "Logo") && !(scene_type == "Point Click")) {
        BN_LOG("[change_layer] Renderizando cena com REGULAR BG");
        GraphicsManager::load_next_regular_background_by_id(changeLayer);
    } else {
        BN_LOG("[change_layer] Renderizando cena com BITMAP BG");
        GraphicsManager::load_next_bitmap_background_by_id(changeLayer);
    }
}

void GraphicsManager::change_single_layer(int layer_id, const bn::string<64>& background_id, bool visible) {
    // A layer event can only alter the scene that is currently loaded.  Do not
    // attempt to synthesize a scene when the script is not running in one.
    if(!currentScene) return;
    const bool bitmap_scene = currentScene->scene_type &&
        (bn::string_view(currentScene->scene_type) == "Logo" || bn::string_view(currentScene->scene_type) == "Point Click");
    // Old projects may have persisted an arbitrary layer before the editor
    // constrained bitmap scenes. Their only valid native layer is Layer 2.
    const int safe_layer = bitmap_scene ? 2 : bn::clamp(layer_id, 0, 3);
    // A scene may not have a serialized entry for this layer yet. Keep all
    // native layer slots available so a Change Background event can create
    // the requested layer instead of appending it at the wrong index.
    while(current_bgs.size() < 4)
    {
        current_bgs.push_back(bn::optional<bn::regular_bg_ptr>());
    }
    while(current_bgs_id.size() < 4)
    {
        current_bgs_id.push_back(bn::string<64>());
    }
    while(current_bgs_x.size() < 4) current_bgs_x.push_back(0);
    while(current_bgs_y.size() < 4) current_bgs_y.push_back(0);
    while(current_bgs_parallax_x.size() < 4) current_bgs_parallax_x.push_back(100);
    while(current_bgs_parallax_y.size() < 4) current_bgs_parallax_y.push_back(100);

    if(!bitmap_scene)
    {
        // Events run inside Game::update(). Change only the requested native
        // slot and leave the frame commit to Game::run(), avoiding a nested
        // core update and a temporary copy of every active background.
        BN_LOG("[change_single_layer] regular layer=", safe_layer);
        if(background_id.empty())
        {
            current_bgs[safe_layer].reset();
            current_bgs_id[safe_layer] = bn::string<64>();
            return;
        }
        if(current_bgs[safe_layer].has_value() && current_bgs_id[safe_layer] == background_id)
        {
            current_bgs[safe_layer]->set_visible(visible);
            return;
        }
        const Backgrounds* background = get_background_by_id(background_id);
        if(!background)
        {
            BN_LOG("Change Background: resource not found: ", background_id);
            return;
        }
        auto item = get_bg_item_from_name(background->name);
        if(!item.has_value())
        {
            BN_LOG("Change Background: regular BG item not found: ", background->name);
            return;
        }
        if(current_bgs[safe_layer].has_value())
        {
            // Butano releases the old tiles, palette and map before acquiring
            // the replacement, while retaining the background's native slot.
            current_bgs[safe_layer]->set_item(item.value());
        }
        else
        {
            auto created = bn::regular_bg_ptr::create_optional(item.value());
            if(!created.has_value())
            {
                BN_LOG("Change Background: regular BG allocation failed: ", background->name);
                return;
            }
            current_bgs[safe_layer] = created.value();
            current_bgs[safe_layer]->set_z_order(safe_layer);
        }
        auto& bg = current_bgs[safe_layer].value();
        bg.set_priority(3 - safe_layer);
        bg.set_blending_enabled(true);
        bg.set_visible(visible);
        bg.set_position(current_bgs_x[safe_layer] + background->image_width / 2 - 120 -
                (camera_x * current_bgs_parallax_x[safe_layer]) / 100,
            current_bgs_y[safe_layer] + background->image_height / 2 - 80 -
                (camera_y * current_bgs_parallax_y[safe_layer]) / 100);
        current_bgs_id[safe_layer] = background_id;
        return;
    }
    bn::vector<LayerArgs, 4> layers;
    for(int index = 0; index < 4; ++index) {
        LayerArgs layer;
        layer.layer_id = index;
        layer.background_id = index < current_bgs_id.size() ? current_bgs_id[index] : bn::string<64>();
        layer.visible = index < current_bgs.size() && current_bgs[index].has_value() ? current_bgs[index]->visible() : true;
        if(index == safe_layer) {
            layer.background_id = background_id;
            layer.visible = visible;
        }
        layers.push_back(layer);
    }
    change_layer(layers);
}

void GraphicsManager::change_palette_layer(int layer_id, const char* const* palette_ids, bool restore_palette) {
    if(!currentScene || !currentScene->scene_type ||
       bn::string_view(currentScene->scene_type) == "Logo" || bn::string_view(currentScene->scene_type) == "Point Click") return;
    const int safe_layer = bn::clamp(layer_id, 0, 3);
    if(safe_layer >= current_bgs.size() || !current_bgs[safe_layer].has_value()) return;
    if(safe_layer >= current_bgs_id.size() || current_bgs_id[safe_layer].empty()) return;

    const Backgrounds* background = get_background_by_id(current_bgs_id[safe_layer]);
    if(!background) return;
    auto bg_item = get_bg_item_from_name(background->name);
    if(!bg_item.has_value()) return;

    if(restore_palette) {
        current_bgs[safe_layer]->set_palette(bg_item.value().palette_item());
        return;
    }

    bn::array<bn::color, 256> colors;
    // BPP4 palettes are allocated in 16-color banks. Request only the
    // highest bank actually used by this event; asking Butano for all 256
    // colors makes a one-bank palette fail whenever another layer already
    // owns a few palette banks.
    int colors_count = 16;
    for(int index = 0; index < 256; ++index) colors[index] = bn::color(0, 0, 0);
    if(palette_ids) {
        for(int slot = 0; slot < 16; ++slot) {
            if(!palette_ids[slot] || palette_ids[slot][0] == '\0') continue;
            const BackgroundPalette* palette = get_background_palette_by_id(bn::string<64>(palette_ids[slot]));
            if(!palette || !palette->colors) continue;
            colors_count = (slot + 1) * 16;
            const int color_count = bn::min(palette->colors_count, 16);
            for(int color = 0; color < color_count; ++color) {
                colors[slot * 16 + color] = palette->colors[color];
            }
        }
    }
    const bn::bg_palette_item palette_item(bn::span<const bn::color>(colors.data(), colors_count), bn::bpp_mode::BPP_4);
    current_bgs[safe_layer]->set_palette(palette_item);
}

void GraphicsManager::set_layer_visible(int layer_id, bool visible) {
    if(!currentScene) return;
    const bn::string<64> scene_type = currentScene ? currentScene->scene_type : bn::string<64>();
    if(scene_type == "Logo" || scene_type == "Point Click") {
        if(current_bitmap_bgs.has_value()) current_bitmap_bgs->set_visible(visible);
        return;
    }
    const int safe_layer = bn::clamp(layer_id, 0, 3);
    if(safe_layer < current_bgs.size() && current_bgs[safe_layer].has_value()) current_bgs[safe_layer]->set_visible(visible);
}

void GraphicsManager::scroll_background(int layer_id, int x, int y) {
    if(!currentScene) return;
    const bn::string<64> scene_type = currentScene->scene_type;
    if(scene_type == "Logo" || scene_type == "Point Click") return;
    const int safe_layer = bn::clamp(layer_id, 0, 3);
    if(safe_layer >= current_bgs.size() || !current_bgs[safe_layer].has_value()) return;
    if(safe_layer >= current_bgs_x.size() || safe_layer >= current_bgs_y.size()) return;
    current_bgs_x[safe_layer] += x;
    current_bgs_y[safe_layer] += y;
    set_camera_position(camera_x, camera_y);
}

void GraphicsManager::set_background_parallax(int layer_id, int x, int y) {
    const int safe_layer = bn::clamp(layer_id, 0, 3);
    if(safe_layer >= current_bgs_parallax_x.size() || safe_layer >= current_bgs_parallax_y.size()) return;
    current_bgs_parallax_x[safe_layer] = bn::clamp(x, -200, 200);
    current_bgs_parallax_y[safe_layer] = bn::clamp(y, -200, 200);
    set_camera_position(camera_x, camera_y);
}

bn::optional<bn::bg_palette_ptr> GraphicsManager::get_layer_palette(int layer_id) const
{
    if(layer_id < 0 || layer_id >= current_bgs.size() || !current_bgs[layer_id].has_value()) return bn::nullopt;
    return bn::bg_palette_ptr(current_bgs[layer_id]->palette());
}

// ----------------- Tilemap Methods -----------------
void GraphicsManager::initialize_tilemap(const Scenes* scene)
{
    // CARREGA OS TILEMAP
    
    // Valida scene
    if (scene == nullptr) {
        BN_LOG("Não é possível seguir com tilemap, sem scene");
        return;
    }

    // Valida tipo da cena
    bn::string<64> scene_type = scene->scene_type;
    if(scene_type == "Logo" && scene_type == "Point Click") {
        BN_LOG("Nao mapear tiles para cena do tipo LOGO");
        return;
    }

    // 1. Extrai linha e coluna e valida se tem realmente dados escritos
    int tilemap_rows = scene->tile_map_rows;
    int tilemap_cols = scene->tile_map_cols;
    
    if(tilemap_rows == 0 || tilemap_cols == 0 || scene->tile_data == nullptr)
    {
        BN_LOG("Tilemap row, col ou tile data não encontrado na scene: ", scene->name);
        return;
    }

    // 2. Generate background by tile_data
    // bn::string<64> image_type = scene->tile_image_type;

    // if(image_type == "dp_direct_bitmap_bg") {
        // generate_dp_direct_bitmap_bg_manager(tilemap_rows, tilemap_cols, scene->tile_data);
    // } else {
        // generate_palette_bitmap_bg_manager(current_palette_btmp_bg, tilemap_rows, tilemap_cols, scene->tile_data);
    // }

}

void GraphicsManager::startup_screen(bn::regular_bg_ptr gba_studio_logo) {
    current_bgs.clear();
    current_bitmap_bgs.reset();
    bn::core::update();  

    current_bgs.push_back(gba_studio_logo);
}

void GraphicsManager::startup_screen_bitmap(bn::direct_bitmap_item spritesheet) {
    current_bitmap_bgs.reset();
    bn::core::update();  
    
    bn::sp_direct_bitmap_bg_ptr bmp_bg = bn::sp_direct_bitmap_bg_ptr::create();
    bmp_bg.set_blending_enabled(true);

    // Usa o painter para desenhar a imagem dentro do BG
    bn::sp_direct_bitmap_bg_painter painter(bmp_bg);
    
    bn::size s = spritesheet.dimensions();
    int x = (240 - s.width()) / 2;
    int y = (160 - s.height()) / 2;

    painter.fill(bn::color(0, 0, 0));  // limpa tudo com preto
    painter.blit(x, y, spritesheet);

    // Guarda no current_bitmap_bg
    current_bitmap_bgs = bmp_bg;
}

const Scenes* GraphicsManager::load_next_scene_by_id(const bn::string<64>& scene_id) {
    // 2. Busca a cena pelo ID na registry
    const Scenes* scene = get_scene_by_id(scene_id);
    if(!scene)
    {
        BN_LOG("loadNextSceneById - Scene não encontrada com ID: ", scene_id.data());
        return nullptr;
    }
    BN_LOG("loadNextSceneById - Scene encontrada: ", scene->name);

    // A scene owns its currently visible sprites. Remove the previous player
    // before rendering and creating the one requested by Change Scene.
    clear_sprites();

    // Setar a currente scene para conseguir ser usada as funções
    setScene(scene);
    // Scene and editor coordinates use the image upper-left corner as the
    // world origin. Pan Camera moves this origin explicitly.
    camera_x = scene->camera_x;
    camera_y = scene->camera_y;
    // Keep CameraManager from replacing the scene's initial pan with its
    // default (0, 0) on the first frame.
    CameraManager::instance().set_position(camera_x, camera_y);
    
    // 3. Valida tipo da cena
    bn::string<64> scene_type = scene->scene_type;
    BN_LOG("..: Scene type: ", scene_type.data());
    if(!(scene_type == "Logo") && !(scene_type == "Point Click")) {
        // 4. Renderiza cena
        BN_LOG("[load_next_scene_by_id] Renderizando cena com REGULAR BG");
        GraphicsManager::render_scene_regular_bg(*scene);
    } else {
        BN_LOG("[load_next_scene_by_id] Renderizando cena com BITMAP BG");
        // 5. Renderiza cena
        GraphicsManager::render_scene_bitmap_bg(*scene);
    }
    set_camera_position(camera_x, camera_y);

    // Actors placed in the scene are part of the scene definition and must
    // exist before OnInit scripts can move, show, or remove them.
    for(int index = 0; scene->actors && index < scene->actors_count; ++index)
    {
        const SceneActor& actor = scene->actors[index];
        if(actor.id && actor.sprite_id)
        {
            spawn_actor(actor.id, actor.x, actor.y);
        }
    }

    // 6. Desenha tiles
    //GraphicsManager::initialize_tilemap(scene);

    return scene;
}

bn::optional<bn::sprite_ptr> GraphicsManager::create_sprite(const bn::sprite_item& item, int x, int y)
{
    if(sprite_count < MAX_SPRITES)
    {
        auto spr = item.create_sprite(x, y);
        // Screen fades only affect sprites that opt in to blending.
        spr.set_blending_enabled(true);
        // Actors and the player stay above regular backgrounds (priority 3)
        // while remaining below dialogue UI (priority 0).
        spr.set_bg_priority(2);
        sprites[sprite_count++] = spr;
        return spr;
    }
    return bn::nullopt;
}

bn::optional<bn::sprite_ptr> GraphicsManager::create_sprite(
        const Sprites& resource, const bn::sprite_item& item, int x, int y, const char* direction)
{
    if(sprite_count >= MAX_SPRITES)
    {
        return bn::nullopt;
    }

    const SpriteAnimationDefinition* idle_animation = nullptr;
    bn::string<32> directional_idle("idle-");
    directional_idle += direction ? direction : "right";

    // Prefer the idle matching Start Direction. Generic idle and idle-right
    // are fallbacks for fixed-direction and horizontally flipped sprites.
    for(int i = 0; i < resource.animations_count; ++i)
    {
        const SpriteAnimationDefinition& animation = resource.animations[i];
        if(resource.animations_count > 0 && !actor_motion::same_text(animation.state_id, resource.animations[0].state_id)) continue;
        if(!animation.animation_type || bn::string<16>(animation.animation_type) != "idle" ||
           !animation_frames_fit(animation, item.tiles_item().graphics_count()))
        {
            continue;
        }

        if(!idle_animation)
        {
            idle_animation = &animation;
        }

        const bn::string<32> animation_id(animation.animation_id ? animation.animation_id : "");
        if(animation_id == directional_idle || animation_id == "idle" ||
           (animation_id == "idle-right" && direction && bn::string<16>(direction) == "left"))
        {
            idle_animation = &animation;
            if(animation_id == directional_idle)
            {
                break;
            }
        }
    }

    const bool flip_horizontally = idle_animation && direction &&
        bn::string<16>(direction) == "left" &&
        (bn::string<32>(idle_animation->animation_id ? idle_animation->animation_id : "") == "idle-right" ||
         bn::string<32>(idle_animation->animation_id ? idle_animation->animation_id : "") == "idle") &&
        idle_animation->flip_right_to_create_left_frames;

    // Sprite Editor frames point to their actual source rectangle in the
    // spritesheet. Prefer that data over the old idle_frame field, which is
    // only an editor index and can refer to an empty tile.
    const SpriteCanvasFrameDefinition* canvas_idle = nullptr;
    for(int i = 0; i < resource.canvas_frames_count; ++i)
    {
        const SpriteCanvasFrameDefinition& frame = resource.canvas_frames[i];
        const bn::string<32> animation_id(frame.animation_id ? frame.animation_id : "");
        if(!canvas_idle)
        {
            canvas_idle = &frame;
        }

        if(animation_id == directional_idle || animation_id == "idle" ||
           (animation_id == "idle-right" && direction && bn::string<16>(direction) == "left"))
        {
            canvas_idle = &frame;
            if(animation_id == directional_idle)
            {
                break;
            }
        }
    }

    int initial_frame = idle_animation ? idle_animation->frames[0] : resource.idle_frame;
    if(canvas_idle && canvas_idle->pieces_count > 0 && resource.canvas_pieces &&
       resource.frame_width > 0 && resource.frame_height > 0)
    {
        const int pieces_count = bn::max(0, resource.canvas_pieces_count);
        const int piece_index = canvas_idle->first_piece;
        if(piece_index >= 0 && piece_index < pieces_count)
        {
            const SpriteCanvasPiece& piece = resource.canvas_pieces[piece_index];
            int sheet_columns = resource.image_width / resource.frame_width;
            if(sheet_columns < 1) sheet_columns = 1;
            initial_frame = (piece.source_y / resource.frame_height) * sheet_columns +
                            (piece.source_x / resource.frame_width);
        }
    }
    const int graphics_count = item.tiles_item().graphics_count();
    if(initial_frame < 0 || initial_frame >= graphics_count)
    {
        BN_LOG("Sprite initial frame out of range: ", initial_frame, " / ", graphics_count, "; using 0");
        initial_frame = 0;
    }
    BN_LOG("Player sprite: create initial graphics frame ", initial_frame, " of ", graphics_count);
    auto spr = item.create_sprite(x, y, initial_frame);
    spr.set_horizontal_flip(flip_horizontally);
    spr.set_blending_enabled(true);
    // Actors and the player stay above regular backgrounds (priority 3)
    // while remaining below dialogue UI (priority 0).
    spr.set_bg_priority(2);

    const int slot = sprite_count++;
    sprites[slot] = spr;
    sprite_tiles_items[slot] = item.tiles_item();
    sprite_resources[slot] = &resource;
    sprite_animations[slot] = idle_animation;
    sprite_main_states[slot] = idle_animation ? idle_animation->state_id : resource.animations_count > 0 ? resource.animations[0].state_id : nullptr;
    sprite_animation_frames[slot] = 0;
    sprite_animation_updates[slot] = 0;
    const Settings* settings = get_settings();
    // Zero is the editor's "None" option: keep the first idle frame visible
    // instead of falling back to an arbitrary animation speed.
    sprite_animation_speeds[slot] = settings ? settings->anim_speed : resource.animation_speed;
    return spr;
}

void GraphicsManager::remove_sprite(const bn::sprite_ptr& sprite)
{
    for(int i = 0; i < sprite_count; ++i)
    {
        if(sprites[i].has_value() && sprites[i].value() == sprite)
        {
            sprites[i].reset();
            break;
        }
    }
}

void GraphicsManager::update_tile_animations()
{
    if(!currentScene || !currentScene->tile_animations || currentScene->tile_animations_count <= 0)
    {
        return;
    }

    if(tile_animation_scene != currentScene)
    {
        tile_animation_scene = currentScene;
        for(int index = 0; index < 32; ++index)
        {
            tile_animation_frames[index] = 0;
            tile_animation_ticks[index] = 0;
            tile_animation_initialized[index] = false;
        }
    }

    const int animations_count = bn::min(currentScene->tile_animations_count, 32);
    for(int index = 0; index < animations_count; ++index)
    {
        const TileAnimation& animation = currentScene->tile_animations[index];
        if(animation.layer_id < 0 || animation.layer_id >= current_bgs.size() ||
           !current_bgs[animation.layer_id].has_value() || !animation.frame_tile_indices ||
           animation.frames_count <= 0 || animation.target_tile_index < 0 ||
           animation.target_tile_index >= 1024)
        {
            continue;
        }

        bn::regular_bg_tiles_ptr tiles = current_bgs[animation.layer_id]->tiles();
        const auto tile_data = tiles.tiles_ref();
        if(!tile_data.has_value()) continue;
        const int frame_count = bn::min(animation.frames_count, 32);
        if(!tile_animation_initialized[index])
        {
            tile_animation_frames[index] = bn::clamp(animation.initial_frame, 0, frame_count - 1);
            tile_animation_initialized[index] = true;
            tile_animation_ticks[index] = 0;
            const int source = animation.frame_tile_indices[tile_animation_frames[index]] *
                (tiles.bpp() == bn::bpp_mode::BPP_8 ? 2 : 1);
            if(source >= 0 && source < tile_data->size())
                tiles.overwrite_tile(animation.target_tile_index, (*tile_data)[source]);
        }

        const int duration = bn::max(animation.duration_frames, 1);
        if(++tile_animation_ticks[index] < duration) continue;
        tile_animation_ticks[index] = 0;
        int next_frame = tile_animation_frames[index] + 1;
        if(next_frame >= frame_count)
        {
            if(!animation.loop) continue;
            next_frame = 0;
        }
        tile_animation_frames[index] = next_frame;
        const int source = animation.frame_tile_indices[next_frame] *
            (tiles.bpp() == bn::bpp_mode::BPP_8 ? 2 : 1);
        if(source >= 0 && source < tile_data->size())
            tiles.overwrite_tile(animation.target_tile_index, (*tile_data)[source]);
    }
}

void GraphicsManager::sync_shooter_projectiles(const ShooterKit& shooter, const char* sprite_id)
{
    const bn::string<64> requested_id = sprite_id ? sprite_id : "";
    const Sprites* resource = requested_id.empty() ? nullptr : get_sprite_by_id(requested_id);
    auto item = resource ? get_sprite_item_from_name(bn::string<64>(resource->graphics_name)) : bn::optional<bn::sprite_item>();

    for(int slot = 0; slot < MAX_SHOOTER_PROJECTILE_SPRITES; ++slot)
    {
        const int source_index = shooter_projectile_indices[slot];
        ShooterProjectile projectile{};
        const bool source_active = source_index >= 0 && shooter.projectile_at(source_index, projectile);
        if(source_active && item.has_value() && resource)
        {
            const int screen_x = projectile.x - camera_x - 120 + resource->frame_width / 2 - resource->canvas_origin_x;
            const int screen_y = projectile.y - camera_y - 80 + resource->frame_height / 2 - resource->canvas_origin_y;
            if(!shooter_projectile_sprites[slot].has_value())
            {
                auto created = item->create_sprite(screen_x, screen_y, resource->idle_frame);
                created.set_bg_priority(2);
                created.set_blending_enabled(true);
                shooter_projectile_sprites[slot] = created;
            }
            else
            {
                shooter_projectile_sprites[slot]->set_position(screen_x, screen_y);
            }
            continue;
        }
        shooter_projectile_sprites[slot].reset();
        shooter_projectile_indices[slot] = -1;
    }

    if(!item.has_value() || !resource) return;
    for(int source_index = 0; source_index < 128; ++source_index)
    {
        ShooterProjectile projectile{};
        if(!shooter.projectile_at(source_index, projectile)) continue;
        bool already_bound = false;
        for(int slot = 0; slot < MAX_SHOOTER_PROJECTILE_SPRITES; ++slot)
            if(shooter_projectile_indices[slot] == source_index) { already_bound = true; break; }
        if(already_bound) continue;
        for(int slot = 0; slot < MAX_SHOOTER_PROJECTILE_SPRITES; ++slot)
        {
            if(shooter_projectile_indices[slot] >= 0) continue;
            shooter_projectile_indices[slot] = source_index;
            break;
        }
    }
}

void GraphicsManager::sync_shooter_drops(const ShooterKit& shooter)
{
    const int visible_count = bn::min(shooter.drop_count(), MAX_SHOOTER_PROJECTILE_SPRITES);
    for(int slot = 0; slot < MAX_SHOOTER_PROJECTILE_SPRITES; ++slot)
    {
        if(slot >= visible_count)
        {
            shooter_drop_sprites[slot].reset();
            shooter_drop_ids[slot] = "";
            continue;
        }
        ShooterDrop drop{};
        if(!shooter.drop_at(slot, drop) || !drop.drop_id)
        {
            shooter_drop_sprites[slot].reset();
            continue;
        }
        const bn::string<64> drop_id(drop.drop_id);
        const Sprites* resource = get_sprite_by_id(drop_id);
        auto item = resource ? get_sprite_item_from_name(bn::string<64>(resource->graphics_name)) : bn::optional<bn::sprite_item>();
        if(!resource || !item.has_value())
        {
            shooter_drop_sprites[slot].reset();
            shooter_drop_ids[slot] = drop_id;
            continue;
        }
        const int screen_x = drop.x - camera_x - 120 + resource->frame_width / 2 - resource->canvas_origin_x;
        const int screen_y = drop.y - camera_y - 80 + resource->frame_height / 2 - resource->canvas_origin_y;
        if(!shooter_drop_sprites[slot].has_value() || shooter_drop_ids[slot] != drop_id)
        {
            shooter_drop_sprites[slot].reset();
            auto created = item->create_sprite(screen_x, screen_y, resource->idle_frame);
            created.set_bg_priority(2);
            created.set_blending_enabled(true);
            shooter_drop_sprites[slot] = created;
            shooter_drop_ids[slot] = drop_id;
        }
        else
        {
            shooter_drop_sprites[slot]->set_position(screen_x, screen_y);
        }
    }
}

void GraphicsManager::sync_shooter_hud(const ShooterKit& shooter)
{
    shooter_hud_sprites.clear();
    if(!shooter.running()) return;
    bn::string<64> text = "HP: ";
    text += bn::to_string<8>(CombatManager::instance().player_hit_points());
    text += "  EN: ";
    text += bn::to_string<8>(shooter.enemy_count());
    text += "  P: ";
    text += bn::to_string<8>(shooter.projectile_count());
    text += "  D: ";
    text += bn::to_string<8>(shooter.drop_count());
    if(shooter.boss_active())
    {
        text += "  BOSS: ";
        text += bn::to_string<8>(shooter.boss_hit_points());
    }
    bn::sprite_text_generator generator(common::variable_8x8_sprite_font);
    generator.set_bg_priority(0);
    generator.set_z_order(-2);
    generator.generate_top_left(4, 4, text, shooter_hud_sprites);
}

void GraphicsManager::update_sprites()
{
    update_sprite_effects();
    update_tile_animations();
    for(int i = 0; i < sprite_count; ++i)
    {
        if(!sprites[i].has_value() || !sprite_animations[i] || !sprite_tiles_items[i].has_value())
        {
            continue;
        }

        const SpriteAnimationDefinition& animation = *sprite_animations[i];
        if(sprite_script_motion[i] && animation.animation_type && bn::string<16>(animation.animation_type) == "climb" && !sprite_script_climb_direction[i]) continue;
        if(!sprite_script_motion[i] && i == player_slot && animation.animation_type && bn::string<16>(animation.animation_type) == "climb" &&
           (!player_climbing || !player_on_ladder(player_world_x, player_world_y) ||
            (!InputManager::instance().held("move_up") && !InputManager::instance().held("move_down")))) continue;
        if(!animation_frames_fit(animation, sprite_tiles_items[i]->graphics_count()) || animation.frames_count <= 1)
        {
            continue;
        }

        // Animation speed is stored as the editor's selectable level. Keep
        // this table in sync with the editor labels (0, 0.47, 0.94, 1.88,
        // 3.75, 7.5, 15, 30 and 60 FPS).
        const int speed = sprite_animation_speeds[i];
        if(speed <= 0)
        {
            continue;
        }
        int wait_updates = 1;
        switch(speed)
        {
            case 1: wait_updates = 128; break;
            case 2: wait_updates = 64; break;
            case 3: wait_updates = 32; break;
            case 4: wait_updates = 16; break;
            case 5: wait_updates = 8; break;
            case 6: wait_updates = 4; break;
            case 7: wait_updates = 2; break;
            case 8: wait_updates = 1; break;
            default: wait_updates = speed >= 60 ? 1 : bn::max(1, 60 / speed); break;
        }
        if(++sprite_animation_updates[i] < wait_updates)
        {
            continue;
        }

        sprite_animation_updates[i] = 0;
        const bool scripted_climbing_down = sprite_script_motion[i] && sprite_script_climb_direction[i] > 0;
        const bool climbing_down = scripted_climbing_down || (!sprite_script_motion[i] && i == player_slot && player_climbing && animation.animation_type &&
            bn::string<16>(animation.animation_type) == "climb" &&
            !InputManager::instance().held("move_up") && InputManager::instance().held("move_down"));
        const int frame_step = climbing_down ? animation.frames_count - 1 : 1;
        sprite_animation_frames[i] = (sprite_animation_frames[i] + frame_step) % animation.frames_count;
        const int next_frame = animation.frames[sprite_animation_frames[i]];
        if(next_frame >= 0 && next_frame < sprite_tiles_items[i]->graphics_count())
        {
            sprites[i]->set_tiles(sprite_tiles_items[i].value(), next_frame);
        }
    }
}

void GraphicsManager::clear_sprites()
{
    ActorMotionManager::instance().cancel();
    for(int i = 0; i < sprite_count; ++i)
    {
        sprites[i].reset();
        sprite_tiles_items[i].reset();
        sprite_resources[i] = nullptr;
        sprite_animations[i] = nullptr;
        sprite_main_states[i] = nullptr;
        sprite_animation_frames[i] = 0;
        sprite_animation_updates[i] = 0;
        sprite_script_motion[i] = false;
        sprite_script_climb_direction[i] = 0;
    }
    sprite_count = 0;
    player_slot = -1;
    actor_interaction_script = nullptr;
    actor_interaction_count = 0;
    actor_count = 0;
    ActorManager::instance().reset();
    tile_animation_scene = nullptr;
    for(int index = 0; index < 32; ++index)
    {
        tile_animation_frames[index] = 0;
        tile_animation_ticks[index] = 0;
        tile_animation_initialized[index] = false;
    }
}

bn::optional<bn::sprite_ptr> GraphicsManager::create_ui_sprite(const char* graphics_name, int x, int y)
{
    if(!graphics_name || graphics_name[0] == '\0') return bn::optional<bn::sprite_ptr>();
    const auto item = get_sprite_item_from_name(bn::string<64>(graphics_name));
    if(!item.has_value()) return bn::optional<bn::sprite_ptr>();
    return item->create_sprite(x, y);
}

bn::optional<bn::sprite_ptr> GraphicsManager::create_ui_sprite_frame(const char* graphics_name, int x, int y, int frame)
{
    if(!graphics_name || graphics_name[0] == '\0') return bn::nullopt;
    const auto item = get_sprite_item_from_name(bn::string<64>(graphics_name));
    if(!item.has_value()) return bn::nullopt;
    return item->create_sprite(x, y, frame);
}

bn::optional<bn::regular_bg_ptr> GraphicsManager::create_ui_frame_bg(const char* graphics_name)
{
    if(!graphics_name || graphics_name[0] == '\0') return bn::nullopt;
    const auto item = get_bg_item_from_name(bn::string<64>(graphics_name));
    if(!item.has_value()) return bn::nullopt;
    return bn::regular_bg_ptr::create_optional(*item);
}

int GraphicsManager::get_sprite_count() const
{
    return sprite_count;
}
