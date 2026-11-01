/**
 * {{PROJECT_NAME}} - GBA Game
 * Author: {{AUTHOR}}
 * Version: {{VERSION}}
 * 
 * Built with GBA Studio engine for Butano
 */

#include "bn_string.h"
#include "resources.h"
#include "resource_registry.h"
#include "gba_studio_features.h"
#if GBA_STUDIO_FEATURE_SAVE
#include "game_save_state.h"
#endif
#if GBA_STUDIO_FEATURE_VARIABLES
#include "variable_manager.h"
#endif

static constexpr int BACKGROUNDS_COUNT = {{BACKGROUNDS_COUNT}};
static const Backgrounds BACKGROUNDS[{{BACKGROUNDS_ARRAY_SIZE}}] = {
{{BACKGROUNDS_CONSTANTS}}
};

{{BACKGROUND_PALETTES_CONSTANTS}}
static constexpr int BACKGROUND_PALETTES_COUNT = {{BACKGROUND_PALETTES_COUNT}};
static const BackgroundPalette BACKGROUND_PALETTES[{{BACKGROUND_PALETTES_ARRAY_SIZE}}] = {
{{BACKGROUND_PALETTES_ENTRIES}}
};

static constexpr int SCENES_COUNT = {{SCENES_COUNT}};
static const Scenes SCENES[{{SCENES_ARRAY_SIZE}}] = {
{{SCENES_CONSTANTS}}
};

static constexpr int SPRITES_COUNT = {{SPRITES_COUNT}};
static const Sprites SPRITES[{{SPRITES_ARRAY_SIZE}}] = {
{{SPRITES_CONSTANTS}}
};

static const Settings SETTINGS = {{SETTINGS_CONSTANTS}};

#if GBA_STUDIO_FEATURE_SAVE
const Scenes* get_scene_by_save_key(uint32_t key) {
    for(int index = 0; index < SCENES_COUNT; ++index) if(game_save_key(SCENES[index].id) == key) return &SCENES[index];
    return nullptr;
}
const Sprites* get_sprite_by_save_key(uint32_t key) {
    for(int index = 0; index < SPRITES_COUNT; ++index) if(game_save_key(SPRITES[index].id) == key) return &SPRITES[index];
    return nullptr;
}
const GameSavePoint* get_game_save_point(uint32_t key) {
{{GAME_SAVE_LOOKUPS}}
    (void) key;
    return nullptr;
}
#endif

void initialize_variables()
{
#if GBA_STUDIO_FEATURE_VARIABLES
{{VARIABLES_INITIALIZATION}}
#endif
}

// Função auxiliar genérica para iterar sobre arrays de qualquer tipo
template <typename T, typename Func>
const T* find_in_array(const T* array, size_t size, Func&& predicate)
{
    for(size_t i = 0; i < size; ++i)
    {
        if(predicate(array[i]))
        {
            return &array[i];   // retorna o item encontrado
        }
    }
    return nullptr;             // não encontrou
}

// FUNCOES para BACKGROUND
const Backgrounds* get_background_by_name(const char* name)
{
    bn::string<64> target(name);
    return find_in_array(BACKGROUNDS, BACKGROUNDS_COUNT, [&](const Backgrounds& b) {
        return bn::string<64>(b.name) == target;
    });
}

const Backgrounds* get_background_by_id(const bn::string<64>& background_id)
{
    return find_in_array(BACKGROUNDS, BACKGROUNDS_COUNT, [&](const Backgrounds& b) {
        return bn::string<64>(b.id) == background_id;
    });
}

const BackgroundPalette* get_background_palette_by_id(const bn::string<64>& palette_id)
{
    return find_in_array(BACKGROUND_PALETTES, BACKGROUND_PALETTES_COUNT, [&](const BackgroundPalette& palette) {
        return bn::string<64>(palette.id) == palette_id;
    });
}

// FUNCOES para SCENE
const Scenes* get_scene_by_name(const char* name) {
    bn::string<64> target(name);
    return find_in_array(SCENES, SCENES_COUNT, [&](const Scenes& s) {
        return bn::string<64>(s.name) == target;
    });
}

const Scenes* get_scene_by_id(const bn::string<64>& scene_id) {
    return find_in_array(SCENES, SCENES_COUNT, [&](const Scenes& s) {
        return bn::string<64>(s.id) == scene_id;
    });
}

const Scenes* get_first_scene() {
    return SCENES_COUNT > 0 ? &SCENES[0] : nullptr;
}

const Scenes* get_scene_by_id_and_type(const bn::string<64>& scene_id, ResourceType type) {
    return find_in_array(SCENES, SCENES_COUNT, [&](const Scenes& s) {
        return bn::string<64>(s.id) == scene_id && s.type == type;
    });
}

// FUNCOES para SPRITE
const Sprites* get_sprite_by_name(const char* name)
{
    bn::string<64> target(name);
    return find_in_array(SPRITES, SPRITES_COUNT, [&](const Sprites& sprite) {
        return bn::string<64>(sprite.name) == target;
    });
}

const Sprites* get_sprite_by_id(const bn::string<64>& sprite_id)
{
    return find_in_array(SPRITES, SPRITES_COUNT, [&](const Sprites& sprite) {
        return bn::string<64>(sprite.id) == sprite_id;
    });
}

// FUNCOES para SETTINGS
const Settings* get_settings()
{
    return &SETTINGS;
}

// FUNCOES para TILEMAP

