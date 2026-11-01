#include "bn_sprite_affine_mat_ptr.h"
#include "bn_math.h"
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
#include "gba_studio_features.h"
#if GBA_STUDIO_FEATURE_BACKGROUND_ANIMATION
#include "background_animation_clock.h"
#include "background_animation_bitmap.h"
#endif
#if GBA_STUDIO_FEATURE_SPRITE_EFFECTS
#include "actor_visual_colors.h"
#include "bn_blending.h"
#endif
#if GBA_STUDIO_FEATURE_MOTION
#include "actor_motion_manager.h"
#endif
#if GBA_STUDIO_FEATURE_ACTORS
#include "actor_manager.h"
#endif
#if GBA_STUDIO_FEATURE_SHOOTER
#include "shooter_kit.h"
#endif
#if GBA_STUDIO_FEATURE_SCRIPTS
#include "script_command_manager.h"
#endif
#include "bn_keypad.h"
#include "camera_manager.h"
#include "input_manager.h"
#include "local_variables.h"
#if GBA_STUDIO_FEATURE_VARIABLES
#include "variable_manager.h"
#endif

void GraphicsManager::update_input_scene_type(const Scenes* scene)
{
    InputManager::instance().set_scene_type(scene ? scene->scene_type : nullptr);
#if GBA_STUDIO_FEATURE_VARIABLES
    VariableManager::instance().clear_locals();
#endif
}
#if GBA_STUDIO_FEATURE_SHOOTER
#include "common_variable_8x8_sprite_font.h"
#endif

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

    bool animation_frames_fit_composite(const SpriteAnimationDefinition& animation, int graphics_count, int parts_count)
    {
        if(!animation_frames_fit(animation, graphics_count) || parts_count <= 0) return false;
        for(int index = 0; index < animation.frames_count; ++index)
            if(animation.frames[index] + parts_count > graphics_count) return false;
        return true;
    }

#if GBA_STUDIO_FEATURE_SPRITE_EFFECTS
    struct SpriteEffectTween {
        int frame = 0;
        int duration = 0;
        int start = 0;
        int target = 0;
        int color = 0;
        bool active = false;
    };
    struct SpriteEffectState { SpriteEffectTween channels[3]; };
    // Actor indices move together with their effect state. The last slot is
    // reserved for the player, independently of the current actor count.
    BN_DATA_EWRAM_BSS SpriteEffectState sprite_effect_states[GBA_STUDIO_MAX_ACTORS + 1];
    void apply_sprite_effect(bn::sprite_ptr& sprite, int operation, int value, int color) {
        if(operation == 0) sprite.set_rotation_angle_safe(bn::fixed(value));
        else if(operation == 1) sprite.set_scale(bn::fixed(value) / 100);
        else {
            bn::sprite_palette_ptr palette(sprite.palette());
            palette.set_fade(bn::color(((color >> 16) & 255) * 31 / 255,
                ((color >> 8) & 255) * 31 / 255, (color & 255) * 31 / 255), bn::fixed(value) / 100);
        }
    }
    struct ActorVisualState {
        int root = 0;
        int opacity = 0;
        bool occupied = false;
    };
    BN_DATA_EWRAM_BSS ActorVisualState actor_visual_states[GBA_STUDIO_MAX_ACTORS + 1];
    bool actor_opacity_control = false;
    int actor_opacity_percent = 100;
#endif
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

#if GBA_STUDIO_FEATURE_BACKGROUND_TRANSFORM
bn::optional<bn::affine_bg_item> get_affine_bg_item_from_name(const bn::string<64>& name)
{
    (void) name;
    {{AFFINE_BACKGROUND_CONDITIONALS_FROM_NAME}}
    return bn::nullopt;
}
#endif

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

// ----------------- ImplementaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o da classe -----------------

GraphicsManager::GraphicsManager() : sprite_count(0)
{
#if GBA_STUDIO_FEATURE_SHOOTER
    for(int& index : shooter_projectile_indices) index = -1;
#endif
}
GraphicsManager::~GraphicsManager() {}

int GraphicsManager::sprite_group_parts(int root_slot) const
{
    if(root_slot < 0 || root_slot >= sprite_count || !sprite_resources[root_slot]) return 1;
    const Sprites& resource = *sprite_resources[root_slot];
    return bn::max(1, resource.composite_columns) * bn::max(1, resource.composite_rows);
}

void GraphicsManager::set_sprite_group_position(int root_slot, int world_x, int world_y)
{
    if(root_slot < 0 || root_slot >= sprite_count || !sprite_resources[root_slot]) return;
    const Sprites& resource = *sprite_resources[root_slot];
    const int columns = bn::max(1, resource.composite_columns);
    const int rows = bn::max(1, resource.composite_rows);
    const int parts_count = columns * rows;
    const int root_x = world_x - camera_x - 120 + resource.frame_width / 2 - resource.canvas_origin_x;
    const int root_y = world_y - camera_y - 80 + resource.frame_height / 2 - resource.canvas_origin_y;
    for(int part = 0; part < parts_count && root_slot + part < sprite_count; ++part)
    {
        const int slot = root_slot + part;
        if(!sprites[slot]) continue;
        const int column = part % columns;
        const int row = part / columns;
        sprites[slot]->set_position(root_x + column * resource.frame_width, root_y + row * resource.frame_height);
    }
}

const Scenes* GraphicsManager::initialize()
{
    // ### CARREGAR BACKGROUND ###
    // 1. Pega o settings
    const Settings* settings = get_settings();
    if(!settings)
    {
        BN_LOG("Settings nÃƒÆ’Ã‚Â£o encontrado");
        return nullptr;
    }

    // An empty Starting Scene is deliberate: never silently boot an arbitrary
    // scene, because that makes a project appear to ignore its configuration.
    const Scenes* scene = settings->start_scene_id && settings->start_scene_id[0] != '\0'
        ? GraphicsManager::load_next_scene_by_id(settings->start_scene_id)
        : nullptr;

    if(scene)
    {
        spawn_player(*scene, settings->start_x_pixels, settings->start_y_pixels, settings->direction, true);
    }

    return scene;
}

void GraphicsManager::spawn_player(const Scenes& scene, int tile_x, int tile_y, const char* direction, bool anchor_pixels)
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

    // Settings and Change Scene supply pixels of the canvas origin, matching
    // the editor marker and Move Actor. The builder converts Settings tile units.
    // Butano sprites themselves are positioned by their centre.
    constexpr int TILE_SIZE = 16;
    constexpr int SCREEN_CENTER_X = 120;
    constexpr int SCREEN_CENTER_Y = 80;
    camera_x = scene.camera_x;
    camera_y = scene.camera_y;
    // The editor's canvas origin is the point anchored to the actor/player
    // position. Butano sprite coordinates refer to the sprite centre.
    player_world_x = anchor_pixels ? bn::clamp(tile_x, player->canvas_origin_x, bn::max(player->canvas_origin_x, scene.scene_width - player->frame_width + player->canvas_origin_x)) : tile_x * TILE_SIZE + player->canvas_origin_x;
    player_world_y = anchor_pixels ? bn::clamp(tile_y, player->canvas_origin_y, bn::max(player->canvas_origin_y, scene.scene_height - player->frame_height + player->canvas_origin_y)) : tile_y * TILE_SIZE + player->canvas_origin_y;
    player_vertical_velocity_q8 = 0;
    player_vertical_remainder_q8 = 0;
    player_grounded = false;
    player_climbing = false;
    player_ignored_platform_index = -1;
    player_drop_through_active = false;
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
    player_slot = created_sprite_root;
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
        if(sprite_main_states[player_slot] && !actor_motion::same_text(animation.state_id ? animation.state_id : "", sprite_main_states[player_slot])) continue;
        if(actor_motion::same_text(animation.animation_type ? animation.animation_type : "", requested_type ? requested_type : moving ? "movement" : "idle"))
        {
            // Reject unrelated clips before walking their immutable frame lists.
            if(!animation_frames_fit_composite(animation, graphics_count, sprite_group_parts(player_slot))) continue;
            const bn::string<32> animation_id(animation.animation_id ? animation.animation_id : "");
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
        const int parts_count = sprite_group_parts(player_slot);
        for(int part = 0; part < parts_count && player_slot + part < sprite_count; ++part)
        {
            const int slot = player_slot + part;
            sprite_animations[slot] = selected;
            sprite_animation_frames[slot] = 0;
            sprite_animation_updates[slot] = 0;
            sprite_animation_modes[slot] = 0;
            sprite_animation_reverse[slot] = false;
            if(sprite_tiles_items[slot].has_value()) sprites[slot]->set_tiles(sprite_tiles_items[slot].value(), selected->frames[0] + part);
        }
    }
    if(selected)
    {
        const int parts_count = sprite_group_parts(player_slot);
        const bn::string<32> animation_id(selected->animation_id ? selected->animation_id : "");
        const bool flip = player_direction == "left" &&
            (animation_id == "moving-right" || animation_id == "idle-right" ||
             animation_id == "running" || animation_id == "moving" || animation_id == "idle") &&
            selected->flip_right_to_create_left_frames;
        for(int part = 0; part < parts_count && player_slot + part < sprite_count; ++part)
            sprites[player_slot + part]->set_horizontal_flip(flip);
    }
}

bool GraphicsManager::actor_is_facing(const char* actor_id, const char* target_actor_id, bool look_x, bool look_y, int distance_x, int distance_y) const
{
    actor_motion::State source, target;
    if(!read_script_actor_state(actor_id, source) || !read_script_actor_state(target_actor_id, target)) return false;
    const int dx = target.x - source.x, dy = target.y - source.y;
    if(dx == 0 && dy == 0) return false;
    const int ax = dx < 0 ? -dx : dx, ay = dy < 0 ? -dy : dy;
    if((look_x && distance_x > 0 && ax > distance_x) ||
       (look_y && distance_y > 0 && ay > distance_y)) return false;
    // At diagonal ties either matching cardinal direction is accepted.
    return (look_x && dx != 0 && (!look_y || ax >= ay) && source.direction == (dx > 0 ? 1 : 3)) ||
           (look_y && dy != 0 && (!look_x || ay >= ax) && source.direction == (dy > 0 ? 2 : 0));
}

bool GraphicsManager::player_overlaps_trigger(const ScriptTrigger& trigger, int x, int y) const
{
    const Sprites* body = player_slot >= 0 && player_slot < sprite_count ? sprite_resources[player_slot] : nullptr;
    if(!body || trigger.width <= 0 || trigger.height <= 0) return false;
    const int left = x + body->collision_x, top = y + body->collision_y;
    return left < trigger.x + trigger.width && left + bn::max(1, body->collision_width) > trigger.x &&
           top < trigger.y + trigger.height && top + bn::max(1, body->collision_height) > trigger.y;
}

bool GraphicsManager::update_actor_interaction(bool interact_pressed)
{
#if GBA_STUDIO_FEATURE_SCRIPTS
    if(!currentScene || !currentScene->actors) return false;
    if(interact_pressed && !actor_interaction_script)
    {
        // Interaction uses contact between the authored colliders, with no
        // additional proximity area beyond their configured sizes/offsets.
        const int interaction_range = 0;
        int best_index = -1;
        int best_distance = 1000000;
        for(int index = 0; index < actor_count; ++index)
        {
            if(!actor_definitions[index] || actor_initialization[index] != 2 || actor_slots[index] < 0 || !sprites[actor_slots[index]] || !sprites[actor_slots[index]]->visible()) continue;
            const SceneActor& actor = *actor_definitions[index];
            const Sprites* actor_resource = sprite_resources[actor_slots[index]];
            const Sprites* player_resource = player_slot >= 0 && player_slot < sprite_count
                ? sprite_resources[player_slot] : nullptr;
            if(!actor_resource || !player_resource) continue;
            const int actor_left = actor_world_x[index] + actor_resource->collision_x;
            const int actor_top = actor_world_y[index] + actor_resource->collision_y;
            const int player_left = player_world_x + player_resource->collision_x;
            const int player_top = player_world_y + player_resource->collision_y;
            // Measure the gap between collision boxes, including their offsets.
            const int dx = bn::max(0, bn::max(actor_left - player_left - bn::max(1, player_resource->collision_width),
                player_left - actor_left - bn::max(1, actor_resource->collision_width)));
            const int dy = bn::max(0, bn::max(actor_top - player_top - bn::max(1, player_resource->collision_height),
                player_top - actor_top - bn::max(1, actor_resource->collision_height)));
            if(dx <= interaction_range && dy <= interaction_range && actor.on_interact && actor.on_interact_count > 0)
            {
                const int distance = dx + dy;
                if(distance < best_distance) { best_distance = distance; best_index = index; }
            }
        }
        if(best_index >= 0)
        {
            actor_interaction_script = actor_definitions[best_index]->on_interact;
            actor_interaction_count = actor_definitions[best_index]->on_interact_count;
            actor_interaction_actor_id = actor_definitions[best_index]->id;
            ScriptCommand::instance().restart(currentScene->id, actor_interaction_script, actor_interaction_actor_id);
        }
    }
    if(!actor_interaction_script) return false;
    const bool completed = ScriptCommand::instance().execute(currentScene->id, actor_interaction_script, actor_interaction_count, actor_interaction_actor_id);
    if(completed)
    {
        actor_interaction_script = nullptr;
        actor_interaction_count = 0;
        actor_interaction_actor_id = nullptr;
    }
    return true;
#else
    (void) interact_pressed;
    return false;
#endif
}

void GraphicsManager::update_actor_initialization(bool allow_scene_actors)
{
    update_actor_residency();
    (void) allow_scene_actors;
#if GBA_STUDIO_FEATURE_SCRIPTS
    if(!currentScene || !currentScene->actors) return;
    const unsigned revision = get_scene_revision();
    for(int index = 0; index < actor_count; ++index)
    {
        if(actor_initialization[index] == 2 || !actor_definitions[index]) continue;
        const SceneActor& actor = *actor_definitions[index];
        if(!actor.keep_running_while_offscreen && !actor_on_screen(actor, actor_world_x[index], actor_world_y[index], index)) continue;
        if(!allow_scene_actors && !actor.spawn_prefab_id) continue;
        if(actor_initialization[index] == 0) {
            ScriptCommand::instance().restart(currentScene->id, actor.on_init, actor.id);
            ScriptCommand::instance().restart(currentScene->id, actor.on_update, actor.id);
            ScriptCommand::instance().restart(currentScene->id, actor.on_interact, actor.id);
            actor_initialization[index] = 1;
        }
        const bool complete = !actor.on_init || actor.on_init_count <= 0 || ScriptCommand::instance().execute(currentScene->id, actor.on_init, actor.on_init_count, actor.id);
        if(get_scene_revision() != revision) return;
        if(index >= actor_count || actor_definitions[index] != &actor) continue;
        if(!complete) return;
        ScriptCommand::instance().restart(currentScene->id, actor.on_init, actor.id);
        actor_initialization[index] = 2;
    }
#endif
}

bool GraphicsManager::show_emote(const char* actor_id, const char* emote_id, int distance)
{
    if(!actor_id || !actor_id[0] || !emote_id || !emote_id[0]) return false;
    const bn::string<64> actor_name(actor_id);
    int world_x = 0;
    int world_y = 0;
    bool actor_found = false;
    if(actor_name == "__PLAYER__")
    {
        if(player_slot < 0 || player_slot >= sprite_count || !sprites[player_slot]) return false;
        world_x = player_world_x;
        world_y = player_world_y;
        actor_found = true;
    }
    else
    {
        for(int index = 0; index < actor_count; ++index)
            if(actor_ids[index] == actor_name)
            {
                world_x = actor_world_x[index];
                world_y = actor_world_y[index];
                actor_found = true;
                break;
            }
    }
    if(!actor_found) return false;

    auto item = get_sprite_item_from_name(bn::string<64>(emote_id));
    if(!item) return false;
    EmoteAnimationState* state = nullptr;
    for(EmoteAnimationState& candidate : emote_animations)
        if(candidate.occupied && candidate.actor_id == actor_name) { state = &candidate; break; }
    if(!state)
        for(EmoteAnimationState& candidate : emote_animations)
            if(!candidate.occupied) { state = &candidate; break; }
    if(!state) return false;
    if(state->sprite) remove_sprite(state->sprite.value());

    const int screen_x = world_x - camera_x - 120;
    const int screen_y = world_y - camera_y - 80 - std::clamp(distance, 0, 256);
    auto sprite = create_sprite(item.value(), screen_x, screen_y);
    if(!sprite) { *state = EmoteAnimationState(); return false; }
    sprite->set_z_order(-1);
    state->actor_id = actor_name;
    state->sprite = sprite.value();
    state->elapsed_frames = 0;
    state->distance = std::clamp(distance, 0, 256);
    state->occupied = true;
    return true;
}

