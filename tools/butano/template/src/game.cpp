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
// #include "bn_scene.h"

/**
 * Game constructor - Initialize game systems
 */
Game::Game() : running(true) {
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
    graphics.initialize();
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

    // Aqui você pode atualizar sprites ou backgrounds
    graphics.update_sprites();
}

/**
 * Main game loop
 */
void Game::run() {
    while (is_running()) {
        // Update game state
        update();

        // Render frame
        render();

        // Sync with VBlank
        bn::core::update();
    }
}
