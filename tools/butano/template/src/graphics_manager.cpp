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

bn::optional<bn::direct_bitmap_item> get_bitmap_bg_item_from_name(const bn::string<64>& name)
{
    BN_LOG("..: get_bitmap_bg_item_from_name, name:", name.data(), ":..");

    {{BITMAP_BACKGROUND_CONDITIONALS_FROM_NAME}}
    /* Exemplo:
    if(name == bn::string<64>("logo_bg"))
        return bn::direct_bitmap_items::logo_bg;
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

GraphicsManager::GraphicsManager() : sprite_count(0) {}
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

    // 2. Busca a cena pelo ID na registry
    const Scenes* scene = get_scene_by_id(settings->start_scene_id);
    if(!scene)
    {
        BN_LOG("Scene não encontrada com ID: ", settings->start_scene_id);
        return nullptr;
    }
    BN_LOG("Scene encontrada: ", scene->name);

    return scene;
}

void GraphicsManager::render_scene_regular_bg(const Scenes& scene) 
{
    // Limpa backgrounds ativos
    current_bgs.clear();
    current_bitmap_bgs.reset();

    BN_LOG("..: render_scene :..");
    for(int i = 0; i < scene.backgrounds_layers_size; i++)
    {
        const SceneLayer& layer = scene.backgrounds_layers[i];

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
                // bg_ptr.set_priority(layer.layerId); // ordem padrão
                // inverter ordem de exibição
                int priority = scene.backgrounds_layers_size - 1 - layer.layerId;
                // fica sempre em uma camada valida
                priority = bn::clamp(priority, 0, 3);
                bg_ptr.set_priority(priority);

                current_bgs.push_back(bg_ptr);

                BN_LOG("Background carregado com sucesso: ", bg_resource->name);
            }
            else
            {
                BN_LOG("Background item não encontrado: ", bg_resource->name);
            }
        }
    }
}

void GraphicsManager::render_scene_bitmap_bg(const Scenes& scene)
{
    // Limpa backgrounds ativos
    current_bgs.clear();
    current_bitmap_bgs.reset();

    BN_LOG("..: render_scene :..");

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
                bmp_bg.set_priority(2);

                // Usa o painter para desenhar a imagem dentro do BG
                bn::sp_direct_bitmap_bg_painter painter(bmp_bg);
                
                bn::size s = bmp_bg_item.value().dimensions();
                int x = (240 - s.width()) / 2;
                int y = (160 - s.height()) / 2;

                painter.blit(x, y, bmp_bg_item.value());

                // Guarda no current_bitmap_bg
                current_bitmap_bgs = bmp_bg;

                BN_LOG("Bitmap BG carregado com sucesso: ", bg_resource->name);
                break;
            }
            else
            {
                BN_LOG("Bitmap BG item não encontrado: ", bg_resource->name);
            }
        }
    }
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
