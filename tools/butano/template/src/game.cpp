/**
 * {{PROJECT_NAME}} - GBA Game
 * Author: {{AUTHOR}}
 * Version: {{VERSION}}
 * 
 * Built with Butano engine for GBA
 */

#include "game.h"
#include "bn_core.h"
#include "bn_display.h"
#include "bn_keypad.h"
#include "bn_log.h"
// #include "bn_scene.h"

/**
 * Game constructor - Initialize game systems
 */
Game::Game() : running(true) {
    BN_LOG("..: Game inicializando :..");

    // Initialize Butano
    bn::core::init();
    
    // Initialize display
    // bn::display::set_mode(bn::display::mode::MODE_0);
    
    // Call user initialization
    initialize();
}

/**
 * Game destructor
 */
Game::~Game() {
    // Cleanup resources
    bn::core::reset();
}

/**
 * Initialize game resources and state
 * Override this in derived classes or implementation
 */
void Game::initialize() {
    // - Load sprites
    // - Load backgrounds
    // - Initialize sounds
    // - Setup scene
    
    
    // Inicializa gráficos e carrega o background inicial
    const Scenes* scene = graphics.initialize();
    
    // 3. Valida tipo da cena
    bn::string<64> scene_type = scene->scene_type;
    BN_LOG("Scene type: ", scene_type.data());
    if(scene_type != "Logo" && scene_type != "Point Click") {
        // 4. Renderiza cena
        BN_LOG("Renderizando cena com REGULAR BG");
        graphics.render_scene_regular_bg(*scene);
    } else {
        BN_LOG("Renderizando cena com BITMAP BG");
        // 5. Renderiza cena
        graphics.render_scene_bitmap_bg(*scene);
    }

    // 6. Desenha tiles
    graphics.initialize_tilemap(scene);
}

/**
 * Update game logic each frame
 */
void Game::update() {
    // TODO: Add game logic
    // - Input handling
    // - Physics
    // - Collision detection
    // - Sound management

    // For now, just check quit button
    if (bn::keypad::select_pressed()) {
        quit();
    }
}

/**
 * Render frame
 */
void Game::render() {
    // - Sprite updates
    // - Background scrolling
    // - UI rendering

    // Aqui atualiza sprites ou backgrounds
    graphics.update_sprites();
}

/**
 * Main game loop
 */
void Game::run() {
    BN_LOG("..: Game RUN :..");

    while (is_running()) {
        // Update game state
        update();

        // Render frame
        render();

        // Sync with VBlank
        bn::core::update();
    }
}
