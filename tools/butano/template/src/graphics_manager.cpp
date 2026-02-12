/**
 * {{PROJECT_NAME}} - GBA Game
 * Author: {{AUTHOR}}
 * Version: {{VERSION}}
 * 
 * Built with Butano engine for GBA
 */

#include "bn_string.h"
#include "bn_log.h"
#include "bn_vector.h"

#include "graphics_manager.h"
#include "graphics_items.h"

#include "resources.h"
#include "resource_registry.h"

bn::optional<bn::regular_bg_item> get_bg_item_from_name(const bn::string<64>& name)
{
    BN_LOG("..: get_bg_item_from_name, name:", name.data(), ":..");

    {{BACKGROUND_CONDITIONALS_FROM_NAME}}
    /* Example if
    if(name == bn::string<64>("castle_novo"))
        return bn::regular_bg_items::castle_novo;
    */
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

    int tile_size = 16;
    int start_x = 0;
    int start_y = 0;

    BN_LOG("bg.has_value() = ", bg.has_value());

    if(!bg)
    {
        BN_LOG("Tentando criar BG...");
        bg = bn::palette_bitmap_bg_ptr::create(bn::palette_bitmap_items::dungeon_tile_set_16_cores.palette_item());
        BN_LOG("bg_manager Criou o Background");
    }
    
    const bn::palette_bitmap_pixels_item& item = bn::palette_bitmap_items::dungeon_tile_set_16_cores.pixels_item();
    BN_LOG("bg_manager Criou o item");

    bn::palette_bitmap_bg_painter painter(*bg);
    BN_LOG("bg_manager Criou o painter");

    painter.clear();
    BN_LOG("bg_manager Limpou o painter");

    int tileset_cols = item.dimensions().width() / tile_size;
    int tileset_rows = item.dimensions().height() / tile_size;
    BN_LOG("Tileset cols:", tileset_cols, "rows:", tileset_rows);

    for(int row = 0; row < tilemap_rows; row++) {
        for(int col = 0; col < tilemap_cols; col++) {
            int value = tile_data[row * tilemap_cols + col];

            if (value == -1)
                continue;

            int roi_x = (value % tileset_cols) * tile_size;
            int roi_y = (value / tileset_cols) * tile_size;

            //Desenhando pixel/tile por paleta
            painter.blit(
                start_x + col * tile_size,                  // posição X na tela
                start_y + row * tile_size,                  // posição Y na tela
                bn::palette_bitmap_roi(                     // BMP
                    item,                                   // image
                    roi_x,                                  // X dentro do tileset (image)
                    roi_y,                                  // Y dentro do tileset (image)
                    tile_size,                              // largura  
                    tile_size                               // altura
                )
            );

            // BN_LOG("bg_manager Tile", row, col, "=", value);
        }
    }

    painter.flip_page_later();
    BN_LOG("Tilemap initialized successfully!");
}

// ----------------- Implementação da classe -----------------

GraphicsManager::GraphicsManager() : sprite_count(0) {}
GraphicsManager::~GraphicsManager() {}

const Scenes* GraphicsManager::initialize()
{
    // CARREGAR BACKGROUND
    // 1. Pega o settings
    const Settings* settings = get_settings();
    if(!settings)
    {
        BN_LOG("Settings não encontrado");
        return nullptr;
    }

    // 2. Busca a cena pelo ID na registry
    const Scenes* scene = get_scene_by_id(settings->start_scene_id);
    if(!scene)
    {
        BN_LOG("Scene não encontrada com ID: ", settings->start_scene_id);
        return nullptr;
    }
    BN_LOG("Scene encontrada: ", scene->name);

    // 3. Busca o recurso de background pelo ID
    const Backgrounds* bg_resource = get_background_by_id(scene->background_id);
    if(!bg_resource)
    {
        BN_LOG("Background não encontrado com ID: ", scene->background_id);
        return scene;
    }
    BN_LOG("Background encontrado: ", bg_resource->name);

    // 4. Cria o background ativo
    // Valida tipo da cena
    bn::string<64> scene_type = scene->scene_type;
    if(scene_type != "Logo") {
        BN_LOG("Nao inserir background em cena diferente de LOGO");
        return scene;
    }

    auto bg_item = get_bg_item_from_name(bg_resource->name);
    if(bg_item.has_value())
    {
        current_bg = bn::regular_bg_ptr::create(bg_item.value());
        current_bg->set_priority(0);

        BN_LOG("Background carregado com sucesso: ", bg_resource->name);
    }
    else
    {
        BN_LOG("Background item não encontrado: ", bg_resource->name);
    }

    return scene;
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
    if(scene_type == "Logo") {
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
    bn::string<64> image_type = scene->tile_image_type;

    // if(image_type == "dp_direct_bitmap_bg") {
        // generate_dp_direct_bitmap_bg_manager(tilemap_rows, tilemap_cols, scene->tile_data);
    // } else {
        generate_palette_bitmap_bg_manager(current_palette_btmp_bg, tilemap_rows, tilemap_cols, scene->tile_data);
    // }

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