GraphicsManager::ActorResidence* GraphicsManager::actor_residence(const char* id)
{
    for(auto& residence : actor_residences)
        if(id && actor_motion::same_text(residence.definition->id, id)) return &residence;
    return nullptr;
}

const GraphicsManager::ActorResidence* GraphicsManager::actor_residence(const char* id) const
{
    for(const auto& residence : actor_residences)
        if(id && actor_motion::same_text(residence.definition->id, id)) return &residence;
    return nullptr;
}

bool GraphicsManager::actor_on_screen(const SceneActor& actor, int x, int y, int active_index) const
{
    const Sprites* resource = nullptr;
#if GBA_STUDIO_FEATURE_ACTORS
    if(active_index >= 0 && active_index < actor_count && actor_definitions[active_index] == &actor) {
        const int slot = actor_slots[active_index];
        if(slot >= 0 && slot < sprite_count) resource = sprite_resources[slot];
    }
#endif
    (void) active_index;
    if(!resource) resource = actor.sprite_id ? get_sprite_by_id(bn::string<64>(actor.sprite_id)) : nullptr;
    if(!resource) return false;
#if GBA_STUDIO_FEATURE_SPRITE_EFFECTS
    // Affine sprites can extend outside their untransformed canvas. A
    // conservative radius keeps every rotated/scaled part until it leaves.
    for(int index = active_index >= 0 ? active_index : 0; index < actor_count; ++index) if(actor_definitions[index] == &actor) {
        const int root = actor_slots[index];
        bool affine = false;
        for(int part = 0; root >= 0 && part < sprite_group_parts(root); ++part)
            affine = affine || (sprites[root + part] && sprites[root + part]->affine_mat().has_value());
        if(!affine) break;
        for(int part = 0; part < sprite_group_parts(root); ++part) if(sprites[root + part]) {
            const auto& sprite = *sprites[root + part];
            const auto size = sprite.shape_size();
            const auto radius = (size.width() * bn::abs(sprite.horizontal_scale()) + size.height() * bn::abs(sprite.vertical_scale())) / 2;
            if(sprite.x() - radius < 120 && sprite.x() + radius > -120 && sprite.y() - radius < 80 && sprite.y() + radius > -80) return true;
        }
        return false;
    }
#endif
    const int left = x - resource->canvas_origin_x;
    const int top = y - resource->canvas_origin_y;
    const int width = resource->frame_width * bn::max(1, resource->composite_columns);
    const int height = resource->frame_height * bn::max(1, resource->composite_rows);
    return left < camera_x + 240 && left + width > camera_x && top < camera_y + 160 && top + height > camera_y;
}

void GraphicsManager::update_actor_residency()
{
#if GBA_STUDIO_FEATURE_ACTORS
    if(!currentScene) return;
    // Release before allocating newly visible instances. Cull complete canvases,
    // including every composite part; touching the screen keeps the actor alive.
    for(int index = actor_count - 1; index >= 0; --index) {
        const auto* actor = actor_definitions[index];
        if(actor && !actor->keep_running_while_offscreen && !actor_on_screen(*actor, actor_world_x[index], actor_world_y[index], index)) {
            const bn::string<64> id = actor_ids[index];
            remove_actor(id.data(), true);
        }
    }
    for(auto& residence : actor_residences) {
        const auto& actor = *residence.definition;
        if(!residence.enabled || residence.active) continue;
        // Live actors were checked above at their current position. Do not
        // resolve their resource and test their saved position a second time.
        if(!actor.keep_running_while_offscreen && !actor_on_screen(actor, residence.x, residence.y)) continue;
        spawn_actor(actor.id, residence.x, residence.y);
    }
#endif
}

bool GraphicsManager::spawn_actor(const char* actor_id, int x, int y, bool from_prefab)
{
#if GBA_STUDIO_FEATURE_ACTORS
    if(!currentScene || !actor_id) return false;
    for(int i = 0; i < actor_count; ++i)
    {
        if(!from_prefab && bn::string<64>(actor_ids[i]) == actor_id) return move_actor(actor_id, x, y);
    }
    const SceneActor* definition = nullptr;
    for(int i = 0; i < currentScene->actors_count; ++i)
    {
        const SceneActor& candidate = currentScene->actors[i];
        if(from_prefab) {
            if(!candidate.spawn_prefab_id || !actor_motion::same_text(candidate.spawn_prefab_id, actor_id)) continue;
            bool occupied = false;
            if(const auto* residence = actor_residence(candidate.id)) occupied = residence->enabled;
            for(int live = 0; live < actor_count; ++live) if(actor_ids[live] == candidate.id) { occupied = true; break; }
            if(occupied) continue;
        }
        if(candidate.id && (from_prefab || bn::string<64>(candidate.id) == actor_id))
        {
            definition = &currentScene->actors[i];
            break;
        }
    }
    if(!definition || !definition->sprite_id) return false;
    actor_id = definition->id;
    auto* residence = actor_residence(actor_id);
    if(!residence) return false;
    residence->enabled = true;
    residence->x = x; residence->y = y;
#if GBA_STUDIO_FEATURE_SAVE
    if(!game_save_restoring)
#endif
    if(!definition->keep_running_while_offscreen && !actor_on_screen(*definition, x, y)) return true;
    const Sprites* resource = get_sprite_by_id(bn::string<64>(definition->sprite_id));
    auto item = resource ? get_sprite_item_from_name(bn::string<64>(resource->graphics_name)) : bn::optional<bn::sprite_item>();
    if(!resource || !item.has_value() || actor_count >= GBA_STUDIO_MAX_ACTORS) return false;
    // x/y are the canvas anchor used by the editor. Butano sprites are
    // positioned by their center, so convert the anchor to the frame center
    // while preserving canvas_origin offsets.
    const int screen_x = x - camera_x - 120 + resource->frame_width / 2 - resource->canvas_origin_x;
    const int screen_y = y - camera_y - 80 + resource->frame_height / 2 - resource->canvas_origin_y;
    auto sprite = create_sprite(*resource, item.value(), screen_x, screen_y, definition->direction);
    if(!sprite.has_value()) return false;
    const int root_slot = created_sprite_root;
    if(ActorManager::instance().spawn(bn::string<64>(actor_id), x, y).slot < 0)
    {
        remove_sprite(sprite.value());
        return false;
    }
    actor_physics[actor_count].reset();
#if GBA_STUDIO_FEATURE_SPRITE_EFFECTS
    sprite_effect_states[actor_count] = SpriteEffectState();
#endif
    actor_physics_state[actor_count] = {};
    actor_physics_enabled[actor_count] = false;
    actor_direction_override[actor_count] = -1;
    actor_ids[actor_count] = actor_id;
    actor_definitions[actor_count] = definition;
    actor_initialization[actor_count] = 0;
    actor_slots[actor_count] = root_slot;
    actor_world_x[actor_count] = x;
    actor_world_y[actor_count] = y;
    ++actor_count;
    residence->active = true;
    for(int part = 0; part < sprite_group_parts(root_slot); ++part) sprites[root_slot + part]->set_visible(residence->visible);
    ActorManager::instance().set_visible_by_id(bn::string<64>(actor_id), residence->visible);
    const int animation_speed = bn::clamp(definition->animation_speed, 0, 7);
    for(int part = 0; part < sprite_group_parts(root_slot) && root_slot + part < sprite_count; ++part)
    {
        sprite_animation_speeds[root_slot + part] = animation_speed;
        sprite_animation_modes[root_slot + part] = animation_speed == 0 ? 2 : 0;
        sprite_animation_reverse[root_slot + part] = false;
    }
    ActorManager::instance().set_animation_speed_by_id(bn::string<64>(actor_id), animation_speed);
    return true;
#else
    (void) actor_id; (void) x; (void) y; (void) from_prefab;
    return false;
#endif
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
        state = actor_physics_state[i]; state.x = actor_world_x[i]; state.y = actor_world_y[i];
        state.direction = read_numeric_actor_property(actor_id, 2);
        return sprite_resources[actor_slots[i]];
    }
    if(const auto* residence = actor_residence(actor_id)) {
        if(!residence->enabled) return nullptr;
        state = {}; state.x = residence->x; state.y = residence->y;
        const bn::string<16> direction(residence->definition->direction ? residence->definition->direction : "right");
        state.direction = direction == "up" ? 0 : direction == "right" ? 1 : direction == "down" ? 2 : 3;
        return get_sprite_by_id(bn::string<64>(residence->definition->sprite_id));
    }
    return nullptr;
}

bool GraphicsManager::script_actor_blocked(const char* actor_id, const Sprites& body, int x, int y) const
{
    return script_actor_minimum_distance(actor_id, body, x, y) > 0;
}

int GraphicsManager::script_actor_minimum_distance(const char* actor_id, const Sprites& body, int x, int y) const
{
    const auto intersects = [&](int slot, int other_x, int other_y) {
        if(slot < 0 || slot >= sprite_count || !sprites[slot] || !sprites[slot]->visible() || !sprite_resources[slot]) return 0;
        const auto& other = *sprite_resources[slot];
        SceneCollision area{other_x + other.collision_x, other_y + other.collision_y,
                            std::max(1, other.collision_width), std::max(1, other.collision_height), "solid"};
        if(!actor_motion::overlaps(body, x, y, area)) return 0;
        const int left = x + body.collision_x, top = y + body.collision_y;
        return std::min(std::min(left + std::max(1, body.collision_width) - area.x, area.x + area.width - left),
                        std::min(top + std::max(1, body.collision_height) - area.y, area.y + area.height - top));
    };
    int distance = !actor_motion::same_text(actor_id, "__PLAYER__") ? intersects(player_slot, player_world_x, player_world_y) : 0;
    for(int index = 0; index < actor_count; ++index)
        if(!actor_motion::same_text(actor_id, actor_ids[index].data())) distance = std::max(distance, intersects(actor_slots[index], actor_world_x[index], actor_world_y[index]));
    return distance;
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
            actor_physics_state[i] = state;
            actor_direction_override[i] = state.direction;
#if GBA_STUDIO_FEATURE_ACTORS
            ActorManager::instance().set_position_by_id(actor_ids[i], state.x, state.y);
#endif
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
            if(!clip.animation_type || bn::string<16>(clip.animation_type) != requested || !animation_frames_fit_composite(clip, sprite_tiles_items[slot]->graphics_count(), sprite_group_parts(slot))) continue;
            if(!selected) selected = &clip;
            if(clip.animation_id && bn::string<32>(clip.animation_id) == directional) { selected = &clip; break; }
        }
        if(selected) {
            for(int part = 0; part < sprite_group_parts(slot) && slot + part < sprite_count; ++part) {
                const int part_slot = slot + part;
                if(sprite_animations[part_slot] != selected) {
                    sprite_animations[part_slot] = selected; sprite_animation_frames[part_slot] = sprite_animation_updates[part_slot] = 0; sprite_animation_modes[part_slot] = 0; sprite_animation_reverse[part_slot] = false;
                    sprites[part_slot]->set_tiles(*sprite_tiles_items[part_slot], selected->frames[0] + part);
                }
                sprites[part_slot]->set_horizontal_flip(state.direction == 3 && selected->flip_right_to_create_left_frames);
            }
        }
    }
    for(int part = 0; part < sprite_group_parts(slot) && slot + part < sprite_count; ++part) {
        sprite_script_motion[slot + part] = true;
        sprite_script_climb_direction[slot + part] = state.climbing && state.y != old_y ? (state.y > old_y ? 1 : -1) : 0;
    }
    set_sprite_group_position(slot, state.x, state.y);
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
            for(int part = 0; part < sprite_group_parts(slot) && slot + part < sprite_count; ++part) {
                const int part_slot = slot + part;
                for(int i = 0; resource.animations && i < resource.animations_count; ++i) {
                    const auto& clip = resource.animations[i];
                    if(sprite_main_states[slot] && !actor_motion::same_text(clip.state_id, sprite_main_states[slot])) continue;
                    if(clip.animation_type && bn::string<16>(clip.animation_type) == "idle" &&
                       animation_frames_fit_composite(clip, sprite_tiles_items[part_slot]->graphics_count(), sprite_group_parts(slot))) {
                        sprite_animations[part_slot] = &clip; sprite_animation_frames[part_slot] = sprite_animation_updates[part_slot] = 0; sprite_animation_modes[part_slot] = 0; sprite_animation_reverse[part_slot] = false;
                        sprites[part_slot]->set_tiles(*sprite_tiles_items[part_slot], clip.frames[0] + part);
                        break;
                    }
                }
            }
        }
        for(int part = 0; part < sprite_group_parts(slot) && slot + part < sprite_count; ++part) {
            const int part_slot = slot + part;
            sprite_script_climb_direction[part_slot] = 0;
            sprite_script_motion[part_slot] = slot != player_slot && sprite_animations[part_slot] && sprite_animations[part_slot]->animation_type && bn::string<16>(sprite_animations[part_slot]->animation_type) == "climb";
        }
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
        player_grounded = false;
        player_ignored_platform_index = -1;
        player_drop_through_active = false;
        set_sprite_group_position(player_slot, x, y);
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
            set_sprite_group_position(actor_slots[i], target_x, target_y);
            actor_world_x[i] = target_x;
            actor_world_y[i] = target_y;
#if GBA_STUDIO_FEATURE_ACTORS
            ActorManager::instance().set_position_by_id(actor_ids[i], target_x, target_y);
#endif
            return true;
        }
    }
    if(auto* residence = actor_residence(actor_id)) {
        if(!residence->enabled) return false;
        const Sprites* resource = get_sprite_by_id(bn::string<64>(residence->definition->sprite_id));
        if(!resource || !currentScene || !actor_motion::clamp_destination(*currentScene, *resource, x, y)) return false;
        residence->x = x; residence->y = y;
        return true;
    }
    return false;
}

bool GraphicsManager::remove_prefab_actors(const char* prefab_id)
{
    if(!currentScene || !prefab_id || !prefab_id[0]) return false;
    bool found = false;
    for(int i = 0; i < currentScene->actors_count; ++i) {
        const SceneActor& actor = currentScene->actors[i];
        if(actor.spawn_prefab_id && actor_motion::same_text(actor.spawn_prefab_id, prefab_id)) {
            remove_actor(actor.id);
            found = true;
        }
    }
    return found;
}

