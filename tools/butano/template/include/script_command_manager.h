#ifndef SCRIPT_COMMAND_GAME_H
#define SCRIPT_COMMAND_GAME_H

#include <string>
#include "bn_string.h"

#include "resource_types.h"

/**
 * ScriptCommand Manager for {{PROJECT_NAME}}
 * Scripts state and logic
 */
class ScriptCommand {
private:
    // ScriptCommandData data;
    bn::string<64> scene_id;
    int currentScriptIndex = 0;
public:
    // ScriptCommand(const ScriptCommandData& data);
    static ScriptCommand& instance() {
        static ScriptCommand sc;
        return sc;
    }

    ScriptCommand();
    ~ScriptCommand();

    /**
     * Execute script command data
     */
    void execute(bn::string<64> scene_id, const ScriptCommandData* data, int count);  // executa o comando

    void resetIndex() { currentScriptIndex = 0; }
};

#endif // SCRIPT_COMMAND_GAME_H
