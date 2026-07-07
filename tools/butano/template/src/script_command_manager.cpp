#include "script_command_manager.h"
#include "event_registry.h"
#include "bn_log.h"

// ----------------- Implementação da classe -----------------

ScriptCommand::ScriptCommand() : currentScriptIndex(0) {}
ScriptCommand::~ScriptCommand() {}

void ScriptCommand::execute(bn::string<64> scene_id, const ScriptCommandData* data, int count) 
{
    
    if(scene_id != this->scene_id) {
        this->scene_id = scene_id;
        ScriptCommand::instance().resetIndex();
    } else {
        this->scene_id = scene_id;
    }

    if(currentScriptIndex >= count) {
        // BN_LOG(">> ScriptCommand Finalizado");
        return; // nada para executar
    }

    bool finished = false;

    bn::string<64> command = data[currentScriptIndex].command;
    auto args = data[currentScriptIndex].args;

    if(command == "EVENT_FADE_IN") {
        finished = runFade(args, FadeType::IN);
    } else if(command == "EVENT_FADE_OUT") {
        finished = runFade(args, FadeType::OUT);
    } else if(command == "EVENT_WAIT") {
        finished = runWait(args);
    } else if(command == "EVENT_CHANGE_SCENE") {
        finished = runChangeScene(args);
    }

    if(finished) {
        // só avança para o próximo quando o atual terminar
        currentScriptIndex++;
    }
}
