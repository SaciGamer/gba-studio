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
#include "variable_manager.h"

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

void initialize_variables()
{
{{VARIABLES_INITIALIZATION}}
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

