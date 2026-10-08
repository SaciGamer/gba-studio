#include "runtime_monitor.h"
#include "numeric_values.h"
#include "actor_motion_manager.h"
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
#include "combat_manager.h"
#include "shooter_kit.h"
#include "actor_manager.h"
#ifndef GBA_STUDIO_NATIVE_SCENE_LIFECYCLE
#include "audio_manager.h"
#endif
#include "dialogue_manager.h"
#include "camera_manager.h"
#include "variable_manager.h"
#include "event_change_scene.h"
#include "rumble_manager.h"

namespace { ScriptTriggerManager trigger_manager; }

namespace
{
    bool dispatch_shooter_spawn(const SpawnerTimelineEntry& entry)
    {
        if(!entry.archetype_id) return false;
#ifdef GBA_STUDIO_NATIVE_SCENE_LIFECYCLE
        return ActorManager::instance().spawn(bn::string<64>(entry.archetype_id), entry.x, entry.y).slot >= 0;
#else
        // The graphics manager resolves the archetype to its sprite resource
        // and keeps the visual actor and logical ActorManager slot together.
        return GraphicsManager::instance().spawn_actor(entry.archetype_id, entry.x, entry.y);
#endif
    }

    void dispatch_shooter_clear_enemy(const char* archetype_id)
    {
        if(!archetype_id) return;
#ifndef GBA_STUDIO_NATIVE_SCENE_LIFECYCLE
        GraphicsManager::instance().remove_actor(archetype_id);
#endif
        ActorManager::instance().remove_by_id(bn::string<64>(archetype_id));
    }
}

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
#ifndef GBA_STUDIO_NATIVE_SCENE_LIFECYCLE
    configure_numeric_runtime();
#endif

    // show_start_screen();
    start_screen_anim();
    // play_startup_animation();
    
    // Initialize display
    // bn::display::set_mode(bn::display::mode::MODE_0);

    // bn::bg_palettes::set_transparent_color(bn::color(16, 16, 16));

    // Configure the colour for subsequent scene transitions after startup.
    initialize();
    if(const Settings* settings = get_settings())
    {
        InputManager::instance().configure(settings->input_bindings, settings->input_bindings_count);
        CombatManager::instance().configure(settings->combat_config);
        ShooterKit::instance().configure(settings->shooter_config);
    }
    else
    {
        CombatManager::instance().configure(nullptr);
        ShooterKit::instance().configure(nullptr);
    }
    ShooterKit::instance().set_spawn_callback(dispatch_shooter_spawn);
    ShooterKit::instance().set_clear_enemy_callback(dispatch_shooter_clear_enemy);
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
    ++numeric_frame_count;
    // TODO: Add game logic
    // - Input handling
    // - Physics
    // - Collision detection
    // - Sound management

    const InputSnapshot input = InputManager::instance().poll();
#ifndef GBA_STUDIO_NATIVE_SCENE_LIFECYCLE
    AudioManager::instance().update();