bool GraphicsManager::remove_actor(const char* actor_id, bool offscreen)
{
    if(!actor_id) return false;
    auto* residence = actor_residence(actor_id);
    if(residence && !offscreen) residence->enabled = false;
#if GBA_STUDIO_FEATURE_VARIABLES
    if(!offscreen && currentScene) VariableManager::instance().release_local_owner(local_owner_key(currentScene->id, actor_id));
#endif
    for(int i = 0; i < actor_count; ++i)
    {
        if(bn::string<64>(actor_ids[i]) == actor_id)
        {
            if(actor_interaction_actor_id && actor_ids[i] == actor_interaction_actor_id) {
                actor_interaction_script = nullptr; actor_interaction_count = 0; actor_interaction_actor_id = nullptr;
            }
            const int root = actor_slots[i];
            if(residence) { residence->x = actor_world_x[i]; residence->y = actor_world_y[i]; residence->active = false; }
#if GBA_STUDIO_FEATURE_MOTION
            ActorMotionManager::instance().stop_actor(actor_id);
#endif
#if GBA_STUDIO_FEATURE_SCRIPTS
            if(currentScene) ScriptCommand::instance().cancel_actor(currentScene->id, actor_id);
#endif
#if GBA_STUDIO_FEATURE_ACTORS
            ActorManager::instance().remove_by_id(bn::string<64>(actor_id));
#endif
            for(auto& emote : emote_animations) if(emote.occupied && emote.actor_id == actor_id) {
                if(emote.sprite) remove_sprite(*emote.sprite);
                emote = EmoteAnimationState();
            }
#if GBA_STUDIO_FEATURE_SPRITE_EFFECTS
            for(auto& state : actor_visual_states) if(state.occupied && state.root == root) state = ActorVisualState();
#endif
            const int parts = sprite_group_parts(root);
            for(int part = 0; root >= 0 && part < parts && root + part < sprite_count; ++part) {
                const int slot = root + part;
                sprites[slot].reset(); sprite_tiles_items[slot].reset();
                sprite_resources[slot] = nullptr; sprite_animations[slot] = nullptr;
                sprite_main_states[slot] = nullptr; sprite_script_motion[slot] = false;
            }
            for(int j = i; j + 1 < actor_count; ++j) {
                actor_ids[j] = actor_ids[j + 1];
                actor_definitions[j] = actor_definitions[j + 1];
                actor_initialization[j] = actor_initialization[j + 1];
                actor_slots[j] = actor_slots[j + 1];
                actor_world_x[j] = actor_world_x[j + 1];
                actor_world_y[j] = actor_world_y[j + 1];
                actor_direction_override[j] = actor_direction_override[j + 1];
                actor_physics[j] = actor_physics[j + 1];
                actor_physics_state[j] = actor_physics_state[j + 1];
                actor_physics_enabled[j] = actor_physics_enabled[j + 1];
#if GBA_STUDIO_FEATURE_SPRITE_EFFECTS
                sprite_effect_states[j] = sprite_effect_states[j + 1];
#endif
            }
            --actor_count;
#if GBA_STUDIO_FEATURE_SPRITE_EFFECTS
            sprite_effect_states[actor_count] = SpriteEffectState();
#endif
            return true;
        }
    }
    return residence != nullptr;
}

bool GraphicsManager::set_actor_visible(const char* actor_id, bool visible)
{
    if(!actor_id) return false;
    auto* residence = actor_residence(actor_id);
    if(residence) residence->visible = visible;
    if(bn::string<64>(actor_id) == "__PLAYER__")
    {
        if(player_slot < 0 || player_slot >= sprite_count || !sprites[player_slot].has_value()) return false;
        for(int part = 0; part < sprite_group_parts(player_slot) && player_slot + part < sprite_count; ++part) sprites[player_slot + part]->set_visible(visible);
        return true;
    }
    for(int i = 0; i < actor_count; ++i)
        if(bn::string<64>(actor_ids[i]) == actor_id && actor_slots[i] >= 0 && actor_slots[i] < sprite_count && sprites[actor_slots[i]].has_value())
        { const int root = actor_slots[i]; for(int part = 0; part < sprite_group_parts(root) && root + part < sprite_count; ++part) sprites[root + part]->set_visible(visible); return true; }
    return residence && residence->enabled;
}

bool GraphicsManager::set_all_actors_visible(bool visible)
{
    for(auto& residence : actor_residences) residence.visible = visible;
    if(player_slot >= 0 && player_slot < sprite_count && sprites[player_slot].has_value())
        for(int part = 0; part < sprite_group_parts(player_slot) && player_slot + part < sprite_count; ++part) sprites[player_slot + part]->set_visible(visible);
    for(int index = 0; index < actor_count; ++index)
        if(actor_slots[index] >= 0 && actor_slots[index] < sprite_count && sprites[actor_slots[index]].has_value())
            for(int part = 0; part < sprite_group_parts(actor_slots[index]) && actor_slots[index] + part < sprite_count; ++part) sprites[actor_slots[index] + part]->set_visible(visible);
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
        if(!actor_motion::same_text(clip.state_id, state_id) || !animation_frames_fit_composite(clip, sprite_tiles_items[slot]->graphics_count(), sprite_group_parts(slot))) continue;
        const int score = clip.animation_id && bn::string<32>(clip.animation_id) == desired_id ? 4
            : current && actor_motion::same_text(clip.animation_id, current->animation_id) ? 3
            : current && actor_motion::same_text(clip.animation_type, current->animation_type) ? 2
            : actor_motion::same_text(clip.animation_type, "idle") ? 1 : 0;
        if(score > best) { selected = &clip; best = score; }
    }
    if(!selected) { BN_LOG("Set Actor State: state or valid frames not found"); return false; }
    sprite_main_states[slot] = selected->state_id;
    const bn::string<32> selected_id(selected->animation_id ? selected->animation_id : "");
    for(int part = 0; part < sprite_group_parts(slot) && slot + part < sprite_count; ++part) {
        const int part_slot = slot + part;
        sprite_animations[part_slot] = selected;
        sprite_animation_frames[part_slot] = sprite_animation_updates[part_slot] = 0;
        sprite_animation_modes[part_slot] = 0;
        sprite_animation_reverse[part_slot] = false;
        sprites[part_slot]->set_tiles(*sprite_tiles_items[part_slot], selected->frames[0] + part);
        sprites[part_slot]->set_horizontal_flip(facing_left && selected->flip_right_to_create_left_frames &&
            (selected_id == "idle-right" || selected_id == "moving-right" || selected_id == "idle" || selected_id == "moving" || selected_id == "running"));
    }
    return true;
}

bool GraphicsManager::set_actor_animation_speed(const char* actor_id, int speed)
{
    if(!actor_id || speed < 0 || speed > 60) return false;
    if(bn::string<64>(actor_id) == "__PLAYER__")
    {
        if(player_slot < 0 || player_slot >= sprite_count) return false;
        for(int part = 0; part < sprite_group_parts(player_slot) && player_slot + part < sprite_count; ++part) sprite_animation_speeds[player_slot + part] = speed;
        return true;
    }
    for(int i = 0; i < actor_count; ++i)
        if(bn::string<64>(actor_ids[i]) == actor_id && actor_slots[i] >= 0 && actor_slots[i] < sprite_count)
        { const int root = actor_slots[i]; for(int part = 0; part < sprite_group_parts(root) && root + part < sprite_count; ++part) sprite_animation_speeds[root + part] = speed; return true; }
    return false;
}

bool GraphicsManager::control_actor_animation(const ActorAnimationControlEventData& data)
{
    if(!data.actor_id || !data.action) return false;
    int slot = actor_motion::same_text(data.actor_id, "__PLAYER__") ? player_slot : -1;
    for(int index = 0; slot < 0 && index < actor_count; ++index)
        if(actor_ids[index] == data.actor_id) slot = actor_slots[index];
    if(slot < 0 || slot >= sprite_count || !sprites[slot] || !sprite_resources[slot] || !sprite_tiles_items[slot]) return false;
    const int parts = sprite_group_parts(slot);
    if(actor_motion::same_text(data.action, "speed")) return set_actor_animation_speed(data.actor_id, data.speed);
    if(actor_motion::same_text(data.action, "stop")) {
        if(!sprite_animations[slot]) return false;
        for(int part = 0; part < parts && slot + part < sprite_count; ++part) sprite_animation_modes[slot + part] = 2;
        return true;
    }
    if(!data.state_id || !*data.state_id || !data.animation_id || !*data.animation_id) return false;
    const Sprites& resource = *sprite_resources[slot];
    const SpriteAnimationDefinition* selected = nullptr;
    for(int index = 0; resource.animations && index < resource.animations_count; ++index) {
        const auto& candidate = resource.animations[index];
        if(actor_motion::same_text(candidate.state_id, data.state_id) && actor_motion::same_text(candidate.animation_id, data.animation_id) &&
           animation_frames_fit_composite(candidate, sprite_tiles_items[slot]->graphics_count(), parts)) {
            selected = &candidate;
            break;
        }
    }
    if(!selected || selected->frames_count <= 0) return false;
    int frame = data.reverse && (actor_motion::same_text(data.action, "loop") || actor_motion::same_text(data.action, "once")) ? selected->frames_count - 1 : 0;
    int mode = 0;
    if(actor_motion::same_text(data.action, "once")) mode = 1;
    else if(actor_motion::same_text(data.action, "frame")) {
        if(data.frame < 0 || data.frame >= selected->frames_count) return false;
        frame = data.frame;
        mode = 2;
    } else if(!actor_motion::same_text(data.action, "loop")) return false;
    sprite_main_states[slot] = selected->state_id;
    const bool facing_left = slot == player_slot ? player_direction == "left" : sprites[slot]->horizontal_flip();
    const bn::string<32> selected_id(selected->animation_id ? selected->animation_id : "");
    for(int part = 0; part < parts && slot + part < sprite_count; ++part) {
        const int part_slot = slot + part;
        sprite_animations[part_slot] = selected;
        sprite_animation_frames[part_slot] = frame;
        sprite_animation_updates[part_slot] = 0;
        sprite_animation_modes[part_slot] = mode;
        sprite_animation_reverse[part_slot] = (actor_motion::same_text(data.action, "loop") || actor_motion::same_text(data.action, "once")) && data.reverse;
        if((actor_motion::same_text(data.action, "loop") || actor_motion::same_text(data.action, "once")) && data.speed >= 0 && data.speed <= 60)
            sprite_animation_speeds[part_slot] = data.speed;
        const int tile = selected->frames[frame] + part;
        if(tile < 0 || tile >= sprite_tiles_items[part_slot]->graphics_count()) return false;
        sprites[part_slot]->set_tiles(*sprite_tiles_items[part_slot], tile);
        sprites[part_slot]->set_horizontal_flip(facing_left && selected->flip_right_to_create_left_frames &&
            (selected_id == "idle-right" || selected_id == "moving-right" || selected_id == "idle" || selected_id == "moving" || selected_id == "running"));
    }
    return true;
}

void GraphicsManager::update_actor_scripts(bool allow_scene_actors)
{
    (void) allow_scene_actors;
#if GBA_STUDIO_FEATURE_SCRIPTS
    if(!currentScene || !currentScene->actors) return;
    const unsigned revision = get_scene_revision();
    for(int index = 0; index < actor_count; ++index)
    {
        if(actor_initialization[index] != 2 || !actor_definitions[index]) continue;
        const SceneActor& actor = *actor_definitions[index];
        if(!actor.on_update || actor.on_update_count <= 0) continue;
        if(!actor.keep_running_while_offscreen && !actor_on_screen(actor, actor_world_x[index], actor_world_y[index], index)) continue;
        if(!allow_scene_actors && !actor.spawn_prefab_id) continue;
        const bool complete = ScriptCommand::instance().execute(currentScene->id, actor.on_update, actor.on_update_count, actor.id);
        if(get_scene_revision() != revision) return;
        if(complete) ScriptCommand::instance().restart(currentScene->id, actor.on_update, actor.id);
    }
#endif
}

bool GraphicsManager::set_actor_priority(const char* actor_id, int priority)
{
    if(!actor_id || priority < 0 || priority > 3) return false;
    if(bn::string<64>(actor_id) == "__PLAYER__")
    {
        if(player_slot < 0 || player_slot >= sprite_count || !sprites[player_slot].has_value()) return false;
        for(int part = 0; part < sprite_group_parts(player_slot) && player_slot + part < sprite_count; ++part) {
            sprites[player_slot + part]->set_bg_priority(priority);
            sprites[player_slot + part]->set_z_order(priority - 2);
        }
        return true;
    }
    for(int i = 0; i < actor_count; ++i)
        if(bn::string<64>(actor_ids[i]) == actor_id && actor_slots[i] >= 0 && actor_slots[i] < sprite_count && sprites[actor_slots[i]].has_value())
        { const int root = actor_slots[i]; for(int part = 0; part < sprite_group_parts(root) && root + part < sprite_count; ++part) {
            sprites[root + part]->set_bg_priority(priority);
            sprites[root + part]->set_z_order(priority - 2);
        } return true; }
    return false;
}

#if GBA_STUDIO_FEATURE_SPRITE_EFFECTS
void GraphicsManager::set_global_sprite_blending()
{
    actor_opacity_control = false;
    for(auto& state : actor_visual_states) state.opacity = 100;
    for(int slot = 0; slot < sprite_count; ++slot) if(sprites[slot].has_value()) sprites[slot]->set_blending_enabled(true);
}

bool GraphicsManager::set_actor_visual_effect(const char* actor_id, int operation, int value, int color)
{
    if(!actor_id) return false;
    int root = actor_motion::same_text(actor_id, "__PLAYER__") ? player_slot : -1;
    for(int index = 0; root < 0 && index < actor_count; ++index)
        if(actor_ids[index] == actor_id) root = actor_slots[index];
    if(root < 0 || root >= sprite_count || !sprites[root].has_value()) return false;
    if(operation == 0) return set_actor_transform(actor_id, 2, value, 1, color);
    ActorVisualState* state = nullptr;
    for(auto& candidate : actor_visual_states) if(candidate.occupied && candidate.root == root) { state = &candidate; break; }
    if(!state) for(auto& candidate : actor_visual_states) if(!candidate.occupied) { state = &candidate; state->root = root; state->opacity = 100; state->occupied = true; break; }
    if(!state) return false;
    if(operation == 3) {
        state->opacity = bn::clamp(value, 0, 100);
        actor_opacity_control = true;
        for(int slot = 0; slot < sprite_count; ++slot) if(sprites[slot].has_value()) sprites[slot]->set_blending_enabled(false);
        bool translucent = false;
        for(const auto& actor : actor_visual_states) if(actor.occupied && actor.root >= 0 && actor.opacity < 100) {
            for(int part = 0; part < sprite_group_parts(actor.root) && actor.root + part < sprite_count; ++part)
                if(sprites[actor.root + part].has_value()) sprites[actor.root + part]->set_blending_enabled(true);
            translucent = true;
        }
        if(state->opacity < 100 || !translucent) actor_opacity_percent = state->opacity;
        if(bn::blending::fade_alpha() == 0) bn::blending::set_transparency_alpha(bn::fixed(actor_opacity_percent) / 100);
        return true;
    }
    auto palette = sprites[root]->palette();
    if(operation == 1) { palette.set_grayscale_intensity(bn::fixed(100 - bn::clamp(value, 0, 100)) / 100); return true; }
    if(operation != 2 || !sprite_resources[root]) return false;
    auto item = get_sprite_item_from_name(bn::string<64>(sprite_resources[root]->graphics_name));
    if(!item.has_value()) return false;
    // Use the immutable source colors so repeated brightness changes never
    // accumulate. This reuses the palette already owned by the sprite.
    bn::array<bn::color, 256> colors;
    const auto source = item->palette_item().decompress(bn::span<bn::color>(colors.data(), colors.size()));
    const auto original = source.colors_ref();
    for(int index = 0; index < original.size(); ++index) colors[index] = actor_visual::color(original[index], 100, bn::clamp(value, -100, 100), 0, 0);
    palette.set_colors(bn::span<const bn::color>(colors.data(), original.size()));
    return true;
}

bool GraphicsManager::set_actor_transform(const char* actor_id, int operation, int value, int duration_frames, int color)
{
    if(!actor_id || operation < 0 || operation > 2 || duration_frames < 1 || duration_frames > 600) return false;
    int index = actor_motion::same_text(actor_id, "__PLAYER__") ? GBA_STUDIO_MAX_ACTORS : -1;
    int slot = index >= 0 ? player_slot : -1;
    for(int i = 0; index < 0 && i < actor_count; ++i) if(actor_ids[i] == actor_id) { index = i; slot = actor_slots[i]; }
    if(index < 0 || slot < 0 || slot >= sprite_count || !sprites[slot]) return false;
    const int target = operation == 0 ? bn::clamp(value, -180, 180)
        : operation == 1 ? bn::clamp(value, 10, 400) : bn::clamp(value, 0, 100);
    auto& tween = sprite_effect_states[index].channels[operation];
    tween.frame = 0; tween.duration = duration_frames; tween.target = target; tween.color = color;
    tween.start = operation == 0 ? int(sprites[slot]->rotation_angle())
        : operation == 1 ? int(sprites[slot]->horizontal_scale() * 100)
        : int(sprites[slot]->palette().fade_intensity() * 100);
    if(operation == 0 && tween.start > 180) tween.start -= 360;
    tween.active = duration_frames > 1;
    if(!tween.active) apply_sprite_effect(*sprites[slot], operation, target, color);
    return true;
}

