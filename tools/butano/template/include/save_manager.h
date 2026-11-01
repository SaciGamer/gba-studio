#ifndef SAVE_MANAGER_H
#define SAVE_MANAGER_H

#include "resource_types.h"
#include "game_save_state.h"

class SaveManager
{
public:
    static SaveManager& instance();
    bool write(int slot, const char* variable_id);
    bool load(int slot, const char* variable_id);
    bool write_group(int slot, const char* variable_ids, int schema = 1);
    bool load_group(int slot, const char* variable_ids, int schema = 1);
    GameSaveHooks game_hooks;
    bool save_variables(int slot, const char* const* ids, int count, bool all);
    bool load_variables(int slot, const char* const* ids, int count, bool all);
    bool save_game(int slot, uint32_t save_point = 0, uint32_t self_actor = 0);
    bool load_game(int slot);
    bool remove_game(int slot);
    bool has_game(int slot);
    int last_operation = 0; // 0: none, 1: saved, 2: loaded, 3: removed
    uint32_t loaded_save_point = 0;
    uint32_t loaded_self_actor = 0;
};

#endif
