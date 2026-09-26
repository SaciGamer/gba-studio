/**
 * {{PROJECT_NAME}} - GBA Game
 * Author: {{AUTHOR}}
 * Version: {{VERSION}}
 * 
 * Built with GBA Studio engine for Butano
 */

#include "game.h"
#include "bn_core.h"
#include "bn_display.h"
#include "bn_keypad.h"
#include "bn_log.h"
#include "bn_bg_palettes.h"
#include "bn_blending.h"
// #include "bn_scene.h"
#include "startup.h"
#include "resource_registry.h"
#include "event_fade.h"
#include "script_trigger_manager.h"
#include "input_manager.h"
#include "dialogue_manager.h"
#include "camera_manager.h"
#include "variable_manager.h"

namespace { ScriptTriggerManager trigger_manager; }

namespace
{
    void configure_fade_options(const Settings* settings)
    {
        if(!settings)
        {
            return;
        }

        // Fade Options defines the global fade colour, so scene events use
        // the same white or black transition selected in the IDE.
        if(settings->fade_direction == 0)
        {
            bn::blending::set_white_fade_color();
        }
        else
        {
            bn::blending::set_black_fade_color();
        }
        // The startup animation ends fully faded out. Keep that alpha so the
        // first scene is only revealed by an explicit Fade In event.
    }
}

/**
 * Game constructor - Initialize game systems
 */
Game::Game() : running(true) {
    BN_LOG("..: Game inicializando :..");

    // Initialize Butano
    bn::core::init();

    // show_start_screen();
    start_screen_anim();
    // play_startup_animation();
    
    // Initialize display
    // bn::display::set_mode(bn::display::mode::MODE_0);

    // bn::bg_palettes::set_transparent_color(bn::color(16, 16, 16));

    // Configure the colour for subsequent scene transitions after startup.
    initialize();
    configure_fade_options(get_settings());
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
    GraphicsManager::instance().initialize();
    initialize_variables();
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

    const InputSnapshot input = InputManager::instance().poll();
    const bool dialogue_active = DialogueManager::instance().is_visible() || DialogueManager::instance().is_choice_visible();
    if(!dialogue_active) GraphicsManager::instance().move_player_from_input();
    CameraManager::instance().update();

    // - Scripts OnInit
    const Scenes* scene = GraphicsManager::instance().getScene();
    if(!scene)
    {
        BN_LOG("..: No current scene; skipping scripts");
        return;
    }

    const int count = scene->onInitCount;
    // BN_LOG("..: Scene scripts: ", count, " ptr: ", scene->onInitScripts);

    if(scene && scene->onInitScripts && count > 0) {
        // scripts.execute(*scene->onInitScripts[currentScriptIndex], count); // processar por index
        ScriptCommand::instance().execute(scene->id, scene->onInitScripts, count); // caso precise processar tudo de uma vez
    }
    if((input.up_pressed || input.down_pressed) && DialogueManager::instance().is_choice_visible()) DialogueManager::instance().cycle_choice();
    if(input.interact_pressed)
    {
        if(DialogueManager::instance().is_choice_visible()) DialogueManager::instance().acknowledge_choice();
        else DialogueManager::instance().acknowledge();
    }
    GraphicsManager::instance().update_actor_interaction(dialogue_active ? false : input.interact_pressed);
    trigger_manager.update(*scene,
        GraphicsManager::instance().get_player_world_x(),
        GraphicsManager::instance().get_player_world_y(),
        dialogue_active ? false : input.interact_pressed,
        dialogue_active ? false : input.input_pressed,
        dialogue_active ? false : input.touch_active);
    // Button-attached scripts run after the frame's default input actions.
    ScriptCommand::instance().update_button_bindings(scene->id);

    // For now, just check quit button
    if (!InputManager::instance().is_overridden("SELECT") && bn::keypad::select_pressed()) {
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
    GraphicsManager::instance().update_sprites();
    DialogueManager::instance().render();
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