// Compatibility for saved EVENT_SPRITE_EFFECT commands. New programs use
// independent transform/color events and the existing visibility events.
bool GraphicsManager::set_actor_effect(const char* actor_id, int rotation, int scale_percent, bool visible, const char* fade_color, int fade_intensity, int duration_frames)
{
    const bool fade_enabled = fade_color && (fade_color[0] == 'b' || fade_color[0] == 'w');
    return set_actor_transform(actor_id, 0, rotation, duration_frames) &&
        set_actor_transform(actor_id, 1, scale_percent, duration_frames) &&
        set_actor_transform(actor_id, 2, fade_enabled ? fade_intensity : 0, duration_frames,
            fade_enabled && fade_color[0] == 'b' ? 0 : 0xffffff) && set_actor_visible(actor_id, visible);
}

void GraphicsManager::update_sprite_effects()
{
    if(actor_opacity_control && bn::blending::fade_alpha() == 0)
        bn::blending::set_transparency_alpha(bn::fixed(actor_opacity_percent) / 100);
    for(int index = 0; index <= GBA_STUDIO_MAX_ACTORS; ++index)
    {
        const int slot = index == GBA_STUDIO_MAX_ACTORS ? player_slot : index < actor_count ? actor_slots[index] : -1;
        if(slot < 0 || slot >= sprite_count || !sprites[slot]) continue;
        for(int operation = 0; operation < 3; ++operation) {
            auto& tween = sprite_effect_states[index].channels[operation];
            if(!tween.active) continue;
            const int frame = bn::min(++tween.frame, tween.duration);
            const int value = tween.start + (tween.target - tween.start) * frame / tween.duration;
            apply_sprite_effect(*sprites[slot], operation, value, tween.color);
            if(frame >= tween.duration) tween.active = false;
        }
    }
}

#endif
ScriptTrigger GraphicsManager::get_script_trigger(int index, const ScriptTrigger& source) const
{
    ScriptTrigger modified;
    return resolve_script_trigger(index, source, modified);
}

const ScriptTrigger& GraphicsManager::resolve_script_trigger(int index, const ScriptTrigger& source, ScriptTrigger& modified) const
{
    // Most triggers use authored ROM data. Copy only when an event overrides
    // their geometry/enabled state; callers own the scratch object's lifetime.
    if(index < 0 || index >= 64 || !trigger_values[index].active) return source;
    modified = source;
    const auto& values = trigger_values[index].values;
    modified.x = values[0]; modified.y = values[1]; modified.width = values[2]; modified.height = values[3]; modified.enabled = values[4] != 0;
    return modified;
}

int GraphicsManager::read_numeric_trigger_property(const char* id, int property) const
{
    if(!id || !currentScene || property < 0 || property > 4) return 0;
    for(int index = 0; index < currentScene->triggers_count; ++index) {
        const auto trigger = get_script_trigger(index, currentScene->triggers[index]);
        if(trigger.id && actor_motion::same_text(trigger.id, id)) {
            if(property == 0) return trigger.x;
            if(property == 1) return trigger.y;
            if(property == 2) return trigger.width;
            if(property == 3) return trigger.height;
            return trigger.enabled;
        }
    }
    return 0;
}

bool GraphicsManager::write_numeric_trigger_property(const char* id, int property, int value)
{
    if(!id || !currentScene || property < 0 || property > 4
        || (property < 2 && (value < -16384 || value > 16384))
        || ((property == 2 || property == 3) && (value <= 0 || value > 16384))) return false;
    for(int index = 0; index < currentScene->triggers_count && index < 64; ++index) {
        const auto trigger = get_script_trigger(index, currentScene->triggers[index]);
        if(trigger.id && actor_motion::same_text(trigger.id, id)) {
            auto& values = trigger_values[index];
            if(!values.active) {
                values.values[0] = trigger.x; values.values[1] = trigger.y; values.values[2] = trigger.width;
                values.values[3] = trigger.height; values.values[4] = trigger.enabled;
                values.active = true;
            }
            values.values[property] = value;
            return true;
        }
    }
    return false;
}

bool GraphicsManager::write_numeric_actor_property(const char* id, int property, int value)
{
    if(!id || property < 0 || property > 8) return false;
    if(property == 7 || property == 8) property -= 7;
    if(property == 5 || property == 6) {
        if(value < -1024 || value > 1024) return false;
        return move_actor(id, property == 5 ? value * 16 : read_numeric_actor_property(id, 0),
                          property == 6 ? value * 16 : read_numeric_actor_property(id, 1));
    }
    if(property == 0 || property == 1) return move_actor(id, property == 0 ? value : read_numeric_actor_property(id, 0), property == 1 ? value : read_numeric_actor_property(id, 1));
    if(property == 4) return value >= 0 && value <= 8 && set_actor_animation_speed(id, value);
    if(property == 2) {
        if(value < 0 || value > 3) return false;
        actor_motion::State state;
        if(!read_script_actor_state(id, state)) return false;
        state.direction = value;
        if(!apply_script_actor_state(id, state, actor_motion::Action::idle)) return false;
        return true;
    }
    int slot = actor_motion::same_text(id, "__PLAYER__") ? player_slot : -1;
    for(int index = 0; slot < 0 && index < actor_count; ++index) if(actor_ids[index] == id) slot = actor_slots[index];
    if(slot < 0 || slot >= sprite_count || !sprite_animations[slot]) return false;
    const auto* animation = sprite_animations[slot];
    return control_actor_animation({ id, "frame", animation->state_id, animation->animation_id, read_numeric_actor_property(id, 4), value, false });
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
            if(actor_direction_override[index] >= 0) direction = actor_direction_override[index] == 0 ? "up" : actor_direction_override[index] == 1 ? "right" : actor_direction_override[index] == 2 ? "down" : "left";
            break;
        }
    }
    if(slot < 0) if(const auto* residence = actor_residence(actor_id)) {
        if(residence->enabled) {
            if(property == 0 || property == 7) return residence->x;
            if(property == 1 || property == 8) return residence->y;
            if(property == 5) return residence->x / 16;
            if(property == 6) return residence->y / 16;
            if(property == 2) {
                const bn::string<16> facing(residence->definition->direction ? residence->definition->direction : "right");
                return facing == "up" ? 0 : facing == "right" ? 1 : facing == "down" ? 2 : 3;
            }
        }
    }
    // Scene markers without a sprite still have useful world coordinates.
    // They are not spawned into actor_ids, so resolve their authored values
    // directly from the scene definition for coordinate and direction reads.
    if(slot < 0 && currentScene && currentScene->actors && property >= 0 && property <= 8) {
        for(int index = 0; index < currentScene->actors_count; ++index) {
            const SceneActor& actor = currentScene->actors[index];
            if(actor.id && actor_motion::same_text(actor.id, actor_id) && (!actor.sprite_id || !actor.sprite_id[0])) {
                if(property == 0 || property == 7) return actor.x;
                if(property == 1 || property == 8) return actor.y;
                if(property == 5) return actor.x / 16;
                if(property == 6) return actor.y / 16;
                if(property == 2) {
                    const bn::string<16> facing(actor.direction ? actor.direction : "right");
                    return facing == "up" ? 0 : facing == "right" ? 1 : facing == "down" ? 2 : 3;
                }
                return 0;
            }
        }
    }
    if(slot < 0 || slot >= sprite_count || !sprites[slot]) { BN_LOG("Numeric actor property: actor not found"); return 0; }
    if(property == 0 || property == 7) return x;
    if(property == 1 || property == 8) return y;
    if(property == 5) return x / 16;
    if(property == 6) return y / 16;
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
        set_sprite_group_position(player_slot, player_world_x, player_world_y);
    }
    for(int actor = 0; actor < actor_count; ++actor)
        if(actor_slots[actor] >= 0 && actor_slots[actor] < sprite_count && sprites[actor_slots[actor]].has_value())
            set_sprite_group_position(actor_slots[actor], actor_world_x[actor], actor_world_y[actor]);
    for(int i = 0; i < current_bgs.size(); ++i)
    {
        bool loaded = current_bgs[i].has_value();
#if GBA_STUDIO_FEATURE_BACKGROUND_TRANSFORM
        loaded = loaded || current_affine_bgs[i].has_value();
#endif
        if(loaded)
        {
            const Backgrounds* background = i < current_bgs_id.size()
                ? get_background_by_id(current_bgs_id[i]) : nullptr;
            const int width = background && background->image_width > 0 ? background->image_width : 240;
            const int height = background && background->image_height > 0 ? background->image_height : 160;
            const int image_x = i < current_bgs_x.size() ? current_bgs_x[i] : 0;
            const int image_y = i < current_bgs_y.size() ? current_bgs_y[i] : 0;
            const int parallax_x = i < current_bgs_parallax_x.size() ? current_bgs_parallax_x[i] : 100;
            const int parallax_y = i < current_bgs_parallax_y.size() ? current_bgs_parallax_y[i] : 100;
            const int position_x = image_x + width / 2 - 120 - (camera_x * parallax_x) / 100;
            const int position_y = image_y + height / 2 - 80 - (camera_y * parallax_y) / 100;
            if(current_bgs[i].has_value()) current_bgs[i]->set_position(position_x, position_y);
#if GBA_STUDIO_FEATURE_BACKGROUND_TRANSFORM
            if(current_affine_bgs[i].has_value()) current_affine_bgs[i]->set_position(position_x, position_y);
#endif
        }
    }
    if(current_bitmap_bgs.has_value() && current_bgs_x.size() > 2 && current_bgs_parallax_x.size() > 2)
        current_bitmap_bgs->set_position(current_bgs_x[2] - (camera_x * current_bgs_parallax_x[2]) / 100 - bitmap_paint_x,
            current_bgs_y[2] - (camera_y * current_bgs_parallax_y[2]) / 100 - bitmap_paint_y);
}

bool GraphicsManager::player_on_ladder(int x, int y) const
{
    if(!currentScene || !currentScene->scene_type || !currentScene->collisions ||
       player_slot < 0 || player_slot >= sprite_count) return false;
    if(!actor_motion::platformer(*currentScene)) return false;
    const Sprites* player = sprite_resources[player_slot];
    if(!player) return false;
    for(int index = 0; index < currentScene->collisions_count; ++index)
    {
        const SceneCollision& area = currentScene->collisions[index];
        if(actor_motion::same_text(area.side, "ladder") &&
           x + player->collision_x < area.x + area.width && x + player->collision_x + bn::max(1, player->collision_width) > area.x &&
           y + player->collision_y < area.y + area.height && y + player->collision_y + bn::max(1, player->collision_height) > area.y) return true;
    }
    return false;
}

bool GraphicsManager::stop_physics(const StopPhysicsEventData& data)
{
    if(!currentScene || !data.actor_id || !*data.actor_id) return false;
    if(actor_motion::same_text(data.actor_id, "__PLAYER__")) {
        if(player_slot < 0 || player_slot >= sprite_count || !sprites[player_slot]) return false;
#if GBA_STUDIO_FEATURE_MOTION
        ActorMotionManager::instance().stop_actor(data.actor_id);
#endif
        player_vertical_velocity_q8 = player_vertical_remainder_q8 = 0;
        player_grounded = player_climbing = player_drop_through_active = false;
        player_ignored_platform_index = -1;
        player_physics.impulse_pending = false;
        return true;
    }
    for(int i = 0; i < actor_count; ++i) if(actor_ids[i] == data.actor_id) {
        if(actor_slots[i] < 0 || actor_slots[i] >= sprite_count || !sprites[actor_slots[i]]) return false;
#if GBA_STUDIO_FEATURE_MOTION
        ActorMotionManager::instance().stop_actor(data.actor_id);
#endif
        auto& state = actor_physics_state[i];
        state.velocity_q8 = state.remainder_q8 = state.speed_remainder_q8 = 0;
        state.grounded = state.climbing = false;
        state.jumped_obstacle = -1;
        actor_physics[i].impulse_pending = false;
        return true;
    }
    return false;
}

bool GraphicsManager::configure_movement(const MovementEventData& data)
{
    if(!currentScene || !data.actor_id || !*data.actor_id) return false;
    if(actor_motion::same_text(data.actor_id, "__PLAYER__")) {
        player_physics.configure(data);
        return true;
    }
    for(int i = 0; i < actor_count; ++i) if(actor_ids[i] == data.actor_id) {
        if(actor_slots[i] < 0 || actor_slots[i] >= sprite_count || !sprites[actor_slots[i]]) return false;
        actor_physics[i].configure(data);
        actor_physics_enabled[i] = !data.reset;
        if(data.reset) actor_physics_state[i] = {};
        return true;
    }
    return false;
}

bool GraphicsManager::set_physics_setting(const PhysicsSettingEventData& data)
{
    if(!currentScene || !data.actor_id || !*data.actor_id) return false;
    if(actor_motion::same_text(data.actor_id, "__PLAYER__")) return player_physics.set(data.setting, data.value);
    if(data.setting != PhysicsSetting::gravity && data.setting != PhysicsSetting::max_fall_speed) return false;
    for(int i = 0; i < actor_count; ++i) if(actor_ids[i] == data.actor_id) {
        if(actor_slots[i] < 0 || actor_slots[i] >= sprite_count || !sprites[actor_slots[i]]) return false;
        if(!actor_physics[i].set(data.setting, data.value)) return false;
        actor_physics_enabled[i] = true;
        return true;
    }
    return false;
}

