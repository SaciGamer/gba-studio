/**
 * {{PROJECT_NAME}} - GBA Game
 * Author: {{AUTHOR}}
 * Version: {{VERSION}}
 * 
 * Built with GBA Studio engine for Butano
 */

#include "script_command_manager.h"
#include "script_event_handlers.h"
#include "bn_log.h"

// ----------------- Implementação da classe -----------------

ScriptCommand::ScriptCommand() : currentScriptIndex(0) {}
ScriptCommand::~ScriptCommand() {}

void ScriptCommand::execute(bn::string<64> scene_id_param, const ScriptCommandData* data, int count) 
{
    if(!(scene_id_param == this->scene_id)) {
        // BN_LOG(">> ScriptCommand Entrou");
        this->scene_id = scene_id_param;
        ScriptCommand::instance().resetIndex();
    } else {
        // BN_LOG(">> ScriptCommand Não entrou");
        this->scene_id = scene_id_param;
    }

    if(currentScriptIndex >= count) {
        BN_LOG(">> ScriptCommand Finalizado");
        return; // nada para executar
    }

    bool finished = false;

    const ScriptCommandData& current = data[currentScriptIndex];
    bn::string<64> command = current.command;
    auto args = current.args;

    if(command == "EVENT_IF") {
        const bool result = args && IfEventHandler::evaluate(*static_cast<const ScriptConditionData*>(args));
        const int nextIndex = result ? current.nextIndex : current.falseIndex;
        currentScriptIndex = nextIndex >= 0 && nextIndex < count ? nextIndex : count;
        return;
    }

    bool handled = true;
    if(command == "EVENT_FADE_IN" || command == "EVENT_FADE_OUT") {
        finished = FadeEventHandler::execute(command, args);
    } else if(command == "EVENT_WAIT") {
        finished = WaitEventHandler::execute(args);
    } else if(command == "EVENT_CHANGE_SCENE") {
        finished = ChangeSceneEventHandler::execute(args);
    } else if(command == "EVENT_CHANGE_LAYER") {
        finished = ChangeLayerEventHandler::execute(args, this->scene_id);
    } else if(command == "EVENT_VARIABLE" || command == "EVENT_VARIABLE_RESET_ALL") {
        finished = VariableEventHandler::execute(command, args);
    } else {
        handled = false;
    }

    if(finished || !handled) {
        // só avança para o próximo quando o atual terminar
        currentScriptIndex = current.nextIndex >= 0 && current.nextIndex < count
            ? current.nextIndex
            : count;
    }
}
