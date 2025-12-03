/**
 * {{PROJECT_NAME}} - GBA Game
 * Author: {{AUTHOR}}
 * Version: {{VERSION}}
 * 
 * Built with Butano engine for GBA
 */

#include "bn_string.h"
#include "bn_log.h"

#include "graphics_manager.h"
#include "graphics_items.h"

#include "resources.h"
#include "resource_registry.h"

bn::string<64> extract_start_scene_id(const Resource* settings)
{
    if(settings && settings->type == ResourceType::Settings)
        return bn::string<64>(settings->id);
    return bn::string<64>();
}

bn::string<64> extract_bg_id_from_scene(const Resource* scene)
{
    if(scene && scene->type == ResourceType::Scene)
    {
        // Extrai o BACKGROUNDID do campo background_id
        if(scene->background_id)
            return bn::string<64>(scene->background_id);
    }
    return bn::string<64>();
}

bn::string<64> get_bg_name_from_resource(const Resource* bg_resource)
{
    if(bg_resource && bg_resource->type == ResourceType::Background)
    {
        if(bg_resource->name)
            return bn::string<64>(bg_resource->name);
    }
    return bn::string<64>();
}

bn::optional<bn::regular_bg_item> get_bg_item_from_name(const bn::string<64>& name)
{
    if(name == bn::string<64>("castle_novo"))
        return bn::regular_bg_items::castle_novo;
    if(name == bn::string<64>("fund_game_default"))
        return bn::regular_bg_items::fund_game_default;
    return bn::nullopt;
}

// ----------------- Implementação da classe -----------------

GraphicsManager::GraphicsManager() : sprite_count(0) {}
GraphicsManager::~GraphicsManager() {}

void GraphicsManager::initialize()
{
    // 1. Pega o settings
    const Resource* settings = get_resource_by_name("settings");
    if(!settings)
    {
        BN_LOG("Settings não encontrado");
        return;
    }

    // 2. Extrai o STARTSCENEID do settings_res.h
    bn::string<64> scene_id(SETTINGS_STARTSCENEID);
    BN_LOG("StartSceneId: ", scene_id.data());

    // 3. Busca a cena pelo ID na registry (verifica tipo Scene)
    const Resource* scene = get_resource_by_id_and_type(scene_id, ResourceType::Scene);
    if(!scene)
    {
        BN_LOG("Scene não encontrada com ID: ", scene_id.data());
        return;
    }

    // 4. Extrai o BACKGROUNDID da cena
    bn::string<64> bg_id = extract_bg_id_from_scene(scene);
    if(bg_id.empty())
    {
        BN_LOG("Background ID não encontrado na cena");
        return;
    }
    BN_LOG("BackgroundId: ", bg_id.data());

    // 5. Busca o recurso de background pelo ID (verifica tipo Background)
    const Resource* bg_resource = get_resource_by_id_and_type(bg_id, ResourceType::Background);
    if(!bg_resource)
    {
        BN_LOG("Background não encontrado com ID: ", bg_id.data());
        return;
    }

    // 6. Extrai o nome do background do resource
    bn::string<64> bg_name = get_bg_name_from_resource(bg_resource);
    BN_LOG("Background name: ", bg_name.data());

    // 7. Cria o background ativo
    auto bg_item = get_bg_item_from_name(bg_name);
    if(bg_item.has_value())
    {
        current_bg = bn::regular_bg_ptr::create(bg_item.value());
        BN_LOG("Background carregado com sucesso!");
    }
    else
    {
        BN_LOG("Background item não encontrado: ", bg_name.data());
    }

}

bn::optional<bn::sprite_ptr> GraphicsManager::create_sprite(const bn::sprite_item& item, int x, int y)
{
    if(sprite_count < MAX_SPRITES)
    {
        auto spr = item.create_sprite(x, y);
        sprites[sprite_count++] = spr;
        return spr;
    }
    return bn::nullopt;
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

void GraphicsManager::update_sprites()
{
    // Atualizações futuras
}

void GraphicsManager::clear_sprites()
{
    for(int i = 0; i < sprite_count; ++i)
    {
        sprites[i].reset();
    }
    sprite_count = 0;
}

int GraphicsManager::get_sprite_count() const
{
    return sprite_count;
}