#endif
    const bool dialogue_active = DialogueManager::instance().is_visible() || DialogueManager::instance().is_choice_visible();
    if(!dialogue_active && ShooterKit::instance().player_enabled() && !ActorMotionManager::instance().controls_player()) GraphicsManager::instance().move_player_from_input();
    CameraManager::instance().update();

    // - Scripts OnInit
    const Scenes* scene = GraphicsManager::instance().getScene();
    if(!scene)
    {
        BN_LOG("..: No current scene; skipping scripts");
        return;
    }
    const uint32_t scene_revision = GraphicsManager::instance().get_scene_revision();
    if(shooter_scene_revision != scene_revision)
    {
        ShooterKit::instance().stop();
        SpawnerTimelineManager::instance().configure(scene->spawner_timelines, scene->spawner_timelines_count);
        shooter_scene_revision = scene_revision;
    }
    const bool transition_was_active = changeScene.active;

    const int count = scene->onInitCount;
    // BN_LOG("..: Scene scripts: ", count, " ptr: ", scene->onInitScripts);

    if(scene && scene->onInitScripts && count > 0) {
        // scripts.execute(*scene->onInitScripts[currentScriptIndex], count); // processar por index
        ScriptCommand::instance().execute(scene->id, scene->onInitScripts, count); // caso precise processar tudo de uma vez
    }
    // A transition can begin in OnInit, and can load a new scene while the
    // cooperative event resumes. Do not run source-scene input, interactions,
    // triggers or button bindings after either transition point.
    if((changeScene.active && !transition_was_active) || GraphicsManager::instance().get_scene_revision() != scene_revision)
    {
        if(GraphicsManager::instance().get_scene_revision() != scene_revision)
            trigger_manager.reset();
        return;
    }
    if(changeScene.active && ScriptCommand::instance().button_scene_transition_running(scene->id))
    {
        // A button-attached Change Scene owns a cooperative fade. Keep its
        // running instance alive during the transition without starting new
        // bindings or running source-scene input and trigger actions.
        ScriptCommand::instance().update_button_bindings(scene->id, false);
        if(GraphicsManager::instance().get_scene_revision() != scene_revision)
            trigger_manager.reset();
        return;
    }
    ShooterKit::instance().update();
    RumbleManager::instance().update();
    if(!dialogue_active && ShooterKit::instance().running())
        ShooterKit::instance().update_player(InputManager::instance().held("shoot"),
            GraphicsManager::instance().get_player_world_x(), GraphicsManager::instance().get_player_world_y());
    ShooterHit shooter_hit{};
    while(ShooterKit::instance().poll_hit(shooter_hit))
    {
        if(shooter_hit.defeated && shooter_hit.archetype_id)
        {
#ifndef GBA_STUDIO_NATIVE_SCENE_LIFECYCLE
            GraphicsManager::instance().remove_actor(shooter_hit.archetype_id);
#endif
            ActorManager::instance().remove_by_id(bn::string<64>(shooter_hit.archetype_id));
        }
    }
    if(DialogueManager::instance().is_choice_visible())
    {
        if(input.up_pressed) DialogueManager::instance().cycle_choice(-1);
        else if(input.down_pressed) DialogueManager::instance().cycle_choice(1);
    }
    if(input.interact_pressed)
    {
        if(DialogueManager::instance().is_choice_visible()) DialogueManager::instance().acknowledge_choice();
        else DialogueManager::instance().acknowledge();
    }
    GraphicsManager::instance().update_actor_interaction(dialogue_active ? false : input.interact_pressed);
    if((changeScene.active && !transition_was_active) || GraphicsManager::instance().get_scene_revision() != scene_revision)
    {
        if(GraphicsManager::instance().get_scene_revision() != scene_revision)
            trigger_manager.reset();
        return;
    }
    trigger_manager.update(*scene,
        GraphicsManager::instance().get_player_world_x(),
        GraphicsManager::instance().get_player_world_y(),
        dialogue_active ? false : input.interact_pressed,
        dialogue_active ? false : input.input_pressed,
        dialogue_active ? false : input.touch_active);
    // Button-attached scripts run after the frame's default input actions.
    if(changeScene.active || GraphicsManager::instance().get_scene_revision() != scene_revision)
    {
        if(GraphicsManager::instance().get_scene_revision() != scene_revision)
            trigger_manager.reset();
        return;
    }
    ScriptCommand::instance().update_button_bindings(scene->id);

    // For now, just check quit button
    if (InputManager::instance().pressed("menu")) {
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
#ifndef GBA_STUDIO_NATIVE_SCENE_LIFECYCLE
    const Settings* settings = get_settings();
    GraphicsManager::instance().sync_shooter_projectiles(
        ShooterKit::instance(), settings && settings->shooter_config ? settings->shooter_config->projectile_sprite_id : nullptr);
    GraphicsManager::instance().sync_shooter_drops(ShooterKit::instance());
    GraphicsManager::instance().sync_shooter_hud(ShooterKit::instance());
#endif
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
        RuntimeMonitor::sample();

        // Render frame
        render();
        RuntimeMonitor::update();

        // Sync with VBlank
        bn::core::update();
    }
}
