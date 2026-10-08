#pragma once
#include <cstdlib>
#include "resource_types.h"
#include "script_command_manager.h"
#include <cstdint>
class GraphicsManager {
public:
    const Scenes* current = nullptr;
    const Scenes* destination = nullptr;
    const ScriptCommandData* actor_program = nullptr;
    int actor_count = 0;
    int actor_updates = 0;
    int loads = 0;
    int spawns = 0;
    uint32_t revision = 0;
    static GraphicsManager& instance() { static GraphicsManager value; return value; }
    void initialize() {}
    const Scenes* getScene() const { return current; }
    void setScene(const Scenes* scene) { current = scene; ++revision; }
    uint32_t get_scene_revision() const { return revision; }
    const Scenes* load_next_scene_by_id(const bn::string<64>&) {
        ++loads;
        actor_program = nullptr;
        setScene(destination);
        return current;
    }
    void spawn_player(const Scenes&, int, int, const char*) { ++spawns; }
    void move_player_from_input() {}
    void update_sprites() {}
    int get_player_world_x() const { return 1; }
    int get_player_world_y() const { return 1; }
    bool update_actor_interaction(bool) {
        ++actor_updates;
        if(actor_program) ScriptCommand::instance().execute(current->id, actor_program, actor_count);
        return actor_program != nullptr;
    }
    bool set_actor_visible(const char*, bool) { std::abort(); }
    bool set_all_actors_visible(bool) { std::abort(); }
};
