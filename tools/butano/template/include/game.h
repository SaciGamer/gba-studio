#ifndef {{PROJECT_NAME_UPPER}}_GAME_H
#define {{PROJECT_NAME_UPPER}}_GAME_H

#include "graphics_manager.h"
#include "gba_studio_features.h"
#if GBA_STUDIO_FEATURE_SCRIPTS
#include "script_command_manager.h"
#endif
#include <cstdint>

/**
 * Main Game class for {{PROJECT_NAME}}
 * Manages game state, logic and rendering
 */
class Game {
private:
    bool running;
#if GBA_STUDIO_FEATURE_SHOOTER || GBA_STUDIO_FEATURE_SPAWNER
    uint32_t shooter_scene_revision = 0;
#endif
    // bn::scene::status status;

public:
    /**
     * Constructor - Initialize game
     */
    Game();

    /**
     * Destructor
     */
    ~Game();

    /**
     * Initialize game resources
     */
    void initialize();

    /**
     * Update game state
     */
    void update();

    /**
     * Render frame
     */
    void render();

    /**
     * Main game loop
     */
    void run();

    /**
     * Check if game is still running
     */
    bool is_running() const { return running; }

    /**
     * Quit game
     */
    void quit() { running = false; }
};

#endif // {{PROJECT_NAME_UPPER}}_GAME_H
