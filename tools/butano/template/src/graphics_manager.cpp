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

#include "graphics_manager.h"

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

    return GraphicsManager::load_next_scene_by_id(settings->start_scene_id);
}

void GraphicsManager::init_bg_slots()
{
    current_bgs.clear();
    current_bgs_id.clear();
    for(int i = 0; i < 4; i++)
    {
        current_bgs.push_back(bn::optional<bn::regular_bg_ptr>());
        current_bgs_id.push_back(bn::string<64>());
    }
}


void GraphicsManager::render_scene_regular_bg(const Scenes& scene) 
{
    // Limpa backgrounds ativos
    current_bgs.clear();
    current_bitmap_bgs.reset();
    current_bgs_id.clear();

    bn::core::update();  

    GraphicsManager::init_bg_slots();

    BN_LOG("..: render_scene_regular_bg :..");
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
                // bg_ptr.set_priority(priority); // reservar prioridade para ser setada pelo usuário!
                bg_ptr.set_z_order(priority);
                bg_ptr.set_blending_enabled(true);

                current_bgs[layer.layerId] = bg_ptr;
                current_bgs_id[layer.layerId] = layer.backgroundId;

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
            // current_bgs_id[layer.layerId] = bn::string<64>();
            current_bgs_id.push_back(bn::string<64>());
        }
    }
}

void GraphicsManager::render_scene_bitmap_bg(const Scenes& scene)
{
    // Limpa backgrounds ativos
    current_bgs.clear();
    current_bitmap_bgs.reset();
    current_bgs_id.clear();

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
                
                bn::size s = bmp_bg_item.value().dimensions();
                int x = (240 - s.width()) / 2;
                int y = (160 - s.height()) / 2;

                painter.fill(bn::color(0, 0, 0));  // limpa tudo com preto
                painter.blit(x, y, bmp_bg_item.value());

                // Guarda no current_bitmap_bg
                current_bitmap_bgs = bmp_bg;
                current_bgs_id.push_back(layer.backgroundId);

                BN_LOG("Bitmap BG carregado com sucesso: ", bg_resource->name);
                continue;
            }
            else
            {
                BN_LOG("Bitmap BG item não encontrado: ", bg_resource->name);
            }
        }
        current_bgs_id.push_back(bn::string<64>());
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
            if(i < current_bgs[i].has_value() && !current_bgs_id[i].empty())
            {
                if(current_bgs_id[i] == layer.background_id)
                {
                    BN_LOG("..: Regular BG já existe :..");
                    // Mesmo ID → só atualiza propriedades
                    current_bgs[i]->set_visible(layer.visible);
                    int priority = changeLayer.size() - 1 - layer.layer_id;

                    current_bgs[i]->set_z_order(bn::clamp(priority, 0, 3));
                    result.push_back(current_bgs[i].value());

                    BN_LOG("Regular BG atualizado: ", bg_resource->name);
                }
                else
                {
                    // ID diferente → substitui imagem
                    BN_LOG("..: Regular BG substituindo imagem :..");
                    current_bgs[i].reset();

                    auto bg_ptr = bn::regular_bg_ptr::create(bg_item.value());
                    int priority = changeLayer.size() - 1 - layer.layer_id;
                    bg_ptr.set_z_order(bn::clamp(priority, 0, 3));
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
                int priority = changeLayer.size() - 1 - layer.layer_id;
                bg_ptr.set_z_order(bn::clamp(priority, 0, 3));
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
                current_bgs_id[i] = layer.background_id;
                result.push_back(bg_ptr);

                BN_LOG("Regular BG criado: ", bg_resource->name);
            }
        }
        else
        {
            // Se não há background_id, limpa posição
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
                    bn::size s = bmp_bg_item.value().dimensions();
                    int x = (240 - s.width()) / 2;
                    int y = (160 - s.height()) / 2;

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
                bn::size s = bmp_bg_item.value().dimensions();
                int x = (240 - s.width()) / 2;
                int y = (160 - s.height()) / 2;

                painter.fill(bn::color(0, 0, 0));
                painter.blit(x, y, bmp_bg_item.value());

                bmp_bg.set_visible(layer.visible);

                current_bitmap_bgs = bmp_bg;
                current_bgs_id[i] = layer.background_id;

                BN_LOG("Bitmap BG criado: ", bg_resource->name);
                return current_bitmap_bgs;
            }
        }

        current_bgs_id[i] = bn::string<64>();
        BN_LOG("Bitmap BG ID: ", i, current_bgs_id[i].data());

    }

    return bn::optional<bn::sp_direct_bitmap_bg_ptr>();
}

void GraphicsManager::change_layer(const bn::vector<LayerArgs, 4>& changeLayer) {
    bn::string<64> scene_type = currentScene->scene_type;
    BN_LOG("[change_layer] Scene type: ", scene_type.data());
    if(scene_type != "Logo" && scene_type != "Point Click") {
        BN_LOG("[change_layer] Renderizando cena com REGULAR BG");
        GraphicsManager::load_next_regular_background_by_id(changeLayer);
    } else {
        BN_LOG("[change_layer] Renderizando cena com BITMAP BG");
        GraphicsManager::load_next_bitmap_background_by_id(changeLayer);
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
        BN_LOG("loadNextSceneById - Scene: ", scene->name);
        BN_LOG("loadNextSceneById - Scene não encontrada com ID: ", scene->id);
        return nullptr;
    }
    BN_LOG("loadNextSceneById - Scene encontrada: ", scene->name);

    // Setar a currente scene para conseguir ser usada as funções
    setScene(scene);
    
    // 3. Valida tipo da cena
    bn::string<64> scene_type = scene->scene_type;
    BN_LOG("..: Scene type: ", scene_type.data());
    if(scene_type != "Logo" && scene_type != "Point Click") {
        // 4. Renderiza cena
        BN_LOG("[load_next_scene_by_id] Renderizando cena com REGULAR BG");
        GraphicsManager::render_scene_regular_bg(*scene);
    } else {
        BN_LOG("[load_next_scene_by_id] Renderizando cena com BITMAP BG");
        // 5. Renderiza cena
        GraphicsManager::render_scene_bitmap_bg(*scene);
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
