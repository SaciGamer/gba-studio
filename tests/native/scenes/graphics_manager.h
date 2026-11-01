#pragma once
#include <cstdlib>
#include "resource_types.h"
#include "script_command_manager.h"
#include <cstdint>
class GraphicsManager {
public:
    bool write_numeric_actor_property(const char*, int, int) { return false; }
    bool write_numeric_trigger_property(const char*, int, int) { return false; }
    bool set_actor_transform(const char*, int, int, int, int = 0xffffff) { std::abort(); }
    const ScriptTrigger& resolve_script_trigger(int, const ScriptTrigger& source, ScriptTrigger&) const { return source; }
    bool player_overlaps_trigger(const ScriptTrigger& t, int x, int y) const {
        return x < t.x + t.width && x + 1 > t.x && y < t.y + t.height && y + 1 > t.y;
    }
    bool actor_is_facing(const char*, const char*, bool = true, bool = true, int = 0, int = 0) const { return false; }
    void change_default_palettes(const char* const*) { std::abort(); }
    bool set_actor_visual_effect(const char*, int, int, int) { std::abort(); }
    void set_global_sprite_blending() {}
    const Scenes* current = nullptr;
    const Scenes* destination = nullptr;
    const ScriptCommandData* actor_program = nullptr;
    int actor_count = 0;
    int actor_updates = 0;
    int loads = 0;
    int spawns = 0;
    uint32_t revision = 0;
    ScriptTrigger get_script_trigger(int, const ScriptTrigger& source) const { return source; }
    bool show_emote(const char*, const char*, int = 12) { std::abort(); }
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
    void spawn_player(const Scenes&, int, int, const char*, bool = false) { ++spawns; }
    void move_player_from_input() {}
    void update_sprites() {}
    void update_actor_initialization(bool = true) {}
    void update_actor_scripts(bool = true) {}
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
