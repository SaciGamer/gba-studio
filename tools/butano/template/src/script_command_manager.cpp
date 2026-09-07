/**
 * {{PROJECT_NAME}} - GBA Game
 * Author: {{AUTHOR}}
 * Version: {{VERSION}}
 * 
 * Built with GBA Studio engine for Butano
 */

#include "script_command_manager.h"
#include "event_registry.h"
#include "bn_log.h"

// ----------------- Implementação da classe -----------------

ScriptCommand::ScriptCommand() : currentScriptIndex(0) {}
ScriptCommand::~ScriptCommand() {}

void ScriptCommand::execute(bn::string<64> scene_id_param, const ScriptCommandData* data, int count) 
{
    if(scene_id_param != this->scene_id) {
        this->scene_id = scene_id_param;
        ScriptCommand::instance().resetIndex();
    } else {
        this->scene_id = scene_id_param;
    }

    if(currentScriptIndex >= count) {
        // BN_LOG(">> ScriptCommand Finalizado");
        return; // nada para executar
    }

    bool finished = false;

    bn::string<64> command = data[currentScriptIndex].command;
    auto args = data[currentScriptIndex].args;

    if(command == "EVENT_FADE_IN") {
        finished = run_fade(args, FadeType::IN);
    } else if(command == "EVENT_FADE_OUT") {
        finished = run_fade(args, FadeType::OUT);
    } else if(command == "EVENT_WAIT") {
        finished = run_wait(args);
    } else if(command == "EVENT_CHANGE_SCENE") {
        finished = run_change_scene(args);
    } else if(command == "EVENT_CHANGE_LAYER") {
        finished = run_change_layer(args, this->scene_id);
    }

    if(finished) {
        // só avança para o próximo quando o atual terminar
        currentScriptIndex++;
    }
}