bool GraphicsManager::apply_vertical_impulse(const VerticalImpulseEventData& data)
{
    if(!currentScene || !data.actor_id || !*data.actor_id) return false;
    const bn::string<64> type = currentScene->scene_type ? currentScene->scene_type : "";
    if(type != "Platformer" && type != "Platform") return false;
#if GBA_STUDIO_FEATURE_MOTION
    // A scripted trajectory owns the actor until Move Actor finishes.
    if(ActorMotionManager::instance().controls_actor(data.actor_id)) return false;
#endif
    if(!actor_motion::same_text(data.actor_id, "__PLAYER__")) {
        for(int i = 0; i < actor_count; ++i) if(actor_ids[i] == data.actor_id) {
            if(actor_slots[i] < 0 || actor_slots[i] >= sprite_count || !sprites[actor_slots[i]]) return false;
            auto& state = actor_physics_state[i];
            actor_physics_enabled[i] = true;
            state.velocity_q8 = actor_physics[i].impulse(state.velocity_q8, data);
            state.remainder_q8 = 0;
            state.grounded = state.climbing = false;
            return true;
        }
        return false;
    }
    if(player_slot < 0 || player_slot >= sprite_count || !sprites[player_slot]) return false;
    player_vertical_velocity_q8 = player_physics.impulse(player_vertical_velocity_q8, data);
    player_vertical_remainder_q8 = 0;
    player_grounded = player_climbing = false;
    return true;
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
    const int PLATFORM_GRAVITY_Q8 = player_physics.config.gravity_q8;
    const int PLATFORM_JUMP_SPEED_Q8 = -player_physics.config.jump_speed_q8;
    const int PLATFORM_MAX_FALL_SPEED_Q8 = player_physics.config.max_fall_speed_q8;

    if(logo) return;
    if(InputManager::instance().held("move_left")) dx = -speed;
    else if(InputManager::instance().held("move_right")) dx = speed;
    if(InputManager::instance().held("move_up")) dy = -speed;
    else if(InputManager::instance().held("move_down")) dy = speed;
    if(!platformer && !player_physics.config.allow_diagonal && dx) dy = 0;
    if(platformer || !dx || !dy) player_diagonal_remainder_q16 = 0;
    if(!dx && !dy && !platformer) {
        set_player_animation(false);
        return;
    }

    const Sprites* player = sprite_resources[player_slot];
    const int half_width = player ? player->frame_width / 2 : 0;
    const int half_height = player ? player->frame_height / 2 : 0;
    const int old_x = player_world_x;
    const int old_y = player_world_y;
    const int collision_width = player ? bn::max(1, player->collision_width) : bn::max(1, half_width * 2);
    const int collision_height = player ? bn::max(1, player->collision_height) : bn::max(1, half_height * 2);
    const int collision_offset_x = player ? player->collision_x : -half_width;
    const int collision_offset_y = player ? player->collision_y : -half_height;
    const int min_x = -collision_offset_x;
    const int min_y = -collision_offset_y;
    const int max_x = currentScene->scene_width - collision_offset_x - collision_width;
    const int max_y = currentScene->scene_height - collision_offset_y - collision_height;
    if(min_x > max_x || min_y > max_y) return;
    const auto overlaps = [&](int x, int y, const SceneCollision& collision) {
        return x + collision_offset_x < collision.x + collision.width &&
               x + collision_offset_x + collision_width > collision.x &&
               y + collision_offset_y < collision.y + collision.height &&
               y + collision_offset_y + collision_height > collision.y;
    };
    const auto blocked = [&](int test_x, int test_y, int test_dx, int test_dy, const SceneCollision& collision) {
        if(!overlaps(test_x, test_y, collision)) return false;
        const char* side = collision.side ? collision.side : "solid";
        if(actor_motion::same_text(side, "solid")) return true;
        // Ladder tops support standing; activated climbing passes through them.
        if(actor_motion::same_text(side, "ladder")) return platformer && !player_climbing && test_dy > 0 &&
            old_y + collision_offset_y + collision_height <= collision.y;
        if(actor_motion::same_text(side, "top")) return test_dy > 0 && old_y + collision_offset_y + collision_height <= collision.y;
        if(actor_motion::same_text(side, "down")) return test_dy < 0 && old_y + collision_offset_y >= collision.y + collision.height;
        if(actor_motion::same_text(side, "left")) return test_dx > 0 && old_x + collision_offset_x + collision_width <= collision.x;
        if(actor_motion::same_text(side, "right")) return test_dx < 0 && old_x + collision_offset_x >= collision.x + collision.width;
        return false;
    };
    // Small, frame-local broad phase. Overflow falls back to the complete
    // scene, so dense areas never lose a collider or change collision order.
    int collision_candidates[32];
    int collision_candidates_count = 0;
    bool use_collision_candidates = false;
    const auto blockingCollisionAt = [&](int test_x, int test_y, int test_dx, int test_dy) {
        const int count = use_collision_candidates ? collision_candidates_count : currentScene->collisions_count;
        for(int candidate = 0; currentScene->collisions && candidate < count; ++candidate) {
            const int index = use_collision_candidates ? collision_candidates[candidate] : candidate;
            if(index != player_ignored_platform_index && blocked(test_x, test_y, test_dx, test_dy, currentScene->collisions[index])) return index;
        }
        return -1;
    };
    const auto blockedAt = [&](int test_x, int test_y, int test_dx, int test_dy) {
        return blockingCollisionAt(test_x, test_y, test_dx, test_dy) >= 0;
    };
    const auto supportCollisionAt = [&](int test_x, int test_y) {
        const int player_bottom = test_y + collision_offset_y + collision_height;
        for(int index = 0; currentScene->collisions && index < currentScene->collisions_count; ++index)
        {
            if(index == player_ignored_platform_index) continue;
            const SceneCollision& collision = currentScene->collisions[index];
            // Reject geometry first; only nearby top faces need a side check.
            if(player_bottom != collision.y || test_x + collision_offset_x >= collision.x + collision.width ||
               test_x + collision_offset_x + collision_width <= collision.x) continue;
            const char* side = collision.side ? collision.side : "solid";
            if(actor_motion::same_text(side, "solid") || actor_motion::same_text(side, "top") ||
               (actor_motion::same_text(side, "ladder") && !player_climbing)) return index;
        }
        return -1;
    };
    const auto landingCollisionAt = [&](int test_x, int test_y) {
        const int previous_bottom = old_y + collision_offset_y + collision_height;
        const int next_bottom = test_y + collision_offset_y + collision_height;
        if(next_bottom <= previous_bottom) return -1;
        for(int index = 0; currentScene->collisions && index < currentScene->collisions_count; ++index)
        {
            if(index == player_ignored_platform_index) continue;
            const SceneCollision& collision = currentScene->collisions[index];
            const char* side = collision.side ? collision.side : "solid";
            const bool supports_player = actor_motion::same_text(side, "solid") || actor_motion::same_text(side, "top") || (actor_motion::same_text(side, "ladder") && !player_climbing);
            if(supports_player && previous_bottom <= collision.y && next_bottom > collision.y &&
               overlaps(test_x, test_y, collision)) return index;
        }
        return -1;
    };

    if(platformer)
    {
        // Ground only on an actual top face; overlap with a solid wall is not support.
        const int support_collision = player_vertical_velocity_q8 >= 0 ? supportCollisionAt(old_x, old_y) : -1;
        player_grounded = !player_physics.impulse_pending && player_vertical_velocity_q8 >= 0 &&
            (old_y >= max_y || support_collision >= 0);
        const bool jump_pressed = InputManager::instance().pressed("jump");
        const int climb_input = dy;
        // Down can reattach from a collision box resting exactly on the top.
        const bool on_ladder = player_on_ladder(old_x, old_y) ||
            (climb_input > 0 && player_on_ladder(old_x, old_y + 1));
        if(!on_ladder) player_climbing = false;
        const bool forced_impulse = player_physics.impulse_pending;
        const bool jumping = player_physics.jump(jump_pressed, player_grounded || player_climbing);
        player_physics.impulse_pending = false;
        if(on_ladder && climb_input && !jumping && !forced_impulse) player_climbing = true;
        const bool dropping_through_platform = !jumping && !on_ladder && player_grounded && support_collision >= 0 &&
            currentScene->collisions[support_collision].side &&
            actor_motion::same_text(currentScene->collisions[support_collision].side, "top") &&
            InputManager::instance().pressed("move_down");
        if(dropping_through_platform)
        {
            player_ignored_platform_index = support_collision;
            player_drop_through_active = true;
            player_grounded = false;
        }
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

    bool fractional_diagonal_frame = false;
    if(!platformer && dx && dy) {
        // 1/sqrt(2) in Q16 keeps the diagonal vector at the configured speed.
        // Retain fractions so a speed of one pixel never rounds to a standstill.
        player_diagonal_remainder_q16 += speed * 46341;
        const int diagonal_step = player_diagonal_remainder_q16 / 65536;
        fractional_diagonal_frame = diagonal_step == 0;
        player_diagonal_remainder_q16 %= 65536;
        dx = dx < 0 ? -diagonal_step : diagonal_step;
        dy = dy < 0 ? -diagonal_step : diagonal_step;
    }

    const int next_x = bn::clamp(old_x + dx, min_x, max_x);
    const int raw_next_y = old_y + dy;
    const int next_y = bn::clamp(raw_next_y, min_y, max_y);

    // A single pixel with a small collision table already has an inexpensive
    // direct path. Filter only repeated sweeps through larger tables.
    const int travel = (next_x < old_x ? old_x - next_x : next_x - old_x) +
                       (next_y < old_y ? old_y - next_y : next_y - old_y);
    if(currentScene->collisions && currentScene->collisions_count > 16 && travel > 1) {
        const int left = bn::min(old_x, next_x) + collision_offset_x;
        const int right = bn::max(old_x, next_x) + collision_offset_x + collision_width;
        const int top = bn::min(old_y, next_y) + collision_offset_y;
        const int bottom = bn::max(old_y, next_y) + collision_offset_y + collision_height;
        use_collision_candidates = true;
        for(int index = 0; index < currentScene->collisions_count; ++index) {
            const auto& area = currentScene->collisions[index];
            if(left >= area.x + area.width || right <= area.x || top >= area.y + area.height || bottom <= area.y) continue;
            if(collision_candidates_count == 32) { use_collision_candidates = false; break; }
            collision_candidates[collision_candidates_count++] = index;
        }
    }

    // Sweep each axis a pixel at a time so configurable speeds/impulses cannot
    // skip thin walls, platforms or ceilings. Event values cap this at 16 steps.
    int resolved_x = old_x;
    int resolved_y = old_y;
    const int step_x = next_x < old_x ? -1 : 1;
    while(resolved_x != next_x)
    {
        if(blockedAt(resolved_x + step_x, old_y, dx, 0)) break;
        resolved_x += step_x;
    }
    const int step_y = next_y < old_y ? -1 : 1;
    while(resolved_y != next_y)
    {
        const int candidate_y = resolved_y + step_y;
        if(blockedAt(resolved_x, candidate_y, 0, dy))
        {
            if(platformer)
            {
                const int landing_collision = dy > 0 ? landingCollisionAt(resolved_x, candidate_y) : -1;
                player_grounded = landing_collision >= 0;
                if(landing_collision >= 0)
                {
                    const SceneCollision& landing = currentScene->collisions[landing_collision];
                    resolved_y = landing.y - collision_offset_y - collision_height;
                }
                player_vertical_velocity_q8 = 0;
                player_vertical_remainder_q8 = 0;
            }
            break;
        }
        resolved_y = candidate_y;
        if(platformer && dy > 0 && resolved_y == max_y) player_grounded = true;
    }
    if(platformer && dy > 0 && next_y == max_y && resolved_y == max_y)
    {
        player_grounded = true;
        player_vertical_velocity_q8 = 0;
        player_vertical_remainder_q8 = 0;
    }
    if(player_ignored_platform_index >= 0 && player_ignored_platform_index < currentScene->collisions_count)
    {
        const SceneCollision& ignored_platform = currentScene->collisions[player_ignored_platform_index];
        const bool still_overlapping_horizontally = resolved_x + collision_offset_x < ignored_platform.x + ignored_platform.width &&
            resolved_x + collision_offset_x + collision_width > ignored_platform.x;
        const int platform_height = bn::max(1, ignored_platform.height);
        if(!still_overlapping_horizontally || resolved_y + collision_offset_y >= ignored_platform.y + platform_height)
            player_ignored_platform_index = -1;
    }
    if(player_climbing && (!platformer || !player_on_ladder(resolved_x, resolved_y))) player_climbing = false;
    // Keep a stationary jump animated throughout ascent, apex and descent.
    // A ceiling collision stops velocity without grounding the player.
    if(platformer && !player_climbing)
    {
        const int support_collision = player_vertical_velocity_q8 >= 0 ? supportCollisionAt(resolved_x, resolved_y) : -1;
        player_grounded = player_vertical_velocity_q8 >= 0 && (resolved_y >= max_y || support_collision >= 0);
        if(player_grounded && player_vertical_velocity_q8 >= 0)
            player_vertical_velocity_q8 = player_vertical_remainder_q8 = 0;
    }
    player_world_x = resolved_x;
    player_world_y = resolved_y;
    const bool freeze_drop_animation = player_drop_through_active && !player_grounded && !dx;
    if(player_grounded)
    {
        player_drop_through_active = false;
        player_ignored_platform_index = -1;
    }
    if(player_grounded || player_climbing) player_physics.air_jumps_used = 0;
    const bool airborne = platformer && !player_grounded && !player_climbing;
    const bool horizontal_input_blocked = dx != 0 && resolved_x == old_x;
    if(!freeze_drop_animation)
        set_player_animation(resolved_x != old_x || resolved_y != old_y || fractional_diagonal_frame,
            player_climbing ? "climb" : airborne && (!dx || horizontal_input_blocked) ? "jump" : nullptr);
    set_sprite_group_position(player_slot, player_world_x, player_world_y);
}

void GraphicsManager::init_bg_slots()
{
#if GBA_STUDIO_FEATURE_BACKGROUND_ANIMATION
    for(auto& animation : background_animations) animation = BackgroundAnimationState{};
#endif
#if GBA_STUDIO_FEATURE_BACKGROUND_TRANSFORM
    for(auto& background : current_affine_bgs) background.reset();
#endif
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


#if GBA_STUDIO_FEATURE_BACKGROUND_TRANSFORM
bool GraphicsManager::affine_layer(int layer_id) const
{
    if(!currentScene) return false;
    for(int index = 0; index < currentScene->backgrounds_layers_size; ++index)
        if(currentScene->backgrounds_layers[index].layerId == layer_id) return currentScene->backgrounds_layers[index].affine;
    return false;
}

bool GraphicsManager::load_affine_background(int layer_id, const bn::string<64>& background_id, bool visible, const char* graphics_name)
{
    const Backgrounds* resource = get_background_by_id(background_id);
    if(!resource) return false;
    if(current_affine_bgs[layer_id].has_value() && current_bgs_id[layer_id] == background_id) {
        current_affine_bgs[layer_id]->set_visible(visible);
        return true;
    }
    auto item = get_affine_bg_item_from_name(bn::string<64>(graphics_name ? graphics_name : resource->name));
    if(!item.has_value()) { BN_LOG("Affine background asset missing: ", resource->name); return false; }
    current_bgs[layer_id].reset();
    if(current_affine_bgs[layer_id].has_value()) current_affine_bgs[layer_id]->set_item(*item);
    else {
        auto created = bn::affine_bg_ptr::create_optional(*item);
        if(!created.has_value()) { BN_LOG("Affine background allocation failed: ", layer_id); return false; }
        current_affine_bgs[layer_id] = *created;
    }
    auto& background = *current_affine_bgs[layer_id];
    background.set_priority(3 - layer_id);
    int z_order = layer_id;
    if(currentScene) for(int index = 0; index < currentScene->backgrounds_layers_size; ++index)
        if(currentScene->backgrounds_layers[index].layerId == layer_id) z_order = currentScene->backgrounds_layers[index].z_order;
    background.set_z_order(bn::clamp(z_order, -32767, 32767));
    background.set_blending_enabled(true);
    background.set_visible(visible);
    background.set_position(current_bgs_x[layer_id] + resource->image_width / 2 - 120 - (camera_x * current_bgs_parallax_x[layer_id]) / 100,
        current_bgs_y[layer_id] + resource->image_height / 2 - 80 - (camera_y * current_bgs_parallax_y[layer_id]) / 100);
    current_bgs_id[layer_id] = background_id;
    return true;
}

bool GraphicsManager::transform_background(int layer_id, int operation, int x, int y)
{
    if(!currentScene || layer_id < 0 || layer_id > 3) return false;
    const bool bitmap = currentScene->scene_type && (bn::string_view(currentScene->scene_type) == "Logo" || bn::string_view(currentScene->scene_type) == "Point Click");
    const auto apply = [&](auto& background) {
        if(operation == 0) background.set_scale(bn::fixed(bn::clamp(x, 10, 800)) / 100, bn::fixed(bn::clamp(y, 10, 800)) / 100);
        else if(operation == 1) background.set_rotation_angle(bn::fixed((x % 360 + 360) % 360));
        else background.set_shear(bn::fixed(bn::clamp(x, -200, 200)) / 100, bn::fixed(bn::clamp(y, -200, 200)) / 100);
    };
    if(bitmap && current_bitmap_bgs.has_value()) { apply(*current_bitmap_bgs); return true; }
    if(!bitmap && current_affine_bgs[layer_id].has_value()) { apply(*current_affine_bgs[layer_id]); return true; }
    BN_LOG("Background transform: layer is not loaded as affine or direct bitmap: ", layer_id);
    return false;
}
#endif

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
#if GBA_STUDIO_FEATURE_BACKGROUND_TRANSFORM
            if(layer.affine)
            {
                current_bgs_x[layer.layerId] = layer.x;
                current_bgs_y[layer.layerId] = layer.y;
                if(!load_affine_background(layer.layerId, bn::string<64>(layer.backgroundId), true, layer.affine_graphics_name)) {
                    BN_ERROR("Unable to load affine background: ", layer.layerId);
                    return;
                }
                continue;
            }
#endif
            // 4.1 Busca o recurso de background pelo ID
            const Backgrounds* bg_resource = get_background_by_id(bn::string<64>(layer.backgroundId));
            if(!bg_resource)
            {
                BN_LOG("Background nÃƒÆ’Ã‚Â£o encontrado com ID: ", layer.backgroundId);
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
                            const uint16_t cell_offset = uint16_t(map_copy->tiles_offset() +
                                (map_copy->palette_banks_offset() << 12));
                            const int copy_count = source_cells->size() < destination_cells->size() ?
                                source_cells->size() : destination_cells->size();
                            for(int cell_index = 0; cell_index < copy_count; ++cell_index)
                            {
                                (*destination_cells)[cell_index] = uint16_t((*source_cells)[cell_index] + cell_offset);
                            }
                            for(int override_index = 0; override_index < layer.map_cell_overrides_count; ++override_index)
                            {
                                const RegularBgMapCellOverride& cell_override = layer.map_cell_overrides[override_index];
                                if(cell_override.cell_index >= 0 && cell_override.cell_index < destination_cells->size())
                                {
                                    (*destination_cells)[cell_override.cell_index] = uint16_t(cell_override.cell + cell_offset);
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
                BN_LOG("Background item nÃƒÆ’Ã‚Â£o encontrado: ", bg_resource->name);
            }
        } 
        else
        {
            // Se nÃƒÆ’Ã‚Â£o hÃƒÆ’Ã‚Â¡ backgroundId, garante que a posiÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o fique vazia
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
    init_bg_slots();
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
                BN_LOG("Background nÃƒÆ’Ã‚Â£o encontrado com ID: ", layer.backgroundId);
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

                bitmap_paint_x = x;
                bitmap_paint_y = y;
                current_bgs_x[2] = layer.x;
                current_bgs_y[2] = layer.y;

                // Guarda no current_bitmap_bg
                current_bitmap_bgs = bmp_bg;
                current_bgs_id[layer.layerId] = layer.backgroundId;

                BN_LOG("Bitmap BG carregado com sucesso: ", bg_resource->name);
                continue;
            }
            else
            {
                BN_LOG("Bitmap BG item nÃƒÆ’Ã‚Â£o encontrado: ", bg_resource->name);
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
                BN_LOG("Background nÃƒÆ’Ã‚Â£o encontrado com ID: ", layer.background_id);
                continue;
            }

            auto bg_item = get_bg_item_from_name(bg_resource->name);
            if(!bg_item.has_value())
            {
                BN_LOG("Background item nÃƒÆ’Ã‚Â£o encontrado: ", bg_resource->name);
                continue;
            }

            BN_LOG("Background item POS: ", i);
            BN_LOG("Background item current_bgs: ", current_bgs.size());

            // Se jÃƒÆ’Ã‚Â¡ existe um regular BG nessa posiÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o
            if(i < current_bgs.size() && current_bgs[i].has_value() && i < current_bgs_id.size() && !current_bgs_id[i].empty())
            {
                if(current_bgs_id[i] == layer.background_id)
                {
                    BN_LOG("..: Regular BG jÃƒÆ’Ã‚Â¡ existe :..");
                    // Mesmo ID ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ sÃƒÆ’Ã‚Â³ atualiza propriedades
                    current_bgs[i]->set_visible(layer.visible);
                    current_bgs[i]->set_priority(3 - bn::clamp(layer.layer_id, 0, 3));
                    current_bgs[i]->set_z_order(bn::clamp(layer.layer_id, -32767, 32767));
                    result.push_back(current_bgs[i].value());

                    BN_LOG("Regular BG atualizado: ", bg_resource->name);
                }
                else
                {
                    // ID diferente ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ substitui imagem
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

                    BN_LOG("Regular BG substituÃƒÆ’Ã‚Â­do: ", bg_resource->name);
                }
            }
            else
            {
                // NÃƒÆ’Ã‚Â£o existe ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ cria novo
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
            // Se nÃƒÆ’Ã‚Â£o hÃƒÆ’Ã‚Â¡ background_id, limpa posiÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o
            if(i < current_bgs.size()) current_bgs[i].reset();
            if(i < current_bgs_id.size())
            {
                current_bgs_id[i] = bn::string<64>();
            }
            BN_LOG("Regular BG ID vazio na posiÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o: ", i);
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
                BN_LOG("Background nÃƒÆ’Ã‚Â£o encontrado com ID: ", layer.background_id);
                continue;
            }

            auto bmp_bg_item = get_bitmap_bg_item_from_name(bg_resource->name);
            if(!bmp_bg_item.has_value())
            {
                BN_LOG("Bitmap BG item nÃƒÆ’Ã‚Â£o encontrado: ", bg_resource->name);
                continue;
            }

            // Se jÃƒÆ’Ã‚Â¡ existe um bitmap carregado
            if(current_bitmap_bgs.has_value())
            {
                BN_LOG("..: Background Bitmap existe :..");

                // Se for o mesmo ID, sÃƒÆ’Ã‚Â³ atualiza visibilidade
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
                    int x = current_bgs_x[2] - (camera_x * current_bgs_parallax_x[2]) / 100;
                    int y = current_bgs_y[2] - (camera_y * current_bgs_parallax_y[2]) / 100;

                    painter.fill(bn::color(0, 0, 0));
                    painter.blit(x, y, bmp_bg_item.value());

                    bitmap_paint_x = x; bitmap_paint_y = y;
                    current_bitmap_bgs->set_position(0, 0);

                    current_bitmap_bgs->set_visible(layer.visible);
                    current_bgs_id[i] = layer.background_id;
                    
                    BN_LOG("Bitmap BG substituÃƒÆ’Ã‚Â­do: ", bg_resource->name);
                    return current_bitmap_bgs;
                }
            }
            else
            {
                // Se nÃƒÆ’Ã‚Â£o existe, cria novo
                BN_LOG("..: Background Bitmap criando novo :..");

                current_bitmap_bgs.reset();
                bn::core::update(); 

                bn::sp_direct_bitmap_bg_ptr bmp_bg = bn::sp_direct_bitmap_bg_ptr::create();
                bmp_bg.set_blending_enabled(true);

                bn::sp_direct_bitmap_bg_painter painter(bmp_bg);
                int x = current_bgs_x[2] - (camera_x * current_bgs_parallax_x[2]) / 100;
                int y = current_bgs_y[2] - (camera_y * current_bgs_parallax_y[2]) / 100;

                painter.fill(bn::color(0, 0, 0));
                painter.blit(x, y, bmp_bg_item.value());

                bitmap_paint_x = x; bitmap_paint_y = y;

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

#if GBA_STUDIO_FEATURE_BACKGROUND_ANIMATION
bool GraphicsManager::paint_background_animation_frame(int layer_id, const BackgroundAnimationEventData& data, int frame)
{
    if(!currentScene || frame < 0 || frame >= data.frame_count || layer_id >= current_bgs_x.size()) return false;
    const bool bitmap = currentScene->scene_type && (bn::string_view(currentScene->scene_type) == "Logo" || bn::string_view(currentScene->scene_type) == "Point Click");
    auto& state = background_animations[layer_id];
    if(bitmap && (!current_bitmap_bgs || !state.bitmap_item)) return false;
    const int source_frame = data.start_frame + frame * data.frame_delta;
    if(source_frame < 0) return false;
    const int offset_x = source_frame * data.step_x, offset_y = source_frame * data.step_y;
    current_bgs_x[layer_id] += state.offset_x - offset_x;
    current_bgs_y[layer_id] += state.offset_y - offset_y;
    state.offset_x = offset_x; state.offset_y = offset_y;
    if(bitmap) {
        // Like startup: blit a different window of the same complete ROM image.
        // No per-frame assets, item replacement, nested core update or RAM sheet.
        bn::sp_direct_bitmap_bg_painter painter(*current_bitmap_bgs);
        const int x = current_bgs_x[2] - (camera_x * current_bgs_parallax_x[2]) / 100;
        const int y = current_bgs_y[2] - (camera_y * current_bgs_parallax_y[2]) / 100;
        background_animation::paint_bitmap(painter, *state.bitmap_item, x, y);
        bitmap_paint_x = x; bitmap_paint_y = y;
        current_bitmap_bgs->set_position(0, 0);
    } else {
        // Regular/affine maps stay loaded; move the map to the selected window.
        set_camera_position(camera_x, camera_y);
    }
    return true;
}

bool GraphicsManager::animate_background(const BackgroundAnimationEventData& data)
{
    if(!currentScene || data.layer_id < 0 || data.layer_id > 3 || data.frame_count < 1 || data.frame_count > 512 || data.duration_frames < 1
        || data.start_frame < 0 || (data.frame_delta != 1 && data.frame_delta != -1) || data.start_frame + (data.frame_count - 1) * data.frame_delta < 0) return false;
    const bool bitmap = currentScene->scene_type && (bn::string_view(currentScene->scene_type) == "Logo" || bn::string_view(currentScene->scene_type) == "Point Click");
    const int layer = bitmap ? 2 : data.layer_id;
    const char* source_id = bitmap ? data.bitmap_background_id : data.regular_background_id;
    if(!source_id || !source_id[0]) return false;
    bool visible = true;
    if(bitmap && current_bitmap_bgs) visible = current_bitmap_bgs->visible();
    else if(layer < current_bgs.size() && current_bgs[layer]) visible = current_bgs[layer]->visible();
#if GBA_STUDIO_FEATURE_BACKGROUND_TRANSFORM
    if(!bitmap && current_affine_bgs[layer]) visible = current_affine_bgs[layer]->visible();
#endif
    change_single_layer(layer, bn::string<64>(source_id), visible, bitmap);
    if(layer >= current_bgs_id.size() || current_bgs_id[layer] != source_id) return false;
    auto& state = background_animations[layer];
    state = BackgroundAnimationState{};
    if(bitmap) {
        const Backgrounds* resource = get_background_by_id(bn::string<64>(source_id));
        if(!resource) return false;
        state.bitmap_item = get_bitmap_bg_item_from_name(resource->name);
        if(!state.bitmap_item) return false;
    }
    state.data = &data; state.ticks = -1;
    state.active = data.frame_count > 1;
    if(!paint_background_animation_frame(layer, data, 0)) { state.active = false; return false; }
    return true;
}

void GraphicsManager::update_background_animations()
{
    for(int layer = 0; layer < 4; ++layer) {
        auto& state = background_animations[layer];
        if(!state.data || !state.active) continue;
        const auto& data = *state.data;
        if(background_animation::advance(data.frame_count, data.duration_frames, data.loop, state.frame, state.ticks, state.active))
            if(!paint_background_animation_frame(layer, data, state.frame)) state.active = false;
    }
}
#endif

void GraphicsManager::change_single_layer(int layer_id, const bn::string<64>& background_id, bool visible, bool defer_bitmap_paint) {
    bool animation_offset_restored = false;
#if GBA_STUDIO_FEATURE_BACKGROUND_ANIMATION
    if(currentScene) {
        const bool bitmap = currentScene->scene_type && (bn::string_view(currentScene->scene_type) == "Logo" || bn::string_view(currentScene->scene_type) == "Point Click");
        const int slot = bitmap ? 2 : bn::clamp(layer_id, 0, 3);
        const auto& previous = background_animations[slot];
        if(previous.data && slot < current_bgs_x.size()) {
            current_bgs_x[slot] += previous.offset_x;
            current_bgs_y[slot] += previous.offset_y;
            animation_offset_restored = true;
        }
        background_animations[slot] = BackgroundAnimationState{};
    }
#endif

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
#if GBA_STUDIO_FEATURE_BACKGROUND_TRANSFORM
        if(affine_layer(safe_layer))
        {
            if(background_id.empty()) { current_affine_bgs[safe_layer].reset(); current_bgs_id[safe_layer] = bn::string<64>(); return; }
            if(!load_affine_background(safe_layer, background_id, visible)) BN_ERROR("Unable to change affine background: ", safe_layer);
            if(animation_offset_restored) set_camera_position(camera_x, camera_y);
            return;
        }
#endif
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
            if(animation_offset_restored) set_camera_position(camera_x, camera_y);
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
    if(background_id.empty()) {
        current_bitmap_bgs.reset(); current_bgs_id[2] = bn::string<64>(); return;
    }
    const Backgrounds* background = get_background_by_id(background_id);
    if(!background) return;
    const auto item = get_bitmap_bg_item_from_name(background->name);
    if(!item) return;
    if(!current_bitmap_bgs) {
        auto created = bn::sp_direct_bitmap_bg_ptr::create_optional();
        if(!created) return;
        current_bitmap_bgs = *created;
        current_bitmap_bgs->set_blending_enabled(true);
    }
    if(!defer_bitmap_paint && (current_bgs_id[2] != background_id || animation_offset_restored)) {
        bn::sp_direct_bitmap_bg_painter painter(*current_bitmap_bgs);
        const int x = current_bgs_x[2] - (camera_x * current_bgs_parallax_x[2]) / 100;
        const int y = current_bgs_y[2] - (camera_y * current_bgs_parallax_y[2]) / 100;
        painter.fill(bn::color(0, 0, 0));
        painter.blit(x, y, *item);
        bitmap_paint_x = x; bitmap_paint_y = y;
        current_bitmap_bgs->set_position(0, 0);
    }
    current_bitmap_bgs->set_visible(visible);
    current_bgs_id[2] = background_id;
}

const BackgroundPalette* GraphicsManager::resolve_slot_palette(int slot) const {
    if(slot < 0 || slot >= 16) return nullptr;
    if(default_palette_overrides[slot]) return default_palette_overrides[slot];
    const char* id = get_default_palette_id(slot);
    return id && id[0] ? get_background_palette_by_id(bn::string<64>(id)) : nullptr;
}

const BackgroundPalette* GraphicsManager::resolve_palette_reference(const char* id, int fallback_slot) const {
    if(!id || !id[0]) return resolve_slot_palette(fallback_slot);
    const bn::string_view reference(id);
    if(reference.size() == 10 && reference.substr(0, 9) == "__slot__:" && id[9] >= '0' && id[9] <= '9') return resolve_slot_palette(id[9] - '0');
    if(reference.size() == 11 && reference.substr(0, 9) == "__slot__:" && id[9] == '1' && id[10] >= '0' && id[10] <= '5') return resolve_slot_palette(10 + id[10] - '0');
    for(int slot = 0; slot < 16; ++slot) {
        const char* original = get_default_palette_id(slot);
        if(original && bn::string_view(original) == id) return resolve_slot_palette(slot);
    }
    BN_ERROR("Palette is not configured in a default slot: ", id);
    return nullptr;
}

void GraphicsManager::change_default_palettes(const char* const* palette_ids) {
    // Validate the whole event before changing any shared slot.
    for(int slot = 0; slot < 16; ++slot) {
        const char* id = palette_ids ? palette_ids[slot] : nullptr;
        if(id && id[0]) BN_ASSERT(get_background_palette_by_id(bn::string<64>(id)), "Unknown default palette: ", id);
    }
    for(int slot = 0; slot < 16; ++slot) {
        const char* id = palette_ids ? palette_ids[slot] : nullptr;
        default_palette_overrides[slot] = id && id[0] ? get_background_palette_by_id(bn::string<64>(id)) : nullptr;
    }
    for(int layer = 0; layer < 4; ++layer) slot_palette_native_ids[layer] = -1;
    update_default_palettes();
    for(int layer = 0; layer < 4; ++layer) if(layer_palette_overrides[layer]) change_palette_layer(layer, layer_palette_overrides[layer], false);
}

void GraphicsManager::update_default_palettes() {
    if(slot_palette_scene_revision != scene_revision) {
        slot_palette_scene_revision = scene_revision;
        for(int layer = 0; layer < 4; ++layer) { slot_palette_sources[layer] = nullptr; slot_palette_backgrounds[layer] = nullptr; layer_palette_overrides[layer] = nullptr; }
    }
    for(int layer = 0; layer < current_bgs_id.size() && layer < 4; ++layer) {
        auto native = get_layer_palette(layer);
        if(!native) { slot_palette_sources[layer] = nullptr; slot_palette_backgrounds[layer] = nullptr; layer_palette_overrides[layer] = nullptr; continue; }
        const Backgrounds* background = get_background_by_id(current_bgs_id[layer]);
        if(!background) continue;
        // Avoid looking up the graphics item (and logging its name) every
        // frame when neither the source nor the native palette has changed.
        if(slot_palette_backgrounds[layer] == background && slot_palette_sources[layer] &&
           slot_palette_native_ids[layer] == native->id()) continue;
        auto item = get_bg_item_from_name(background->name);
        if(!item) continue;
        slot_palette_backgrounds[layer] = background;
        const auto original = item->palette_item().colors_ref();
        if(slot_palette_sources[layer] == original.data() && slot_palette_native_ids[layer] == native->id()) continue;
        if(slot_palette_sources[layer] != original.data()) layer_palette_overrides[layer] = nullptr;
        slot_palette_sources[layer] = original.data(); slot_palette_native_ids[layer] = native->id();
        for(int color = 0; color < original.size() && color < native->colors_count(); ++color) {
            const int binding = get_slot_palette_binding(background->name, original[color].data());
            if(binding < 0) continue;
            const BackgroundPalette* palette = resolve_slot_palette(binding / 16);
            BN_ASSERT(palette && palette->colors && binding % 16 < palette->colors_count, "Missing slot palette");
            native->set_color(color, palette->colors[binding % 16]);
        }
    }
}

void GraphicsManager::change_palette_layer(int layer_id, const char* const* palette_ids, bool restore_palette) {
    update_default_palettes();
    if(!currentScene || !currentScene->scene_type ||
       bn::string_view(currentScene->scene_type) == "Logo" || bn::string_view(currentScene->scene_type) == "Point Click") return;
    const int safe_layer = bn::clamp(layer_id, 0, 3);
    bool loaded = safe_layer < current_bgs.size() && current_bgs[safe_layer].has_value();
#if GBA_STUDIO_FEATURE_BACKGROUND_TRANSFORM
    const bool affine = current_affine_bgs[safe_layer].has_value();
    loaded = loaded || affine;
#endif
    if(!loaded) return;
    if(safe_layer >= current_bgs_id.size() || current_bgs_id[safe_layer].empty()) return;

    const Backgrounds* background = get_background_by_id(current_bgs_id[safe_layer]);
    if(!background) return;
    auto bg_item = get_bg_item_from_name(background->name);
    if(!bg_item.has_value()) return;

    if(restore_palette) {
        layer_palette_overrides[safe_layer] = nullptr;
        slot_palette_sources[safe_layer] = nullptr;
#if GBA_STUDIO_FEATURE_BACKGROUND_TRANSFORM
        if(affine) { current_affine_bgs[safe_layer]->set_palette(bn::bg_palette_item(bg_item->palette_item().colors_ref(), bn::bpp_mode::BPP_8)); return; }
#endif
        current_bgs[safe_layer]->set_palette(bg_item.value().palette_item());
        return;
    }

    bn::array<bn::color, 256> colors;
    layer_palette_overrides[safe_layer] = palette_ids;
    // BPP4 palettes are allocated in 16-color banks. Request only the
    // highest bank actually used by this event; asking Butano for all 256
    // colors makes a one-bank palette fail whenever another layer already
    // owns a few palette banks.
    const auto original_colors = bg_item->palette_item().colors_ref();
    int colors_count = original_colors.size();
    for(int index = 0; index < 256; ++index) colors[index] = index < original_colors.size() ? original_colors[index] : bn::color(0, 0, 0);
    if(palette_ids) {
        for(int slot = 0; slot < 16; ++slot) {
            const BackgroundPalette* palette = resolve_palette_reference(palette_ids[slot], slot);
            if(!palette || !palette->colors) continue;
            colors_count = bn::max(colors_count, (slot + 1) * 16);
            const int color_count = bn::min(palette->colors_count, 16);
            for(int color = 0; color < color_count; ++color) {
                colors[slot * 16 + color] = palette->colors[color];
            }
        }
    }
    auto bpp = bn::bpp_mode::BPP_4;
#if GBA_STUDIO_FEATURE_BACKGROUND_TRANSFORM
    if(affine) bpp = bn::bpp_mode::BPP_8;
#endif
    const bn::bg_palette_item palette_item(bn::span<const bn::color>(colors.data(), colors_count), bpp);
#if GBA_STUDIO_FEATURE_BACKGROUND_TRANSFORM
    if(affine) { current_affine_bgs[safe_layer]->set_palette(palette_item); slot_palette_native_ids[safe_layer] = current_affine_bgs[safe_layer]->palette().id(); return; }
#endif
    current_bgs[safe_layer]->set_palette(palette_item);
    slot_palette_native_ids[safe_layer] = current_bgs[safe_layer]->palette().id();
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
#if GBA_STUDIO_FEATURE_BACKGROUND_TRANSFORM
    if(current_affine_bgs[safe_layer].has_value()) current_affine_bgs[safe_layer]->set_visible(visible);
#endif
}

void GraphicsManager::scroll_background(int layer_id, int x, int y) {
    if(!currentScene) return;
    const bn::string<64> scene_type = currentScene->scene_type;
    if(scene_type == "Logo" || scene_type == "Point Click") {
        if(current_bitmap_bgs.has_value()) {
            current_bgs_x[2] += x; current_bgs_y[2] += y;
            set_camera_position(camera_x, camera_y);
        }
        return;
    }
    const int safe_layer = bn::clamp(layer_id, 0, 3);
    bool loaded = safe_layer < current_bgs.size() && current_bgs[safe_layer].has_value();
#if GBA_STUDIO_FEATURE_BACKGROUND_TRANSFORM
    loaded = loaded || current_affine_bgs[safe_layer].has_value();
#endif
    if(!loaded) return;
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
#if GBA_STUDIO_FEATURE_BACKGROUND_TRANSFORM
    if(layer_id >= 0 && layer_id < 4 && current_affine_bgs[layer_id].has_value()) return bn::bg_palette_ptr(current_affine_bgs[layer_id]->palette());
#endif
    if(layer_id < 0 || layer_id >= current_bgs.size() || !current_bgs[layer_id].has_value()) return bn::nullopt;
    return bn::bg_palette_ptr(current_bgs[layer_id]->palette());
}

void GraphicsManager::startup_screen(bn::regular_bg_ptr gba_studio_logo) {
#if GBA_STUDIO_FEATURE_BACKGROUND_TRANSFORM
    for(auto& background : current_affine_bgs) background.reset();
#endif
    current_bgs.clear();
    current_bitmap_bgs.reset();
    bn::core::update();  

    current_bgs.push_back(gba_studio_logo);
}

void GraphicsManager::startup_screen_bitmap(bn::direct_bitmap_item spritesheet) {
#if GBA_STUDIO_FEATURE_BACKGROUND_TRANSFORM
    for(auto& background : current_affine_bgs) background.reset();
#endif
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
        BN_LOG("loadNextSceneById - Scene nÃƒÆ’Ã‚Â£o encontrada com ID: ", scene_id.data());
        return nullptr;
    }
    BN_LOG("loadNextSceneById - Scene encontrada: ", scene->name);

    // A scene owns its currently visible sprites. Remove the previous player
    // before rendering and creating the one requested by Change Scene.
    clear_sprites();

    // Setar a currente scene para conseguir ser usada as funÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Âµes
    setScene(scene);
    // Scene and editor coordinates use the image upper-left corner as the
    // world origin. Pan Camera moves this origin explicitly.
    camera_x = scene->camera_x;
    camera_y = scene->camera_y;
    // Camera behavior is scene-local unless Follow explicitly opts into persistence.
    // Reset before OnInit so the new scene can configure its own camera.
    CameraManager::instance().reset_for_scene(camera_x, camera_y);
    
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

    for(int index = 0; scene->actors && index < scene->actors_count; ++index) {
        const SceneActor& actor = scene->actors[index];
        if(!actor.id || !actor.sprite_id || !actor.sprite_id[0]) continue;
        if(actor_residences.full()) { BN_LOG("Actor residency capacity exceeded"); break; }
        actor_residences.push_back({ &actor, actor.x, actor.y, !actor.spawn_prefab_id, true });
    }
    // The caller creates the player after loading the scene. Residency runs
    // at the next initialization/sprite update so actors cannot consume the
    // player's OAM first when a scene reaches the hardware object limit.

    // 6. Desenha tiles


    return scene;
}

bn::optional<bn::sprite_ptr> GraphicsManager::create_sprite(const bn::sprite_item& item, int x, int y)
{
    int slot = -1;
    for(int index = 0; index < sprite_count; ++index)
        if(!sprites[index].has_value()) { slot = index; break; }
    if(slot < 0 && sprite_count < MAX_SPRITES) slot = sprite_count++;
    if(slot >= 0)
    {
        auto created = item.create_sprite_optional(x, y);
        if(!created) return bn::nullopt;
        auto spr = created.value();
        // Screen fades only affect sprites that opt in to blending.
        spr.set_blending_enabled(true);
#if GBA_STUDIO_FEATURE_SPRITE_EFFECTS
        spr.set_blending_enabled(!actor_opacity_control);
#endif
        // Actors and the player stay above regular backgrounds (priority 3)
        // while remaining below dialogue UI (priority 0).
        spr.set_bg_priority(2);
        sprites[slot] = spr;
        sprite_tiles_items[slot].reset();
        sprite_resources[slot] = nullptr;
        sprite_animations[slot] = nullptr;
        sprite_main_states[slot] = nullptr;
        sprite_animation_frames[slot] = 0;
        sprite_animation_updates[slot] = 0;
        sprite_script_motion[slot] = false;
        sprite_script_climb_direction[slot] = 0;
        return spr;
    }
    return bn::nullopt;
}

bn::optional<bn::sprite_ptr> GraphicsManager::create_sprite(
        const Sprites& resource, const bn::sprite_item& item, int x, int y, const char* direction)
{
    // sprite_count is a high-water mark. The contiguous-slot search below
    // can reuse holes even after the table has once reached MAX_SPRITES.
    const SpriteAnimationDefinition* idle_animation = nullptr;
    bn::string<32> directional_idle("idle-");
    directional_idle += direction ? direction : "right";

    // Prefer the idle matching Start Direction. Generic idle and idle-right
    // are fallbacks for fixed-direction and horizontally flipped sprites.
    for(int i = 0; i < resource.animations_count; ++i)
    {
        const SpriteAnimationDefinition& animation = resource.animations[i];
        if(resource.animations_count > 0 && !actor_motion::same_text(animation.state_id, resource.animations[0].state_id)) continue;
        const int parts_count = bn::max(1, resource.composite_columns) * bn::max(1, resource.composite_rows);
        if(!animation.animation_type || bn::string<16>(animation.animation_type) != "idle" ||
           !animation_frames_fit_composite(animation, item.tiles_item().graphics_count(), parts_count))
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

    // Frames refer to the sprite asset materialized during transcode.
    int initial_frame = idle_animation ? idle_animation->frames[0] : resource.idle_frame;
    const int graphics_count = item.tiles_item().graphics_count();
    const int columns = bn::max(1, resource.composite_columns);
    const int rows = bn::max(1, resource.composite_rows);
    const int parts_count = columns * rows;
    created_sprite_root = -1;
    int root_slot = -1;
    for(int start = 0; start + parts_count <= MAX_SPRITES; ++start) {
        bool free = true;
        for(int part = 0; part < parts_count; ++part) if(start + part < sprite_count && sprites[start + part]) { free = false; break; }
        if(free) { root_slot = start; break; }
    }
    if(root_slot < 0) return bn::nullopt;
    if(initial_frame < 0 || initial_frame + parts_count > graphics_count)
    {
        BN_LOG("Sprite initial frame out of range: ", initial_frame, " / ", graphics_count, "; using 0");
        initial_frame = 0;
    }
    BN_LOG("Player sprite: create initial graphics frame ", initial_frame, " of ", graphics_count);
    const Settings* settings = get_settings();
    for(int part = 0; part < parts_count; ++part)
    {
        const int column = part % columns;
        const int row = part / columns;
        auto created = item.create_sprite_optional(x + column * resource.frame_width, y + row * resource.frame_height, initial_frame + part);
        if(!created) {
            for(int previous = 0; previous < part; ++previous) sprites[root_slot + previous].reset();
            return bn::nullopt;
        }
        auto spr = created.value();
        spr.set_horizontal_flip(flip_horizontally);
        spr.set_blending_enabled(true);
#if GBA_STUDIO_FEATURE_SPRITE_EFFECTS
        spr.set_blending_enabled(!actor_opacity_control);
#endif
        spr.set_bg_priority(2);

        const int slot = root_slot + part;
        sprite_count = bn::max(sprite_count, slot + 1);
        sprites[slot] = spr;
        sprite_tiles_items[slot] = item.tiles_item();
        sprite_resources[slot] = &resource;
        sprite_animations[slot] = idle_animation;
        sprite_main_states[slot] = idle_animation ? idle_animation->state_id : resource.animations_count > 0 ? resource.animations[0].state_id : nullptr;
        sprite_animation_frames[slot] = 0;
        sprite_animation_updates[slot] = 0;
        sprite_animation_speeds[slot] = settings ? settings->anim_speed : resource.animation_speed;
        sprite_animation_modes[slot] = 0;
        sprite_animation_reverse[slot] = false;
        sprite_composite_part_index[slot] = part;
        sprite_script_motion[slot] = false;
        sprite_script_climb_direction[slot] = 0;
    }
    created_sprite_root = root_slot;
    return sprites[root_slot];
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

    // Resolve each layer once, rather than once per animated tile. Preserve
    // the clock pause while a layer is unloaded or its background is replaced.
    bool loaded_layers[4] = {};
#if GBA_STUDIO_FEATURE_BACKGROUND_TRANSFORM
    bool affine_layers[4] = {};
#endif
    for(int layer = 0; layer < 4 && layer < current_bgs.size(); ++layer) {
        loaded_layers[layer] = current_bgs[layer].has_value();
#if GBA_STUDIO_FEATURE_BACKGROUND_TRANSFORM
        affine_layers[layer] = current_affine_bgs[layer].has_value();
        loaded_layers[layer] = loaded_layers[layer] || affine_layers[layer];
#endif
    }
    for(int index = 0; index < currentScene->backgrounds_layers_size; ++index) {
        const auto& layer = currentScene->backgrounds_layers[index];
        if(layer.layerId >= 0 && layer.layerId < 4 && layer.backgroundId && layer.backgroundId[0] &&
           (layer.layerId >= current_bgs_id.size() || current_bgs_id[layer.layerId] != layer.backgroundId)) loaded_layers[layer.layerId] = false;
    }
    const int animations_count = bn::min(currentScene->tile_animations_count, 32);
    for(int index = 0; index < animations_count; ++index)
    {
        const TileAnimation& animation = currentScene->tile_animations[index];
        if(animation.layer_id < 0 || animation.layer_id >= 4 ||
           !loaded_layers[animation.layer_id] || !animation.frame_tile_indices ||
           animation.frames_count <= 0 || animation.target_tile_index < 0 ||
           animation.target_tile_index >= 1024)
        {
            continue;
        }

        const auto write_frame = [&](int frame) {
            const auto write = [&](auto tiles, int stride) {
                const auto tile_data = tiles.tiles_ref();
                const int source = animation.frame_tile_indices[frame] * stride;
                if(tile_data.has_value() && source >= 0 && source + stride <= tile_data->size())
                    tiles.overwrite_tile(animation.target_tile_index, (*tile_data)[source]);
            };
#if GBA_STUDIO_FEATURE_BACKGROUND_TRANSFORM
            if(affine_layers[animation.layer_id]) { write(current_affine_bgs[animation.layer_id]->tiles(), 2); return; }
#endif
            auto tiles = current_bgs[animation.layer_id]->tiles();
            write(tiles, tiles.bpp() == bn::bpp_mode::BPP_8 ? 2 : 1);
        };
        const int frame_count = bn::min(animation.frames_count, 32);
        if(!tile_animation_initialized[index])
        {
            tile_animation_frames[index] = bn::clamp(animation.initial_frame, 0, frame_count - 1);
            tile_animation_initialized[index] = true;
            tile_animation_ticks[index] = 0;
            write_frame(tile_animation_frames[index]);
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
        write_frame(next_frame);
    }
}

#if GBA_STUDIO_FEATURE_SHOOTER
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
            const int half_width = item->shape_size().width() / 2;
            const int half_height = item->shape_size().height() / 2;
            if(screen_x + half_width <= -120 || screen_x - half_width >= 120 || screen_y + half_height <= -80 || screen_y - half_height >= 80)
            {
                shooter_projectile_sprites[slot].reset();
                shooter_projectile_indices[slot] = -1;
                continue;
            }
            if(!shooter_projectile_sprites[slot].has_value())
            {
                auto created = item->create_sprite_optional(screen_x, screen_y, resource->idle_frame);
                if(!created) continue;
                created->set_bg_priority(2);
                created->set_blending_enabled(true);
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
        const int screen_x = projectile.x - camera_x - 120 + resource->frame_width / 2 - resource->canvas_origin_x;
        const int screen_y = projectile.y - camera_y - 80 + resource->frame_height / 2 - resource->canvas_origin_y;
        const int half_width = item->shape_size().width() / 2;
        const int half_height = item->shape_size().height() / 2;
        if(screen_x + half_width <= -120 || screen_x - half_width >= 120 || screen_y + half_height <= -80 || screen_y - half_height >= 80) continue;
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
        const int half_width = item->shape_size().width() / 2;
        const int half_height = item->shape_size().height() / 2;
        if(screen_x + half_width <= -120 || screen_x - half_width >= 120 || screen_y + half_height <= -80 || screen_y - half_height >= 80)
        {
            shooter_drop_sprites[slot].reset();
            continue;
        }
        if(!shooter_drop_sprites[slot].has_value() || shooter_drop_ids[slot] != drop_id)
        {
            shooter_drop_sprites[slot].reset();
            auto created = item->create_sprite_optional(screen_x, screen_y, resource->idle_frame);
            if(!created) continue;
            created->set_bg_priority(2);
            created->set_blending_enabled(true);
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
    if(!generator.generate_top_left_optional(4, 4, text, shooter_hud_sprites)) shooter_hud_sprites.clear();
}

#endif
void GraphicsManager::update_actor_physics()
{
    if(!currentScene || !actor_motion::platformer(*currentScene)) return;
    for(int i = 0; i < actor_count; ++i) {
        const int slot = actor_slots[i];
        if(!actor_physics_enabled[i] || slot < 0 || slot >= sprite_count || !sprites[slot] || !sprite_resources[slot]) continue;
#if GBA_STUDIO_FEATURE_MOTION
        if(ActorMotionManager::instance().controls_actor(actor_ids[i].data())) continue;
#endif
        auto& state = actor_physics_state[i];
        state.x = actor_world_x[i]; state.y = actor_world_y[i];
        actor_motion::Options options;
        options.physics = &actor_physics[i].config;
        actor_motion::step(*currentScene, *sprite_resources[slot], state, actor_motion::idle, 256, false, options);
        actor_physics[i].impulse_pending = false;
        if(state.grounded || state.climbing) actor_physics[i].air_jumps_used = 0;
        apply_script_actor_state(actor_ids[i].data(), state, actor_motion::idle);
        for(int part = 0; part < sprite_group_parts(slot) && slot + part < sprite_count; ++part) sprite_script_motion[slot + part] = false;
    }
}

void GraphicsManager::update_sprites()
{
    update_default_palettes();
    update_actor_residency();
    update_actor_physics();
    update_emote_animations();
#if GBA_STUDIO_FEATURE_SPRITE_EFFECTS
    update_sprite_effects();
#endif
#if GBA_STUDIO_FEATURE_BACKGROUND_ANIMATION
    update_background_animations();
#endif
    update_tile_animations();
    for(int i = 0; i < sprite_count; ++i)
    {
        if(!sprites[i].has_value() || !sprite_animations[i] || !sprite_tiles_items[i].has_value())
        {
            continue;
        }

        const SpriteAnimationDefinition& animation = *sprite_animations[i];
        if(!sprite_script_motion[i] && i == player_slot && player_drop_through_active) continue;
        if(sprite_script_motion[i] && animation.animation_type && bn::string<16>(animation.animation_type) == "climb" && !sprite_script_climb_direction[i]) continue;
        if(!sprite_script_motion[i] && i == player_slot && animation.animation_type && bn::string<16>(animation.animation_type) == "climb" &&
           (!player_climbing || !player_on_ladder(player_world_x, player_world_y) ||
            (!InputManager::instance().held("move_up") && !InputManager::instance().held("move_down")))) continue;
        if(sprite_animation_modes[i] == 2) continue;
        const int part_index = sprite_composite_part_index[i];
        // All assignment paths validate the complete clip. Resources live in
        // ROM; advancing a sprite only needs to check its selected tile below.
        if(!animation.frames || animation.frames_count <= 1)
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
        const int frame_step = sprite_animation_reverse[i] ? -1 : climbing_down && sprite_animation_modes[i] == 0 ? animation.frames_count - 1 : 1;
        int next_frame = sprite_animation_frames[i] + frame_step;
        if(sprite_animation_modes[i] == 1 && (next_frame >= animation.frames_count || next_frame < 0)) {
            next_frame = sprite_animation_reverse[i] ? 0 : animation.frames_count - 1;
            sprite_animation_modes[i] = 2;
        } else {
            next_frame = (next_frame + animation.frames_count) % animation.frames_count;
        }
        sprite_animation_frames[i] = next_frame;
        const int next_tile = animation.frames[sprite_animation_frames[i]] + part_index;
        if(next_tile >= 0 && next_tile < sprite_tiles_items[i]->graphics_count())
        {
            sprites[i]->set_tiles(sprite_tiles_items[i].value(), next_tile);
        }
    }
}

void GraphicsManager::update_emote_animations()
{
    for(EmoteAnimationState& state : emote_animations)
    {
        if(!state.occupied || !state.sprite) continue;
        int world_x = 0;
        int world_y = 0;
        bool found = false;
        if(state.actor_id == "__PLAYER__")
        {
            found = player_slot >= 0 && player_slot < sprite_count && sprites[player_slot].has_value();
            world_x = player_world_x;
            world_y = player_world_y;
        }
        else
        {
            for(int index = 0; index < actor_count; ++index)
                if(actor_ids[index] == state.actor_id)
                {
                    world_x = actor_world_x[index];
                    world_y = actor_world_y[index];
                    found = true;
                    break;
                }
        }
        if(!found || ++state.elapsed_frames >= 36)
        {
            remove_sprite(state.sprite.value());
            state = EmoteAnimationState();
            continue;
        }
        const int hop = state.elapsed_frames < 8 ? state.elapsed_frames : 8;
        state.sprite->set_position(world_x - camera_x - 120, world_y - camera_y - 80 - state.distance - hop);
    }
}

void GraphicsManager::clear_sprites()
{
#if GBA_STUDIO_FEATURE_MOTION
    ActorMotionManager::instance().cancel();
#endif
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
    for(EmoteAnimationState& state : emote_animations) state = EmoteAnimationState();
    player_slot = -1;
    actor_interaction_script = nullptr;
    actor_interaction_count = 0;
    actor_interaction_actor_id = nullptr;
    actor_count = 0;
    actor_residences.clear();
#if GBA_STUDIO_FEATURE_SPRITE_EFFECTS
    for(auto& state : actor_visual_states) state = ActorVisualState();
    for(auto& state : sprite_effect_states) state = SpriteEffectState();
    actor_opacity_control = false;
    actor_opacity_percent = 100;
#endif
#if GBA_STUDIO_FEATURE_ACTORS
    ActorManager::instance().reset();
#endif
    tile_animation_scene = nullptr;
    for(int index = 0; index < 32; ++index)
    {
        tile_animation_frames[index] = 0;
        tile_animation_ticks[index] = 0;
        tile_animation_initialized[index] = false;
    }
}

#if GBA_STUDIO_FEATURE_SAVE
const char* GraphicsManager::game_actor_id(uint32_t key) const {
    if(key == game_save_key("__PLAYER__")) return "__PLAYER__";
    for(int index = 0; index < actor_count; ++index) if(game_save_key(actor_ids[index].data()) == key) return actor_ids[index].data();
    for(const auto& residence : actor_residences) if(residence.enabled && game_save_key(residence.definition->id) == key) return residence.definition->id;
    return nullptr;
}

bool GraphicsManager::capture_game_world(GameWorldState& output) const
{
    if(!currentScene) return false;
    output.scene = 0; output.camera_x = output.camera_y = 0;
    output.camera_follow = output.actor_residency = 0; output.actors_count = 0;
    for(auto& actor : output.actors) actor = GameActorState();
    output.scene = game_save_key(currentScene->id);
    output.camera_x = camera_x; output.camera_y = camera_y;
    output.camera_follow = CameraManager::instance().is_following_player();
    output.actor_residency = 0xD7;
    const auto capture = [&](const char* id, int slot, int x, int y) {
        if(slot < 0 || slot >= sprite_count || !sprites[slot] || !sprite_resources[slot]) return false;
        if(output.actors_count == GBA_STUDIO_MAX_ACTOR_DEFINITIONS + 1) return false;
        auto& actor = output.actors[output.actors_count++];
        actor.id = game_save_key(id); actor.sprite = game_save_key(sprite_resources[slot]->id);
        actor.x = x; actor.y = y; actor.direction = uint8_t(read_numeric_actor_property(id, 2));
        actor.frame = sprite_animation_frames[slot]; actor.animation_speed = uint8_t(sprite_animation_speeds[slot]);
        actor.mode = uint8_t(sprite_animation_modes[slot]); actor.reverse = sprite_animation_reverse[slot];
        actor.visible = sprites[slot]->visible();
        actor.state = sprite_main_states[slot] ? game_save_key(sprite_main_states[slot]) : 0;
        actor.animation = sprite_animations[slot] ? game_save_key(sprite_animations[slot]->animation_id) : 0;
        return true;
    };
    if(player_slot >= 0) {
        if(!capture("__PLAYER__", player_slot, player_world_x, player_world_y)) return false;
        auto& player = output.actors[0]; player.velocity = player_vertical_velocity_q8; player.remainder = player_vertical_remainder_q8;
        player.grounded = player_grounded; player.climbing = player_climbing;
    }
    for(int index = 0; index < actor_count; ++index)
        if(!capture(actor_ids[index].data(), actor_slots[index], actor_world_x[index], actor_world_y[index])) return false;
    for(const auto& residence : actor_residences) {
        const auto& definition = *residence.definition;
        bool active = false;
        for(int index = 0; index < actor_count; ++index) if(actor_definitions[index] == &definition) { active = true; break; }
        if(active || (!residence.enabled && definition.spawn_prefab_id)) continue;
        if(residence.enabled && !definition.spawn_prefab_id && residence.x == definition.x && residence.y == definition.y && residence.visible) continue;
        if(output.actors_count == GBA_STUDIO_MAX_ACTOR_DEFINITIONS + 1) return false;
        auto& actor = output.actors[output.actors_count++];
        actor.id = game_save_key(definition.id); actor.sprite = game_save_key(definition.sprite_id);
        actor.x = residence.x; actor.y = residence.y; actor.visible = residence.visible;
        actor.mode = residence.enabled ? 3 : 4; // dormant / explicitly removed
    }
    return true;
}

bool GraphicsManager::restore_game_world(const GameWorldState& saved)
{
    const auto* scene = get_scene_by_save_key(saved.scene);
    if(!scene || saved.actors_count < 0 || saved.actors_count > GBA_STUDIO_MAX_ACTOR_DEFINITIONS + 1 || saved.camera_follow > 1) return false;
    const auto id_for = [&](const GameActorState& actor) -> const char* {
        if(actor.id == game_save_key("__PLAYER__")) return "__PLAYER__";
        for(int index = 0; scene->actors && index < scene->actors_count; ++index)
            if(game_save_key(scene->actors[index].id) == actor.id) return scene->actors[index].id;
        const auto* sprite = get_sprite_by_save_key(actor.id);
        return sprite ? sprite->id : nullptr;
    };
    // Validate resource identities before replacing the current scene.
    for(int index = 0; index < saved.actors_count; ++index) {
        const auto& actor = saved.actors[index];
        if(!id_for(actor) || !get_sprite_by_save_key(actor.sprite) || actor.direction > 3 || actor.animation_speed > 8 || actor.visible > 1 || actor.mode > (saved.actor_residency == 0xD7 ? 4 : 2) || actor.reverse > 1 || actor.grounded > 1 || actor.climbing > 1 || actor.frame < 0) return false;
        for(int previous = 0; previous < index; ++previous) if(saved.actors[previous].id == actor.id) return false;
    }
    game_save_restoring = true;
    const auto* restored = load_next_scene_by_id(scene->id);
    game_save_restoring = false;
    if(!restored) return false;
    camera_x = saved.camera_x; camera_y = saved.camera_y;
    // Legacy saves listed every live actor. New saves also retain defaults for
    // uninstantiated placed actors, plus changed dormant positions/tombstones.
    if(saved.actor_residency != 0xD7) for(auto& residence : actor_residences) residence.enabled = false;
    // Removed actors stay removed, instead of being recreated by the scene.
    for(int index = actor_count - 1; index >= 0; --index) {
        bool present = false;
        for(int saved_index = 0; saved_index < saved.actors_count; ++saved_index)
            if(game_save_key(actor_ids[index].data()) == saved.actors[saved_index].id) { present = true; break; }
        if(!present) { const bn::string<64> id = actor_ids[index]; remove_actor(id.data()); }
    }
    for(int index = 0; index < saved.actors_count; ++index) {
        const auto& actor = saved.actors[index]; const char* id = id_for(actor);
        const bool player = actor.id == game_save_key("__PLAYER__");
        const char* direction = actor.direction == 0 ? "up" : actor.direction == 1 ? "right" : actor.direction == 2 ? "down" : "left";
        if(actor.mode >= 3) {
            auto* residence = actor_residence(id);
            if(player || !residence || game_save_key(residence->definition->sprite_id) != actor.sprite) return false;
            residence->enabled = actor.mode == 3;
            residence->x = actor.x; residence->y = actor.y; residence->visible = actor.visible != 0;
            continue;
        }
        if(player) spawn_player(*scene, actor.x, actor.y, direction, true);
        else {
            game_save_restoring = true;
            const bool spawned = spawn_actor(id, actor.x, actor.y);
            game_save_restoring = false;
            if(!spawned) return false;
        }
        actor_motion::State state;
        const auto* body = read_script_actor_state(id, state);
        if(!body || game_save_key(body->id) != actor.sprite) return false;
        state.x = actor.x; state.y = actor.y; state.direction = actor.direction;
        state.velocity_q8 = actor.velocity; state.remainder_q8 = actor.remainder;
        state.grounded = actor.grounded; state.climbing = actor.climbing;
        if(!apply_script_actor_state(id, state, actor_motion::idle)) return false;
        set_actor_animation_speed(id, actor.animation_speed);
        if(actor.state && body->animations) for(int clip = 0; clip < body->animations_count; ++clip) {
            const auto& animation = body->animations[clip];
            if(game_save_key(animation.state_id) == actor.state && game_save_key(animation.animation_id) == actor.animation) {
                if(actor.frame >= animation.frames_count) return false;
                if(!control_actor_animation({id, "frame", animation.state_id, animation.animation_id, actor.animation_speed, actor.frame, false})) return false;
                break;
            }
        }
        set_actor_visible(id, actor.visible != 0);
        int slot = player ? player_slot : -1;
        if(!player) for(int actor_index = 0; actor_index < actor_count; ++actor_index) if(actor_ids[actor_index] == id) { slot = actor_slots[actor_index]; break; }
        for(int part = 0; slot >= 0 && part < sprite_group_parts(slot); ++part) {
            sprite_animation_modes[slot + part] = actor.mode;
            sprite_animation_reverse[slot + part] = actor.reverse != 0;
            sprite_script_motion[slot + part] = false;
            sprite_script_climb_direction[slot + part] = 0;
        }
    }
    CameraManager::instance().set_position(saved.camera_x, saved.camera_y);
    CameraManager::instance().follow_player_actor(saved.camera_follow != 0);
    for(int index = 0; index < actor_count; ++index) actor_initialization[index] = 2;
    return true;
}
#endif

bn::optional<bn::sprite_ptr> GraphicsManager::create_ui_sprite(const char* graphics_name, int x, int y)
{
    if(!graphics_name || graphics_name[0] == '\0') return bn::optional<bn::sprite_ptr>();
    const auto item = get_sprite_item_from_name(bn::string<64>(graphics_name));
    if(!item.has_value()) return bn::optional<bn::sprite_ptr>();
    return item->create_sprite_optional(x, y);
}

bn::optional<bn::sprite_ptr> GraphicsManager::create_ui_sprite_frame(const char* graphics_name, int x, int y, int frame)
{
    if(!graphics_name || graphics_name[0] == '\0') return bn::nullopt;
    const auto item = get_sprite_item_from_name(bn::string<64>(graphics_name));
    if(!item.has_value()) return bn::nullopt;
    return item->create_sprite_optional(x, y, frame);
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
