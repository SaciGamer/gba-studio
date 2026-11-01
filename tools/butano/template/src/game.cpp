#include "runtime_monitor.h"
#include "gba_studio_features.h"
#include "numeric_values.h"
#if GBA_STUDIO_FEATURE_SAVE
#include "save_manager.h"
#endif
#if GBA_STUDIO_FEATURE_MOTION
#include "actor_motion_manager.h"
#endif
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
#if GBA_STUDIO_FEATURE_TRIGGERS
#include "script_trigger_manager.h"
#endif
#include "input_manager.h"
#if GBA_STUDIO_FEATURE_COMBAT
#include "combat_manager.h"
#endif
#if GBA_STUDIO_FEATURE_SHOOTER
#include "shooter_kit.h"
#endif
#if GBA_STUDIO_FEATURE_SPAWNER
#include "spawner_timeline_manager.h"
#endif
#if GBA_STUDIO_FEATURE_ACTORS
#include "actor_manager.h"
#endif
#if GBA_STUDIO_FEATURE_AUDIO && !defined(GBA_STUDIO_NATIVE_SCENE_LIFECYCLE)
#include "audio_manager.h"
#endif
#if GBA_STUDIO_FEATURE_DIALOGUE
#include "dialogue_manager.h"
#endif
#include "camera_manager.h"
#if GBA_STUDIO_FEATURE_VARIABLES
#include "variable_manager.h"
#endif
#if GBA_STUDIO_FEATURE_SCENE_CHANGE
#include "event_change_scene.h"
#endif
#if GBA_STUDIO_FEATURE_RUMBLE
#include "rumble_manager.h"
#endif

namespace {
    bool scene_transition_active() {
#if GBA_STUDIO_FEATURE_SCENE_CHANGE
        return changeScene.active;
#else
        return false;
#endif
    }
#if GBA_STUDIO_FEATURE_TRIGGERS
    ScriptTriggerManager trigger_manager;
#endif
    void reset_triggers() {
#if GBA_STUDIO_FEATURE_TRIGGERS
        trigger_manager.reset();
#endif
    }
}

#if GBA_STUDIO_FEATURE_SHOOTER
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

#endif
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
#if GBA_STUDIO_FEATURE_SAVE && !defined(GBA_STUDIO_NATIVE_SCENE_LIFECYCLE)
    SaveManager::instance().game_hooks = {
        [](GameWorldState& state) { return GraphicsManager::instance().capture_game_world(state); },
        [](const GameWorldState& state) { return GraphicsManager::instance().restore_game_world(state); }
    };
#endif
#if GBA_STUDIO_FEATURE_NUMERIC && !defined(GBA_STUDIO_NATIVE_SCENE_LIFECYCLE)
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
        InputManager::instance().configure(settings->input_bindings, settings->input_bindings_count, settings->input_group_masks);
        InputManager::instance().configure_scene_maps(settings->scene_input_maps, settings->scene_input_maps_count);
        const Scenes* input_scene = GraphicsManager::instance().getScene();
        InputManager::instance().set_scene_type(input_scene ? input_scene->scene_type : nullptr);
#if GBA_STUDIO_FEATURE_COMBAT
        CombatManager::instance().configure(settings->combat_config);
#endif
#if GBA_STUDIO_FEATURE_SHOOTER
        ShooterKit::instance().configure(settings->shooter_config);
#endif
    }
    else
    {
#if GBA_STUDIO_FEATURE_COMBAT
        CombatManager::instance().configure(nullptr);
#endif
#if GBA_STUDIO_FEATURE_SHOOTER
        ShooterKit::instance().configure(nullptr);
#endif
    }
#if GBA_STUDIO_FEATURE_SHOOTER
    ShooterKit::instance().set_spawn_callback(dispatch_shooter_spawn);
    ShooterKit::instance().set_clear_enemy_callback(dispatch_shooter_clear_enemy);
#endif
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
#if GBA_STUDIO_FEATURE_SAVE
    ScriptCommand::instance().update_detached_scripts();
#endif
#if GBA_STUDIO_FEATURE_NUMERIC
    ++numeric_frame_count;
#endif
    // TODO: Add game logic
    // - Input handling
    // - Physics
    // - Collision detection
    // - Sound management

    const InputSnapshot input = InputManager::instance().poll();
#if GBA_STUDIO_FEATURE_AUDIO && !defined(GBA_STUDIO_NATIVE_SCENE_LIFECYCLE)
    AudioManager::instance().update();
#endif
    bool dialogue_active = false;
#if GBA_STUDIO_FEATURE_DIALOGUE
    dialogue_active = DialogueManager::instance().is_visible() || DialogueManager::instance().is_choice_visible();
#endif
    bool script_controls_player = false;
#if GBA_STUDIO_FEATURE_MOTION
    script_controls_player = ActorMotionManager::instance().controls_player();
#endif
    bool player_enabled = true;
#if GBA_STUDIO_FEATURE_SHOOTER
    player_enabled = ShooterKit::instance().player_enabled();
#endif
    if(!dialogue_active && player_enabled && !script_controls_player) GraphicsManager::instance().move_player_from_input();
    CameraManager::instance().update();

    // - Scripts OnInit
    const Scenes* scene = GraphicsManager::instance().getScene();
    if(!scene)
    {
        BN_LOG("..: No current scene; skipping scripts");
        return;
    }
    const uint32_t scene_revision = GraphicsManager::instance().get_scene_revision();
