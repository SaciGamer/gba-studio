#ifndef SAVE_MANAGER_H
#define SAVE_MANAGER_H

#include "resource_types.h"

class SaveManager
{
public:
    static SaveManager& instance();
    bool write(int slot, const char* variable_id);
    bool load(int slot, const char* variable_id);
    bool write_group(int slot, const char* variable_ids, int schema = 1);
    bool load_group(int slot, const char* variable_ids, int schema = 1);
};

#endif
