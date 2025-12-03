#ifndef {{PROJECT_NAME_UPPER}}_GAME_H
#define {{PROJECT_NAME_UPPER}}_GAME_H

#include "graphics_manager.h"

/**
 * Main Game class for {{PROJECT_NAME}}
 * Manages game state, logic and rendering
 */
class Game {
private:
    bool running;
    GraphicsManager graphics;
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