#if GBA_STUDIO_FEATURE_SHOOTER || GBA_STUDIO_FEATURE_SPAWNER
    if(shooter_scene_revision != scene_revision)
    {
#if GBA_STUDIO_FEATURE_SHOOTER
        ShooterKit::instance().stop();
#endif
#if GBA_STUDIO_FEATURE_SPAWNER
        SpawnerTimelineManager::instance().configure(scene->spawner_timelines, scene->spawner_timelines_count);
#endif
        shooter_scene_revision = scene_revision;
    }
#endif
    const bool transition_was_active = scene_transition_active();

#if GBA_STUDIO_FEATURE_SCRIPTS
    const int count = scene->onInitCount;
    // BN_LOG("..: Scene scripts: ", count, " ptr: ", scene->onInitScripts);

    bool scene_init_complete = true;
    if(scene && scene->onInitScripts && count > 0) {
        // scripts.execute(*scene->onInitScripts[currentScriptIndex], count); // processar por index
        scene_init_complete = ScriptCommand::instance().execute(scene->id, scene->onInitScripts, count); // caso precise processar tudo de uma vez
    }
    if(GraphicsManager::instance().get_scene_revision() == scene_revision && !scene_transition_active()) {
        GraphicsManager::instance().update_actor_initialization(scene_init_complete);
        if(GraphicsManager::instance().get_scene_revision() == scene_revision)
            GraphicsManager::instance().update_actor_scripts(scene_init_complete);
    }
#endif
    // A transition can begin in OnInit, and can load a new scene while the
    // cooperative event resumes. Do not run source-scene input, interactions,
    // triggers or button bindings after either transition point.
    if((scene_transition_active() && !transition_was_active) || GraphicsManager::instance().get_scene_revision() != scene_revision)
    {
        if(GraphicsManager::instance().get_scene_revision() != scene_revision)
            reset_triggers();
        return;
    }
#if GBA_STUDIO_FEATURE_SCRIPTS
    if(scene_transition_active() && ScriptCommand::instance().button_scene_transition_running(scene->id))
    {
        // A button-attached Change Scene owns a cooperative fade. Keep its
        // running instance alive during the transition without starting new
        // bindings or running source-scene input and trigger actions.
        ScriptCommand::instance().update_button_bindings(scene->id, false);
        if(GraphicsManager::instance().get_scene_revision() != scene_revision)
            reset_triggers();
        return;
    }
#endif
#if GBA_STUDIO_FEATURE_SHOOTER
    ShooterKit::instance().update();
#endif
#if GBA_STUDIO_FEATURE_RUMBLE
    RumbleManager::instance().update();
#endif
#if GBA_STUDIO_FEATURE_SHOOTER
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
#endif
#if GBA_STUDIO_FEATURE_DIALOGUE
    if(DialogueManager::instance().is_choice_visible())
    {
        if(input.up_pressed) DialogueManager::instance().move_choice(0, -1);
        else if(input.down_pressed) DialogueManager::instance().move_choice(0, 1);
        else if(InputManager::instance().pressed("move_left")) DialogueManager::instance().move_choice(-1, 0);
        else if(InputManager::instance().pressed("move_right")) DialogueManager::instance().move_choice(1, 0);
        if(input.input_pressed) DialogueManager::instance().cancel_choice();
    }
    if(input.interact_pressed)
    {
        if(DialogueManager::instance().is_choice_visible()) DialogueManager::instance().acknowledge_choice();
        else DialogueManager::instance().acknowledge();
    }
#endif
    GraphicsManager::instance().update_actor_interaction(dialogue_active ? false : input.interact_pressed);
    if((scene_transition_active() && !transition_was_active) || GraphicsManager::instance().get_scene_revision() != scene_revision)
    {
        if(GraphicsManager::instance().get_scene_revision() != scene_revision)
            reset_triggers();
        return;
    }
#if GBA_STUDIO_FEATURE_TRIGGERS
    trigger_manager.update(*scene,
        GraphicsManager::instance().get_player_world_x(),
        GraphicsManager::instance().get_player_world_y(),
        dialogue_active ? false : input.interact_pressed,
        dialogue_active ? false : input.input_pressed,
        dialogue_active ? false : input.touch_active);
#endif
    // Button-attached scripts run after the frame's default input actions.
    if(scene_transition_active() || GraphicsManager::instance().get_scene_revision() != scene_revision)
    {
        if(GraphicsManager::instance().get_scene_revision() != scene_revision)
            reset_triggers();
        return;
    }
#if GBA_STUDIO_FEATURE_SCRIPTS
    ScriptCommand::instance().update_button_bindings(scene->id);
#endif

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
#if GBA_STUDIO_FEATURE_SHOOTER && !defined(GBA_STUDIO_NATIVE_SCENE_LIFECYCLE)
    const Settings* settings = get_settings();
    GraphicsManager::instance().sync_shooter_projectiles(
        ShooterKit::instance(), settings && settings->shooter_config ? settings->shooter_config->projectile_sprite_id : nullptr);
    GraphicsManager::instance().sync_shooter_drops(ShooterKit::instance());
    GraphicsManager::instance().sync_shooter_hud(ShooterKit::instance());
#endif
    GraphicsManager::instance().update_sprites();
#if GBA_STUDIO_FEATURE_DIALOGUE
    DialogueManager::instance().render();
#endif
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
