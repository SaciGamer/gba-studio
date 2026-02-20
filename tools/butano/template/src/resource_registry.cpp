/**
 * {{PROJECT_NAME}} - GBA Game
 * Author: {{AUTHOR}}
 * Version: {{VERSION}}
 * 
 * Built with Butano engine for GBA
 */

#include "bn_string.h"
#include "resources.h"
#include "resource_registry.h"

{{BACKGROUNDS_LAYERS_CONSTANTS}}

static const Backgrounds BACKGROUNDS[] = {
{{BACKGROUNDS_CONSTANTS}}
};

static const Scenes SCENES[] = {
{{SCENES_CONSTANTS}}
};

static const Settings SETTINGS = {{SETTINGS_CONSTANTS}};

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
    return find_in_array(BACKGROUNDS, sizeof(BACKGROUNDS)/sizeof(BACKGROUNDS[0]), [&](const Backgrounds& b) {
        return bn::string<64>(b.name) == target;
    });
}

const Backgrounds* get_background_by_id(const bn::string<64>& background_id)
{
    return find_in_array(BACKGROUNDS, sizeof(BACKGROUNDS)/sizeof(BACKGROUNDS[0]), [&](const Backgrounds& b) {
        return bn::string<64>(b.id) == background_id;
    });
}

// FUNCOES para SCENE
const Scenes* get_scene_by_name(const char* name) {
    bn::string<64> target(name);
    return find_in_array(SCENES, sizeof(SCENES)/sizeof(SCENES[0]), [&](const Scenes& s) {
        return bn::string<64>(s.name) == target;
    });
}

const Scenes* get_scene_by_id(const bn::string<64>& scene_id) {
    return find_in_array(SCENES, sizeof(SCENES)/sizeof(SCENES[0]), [&](const Scenes& s) {
        return bn::string<64>(s.id) == scene_id;
    });
}

const Scenes* get_scene_by_id_and_type(const bn::string<64>& scene_id, ResourceType type) {
    return find_in_array(SCENES, sizeof(SCENES)/sizeof(SCENES[0]), [&](const Scenes& s) {
        return bn::string<64>(s.id) == scene_id && s.type == type;
    });
}

// FUNCOES para SETTINGS
const Settings* get_settings()
{
    return &SETTINGS;
}

// FUNCOES para TILEMAP

