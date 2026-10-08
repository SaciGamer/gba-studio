#include "save_manager.h"
#include "variable_manager.h"

int main()
{
    const VariableDefinition definitions[] = {
        {"score", VariableType::number, 10, false, ""},
        {"rumble", VariableType::boolean, 0, true, ""},
        {"name", VariableType::string, 0, false, "Pilot"},
    };
    VariableManager::instance().initialize(definitions, 3);
    if(!SaveManager::instance().write(0, "score")) return 1;
    if(!VariableManager::instance().set_number("score", 99)) return 2;
    if(!SaveManager::instance().load(0, "score") || VariableManager::instance().get_number("score") != 10) return 3;
    if(!SaveManager::instance().write(1, "rumble")) return 4;
    if(!VariableManager::instance().set_boolean("rumble", false)) return 5;
    if(!SaveManager::instance().load(1, "rumble") || !VariableManager::instance().get_boolean("rumble")) return 6;
    if(!SaveManager::instance().write(2, "name")) return 7;
    if(!VariableManager::instance().set_string("name", "Other")) return 8;
    if(!SaveManager::instance().load(2, "name")) return 9;
    const char* name = VariableManager::instance().get_string("name");
    if(!name || name[0] != 'P') return 10;
    if(!SaveManager::instance().write_group(4, "score,rumble,name", 7)) return 11;
    if(!VariableManager::instance().set_number("score", 123)) return 12;
    if(!VariableManager::instance().set_boolean("rumble", false)) return 13;
    if(!VariableManager::instance().set_string("name", "Other")) return 14;
    if(!SaveManager::instance().load_group(4, "score,rumble,name", 7)) return 15;
    if(VariableManager::instance().get_number("score") != 10 || !VariableManager::instance().get_boolean("rumble")) return 16;
    name = VariableManager::instance().get_string("name");
    if(!name || name[0] != 'P') return 17;
    if(!SaveManager::instance().load_group(4, "score,rumble,name", 8)) return 18;
    if(SaveManager::instance().load_group(4, "score,rumble,name", 7)) return 19;
    const VariableDefinition reordered[] = {
        {"name", VariableType::string, 0, false, "Pilot"},
        {"score", VariableType::number, 10, false, ""},
        {"rumble", VariableType::boolean, 0, true, ""},
    };
    VariableManager::instance().initialize(reordered, 3);
    if(!SaveManager::instance().load_group(4, "name,score,rumble", 8)) return 20;
    if(VariableManager::instance().get_number("score") != 10 || !VariableManager::instance().get_boolean("rumble")) return 21;
    const VariableDefinition incompatible[] = {
        {"score", VariableType::boolean, 0, false, ""},
        {"rumble", VariableType::boolean, 0, true, ""},
        {"name", VariableType::string, 0, false, "Pilot"},
    };
    VariableManager::instance().initialize(incompatible, 3);
    if(SaveManager::instance().load_group(4, "score,rumble,name", 8)) return 22;
    return 0;
}
