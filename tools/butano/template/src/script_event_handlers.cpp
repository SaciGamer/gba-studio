#include "script_event_handlers.h"

#include "config_variables.h"
#include "event_change_layer.h"
#include "event_change_scene.h"
#include "event_fade.h"
#include "event_wait.h"
#include "variable_manager.h"

static int conditionValue(const ScriptValueData& value)
{
    if(value.is_variable)
    {
        if(value.type == VariableType::number) return VariableManager::instance().get_number(value.variable_id);
        if(value.type == VariableType::boolean) return VariableManager::instance().get_boolean(value.variable_id) ? 1 : 0;
        return VariableManager::instance().get_string(value.variable_id)[0] != '\0';
    }

    if(value.type == VariableType::boolean) return value.boolean_value ? 1 : 0;
    if(value.type == VariableType::string) return value.string_value && value.string_value[0] != '\0';
    return value.number_value;
}

bool IfEventHandler::evaluate(const ScriptConditionData& condition)
{
    const bn::string<3> operation(condition.operation ? condition.operation : "");

    if(condition.left.type == VariableType::string || condition.right.type == VariableType::string)
    {
        const bn::string<64> left = condition.left.is_variable
            ? bn::string<64>(VariableManager::instance().get_string(condition.left.variable_id))
            : bn::string<64>(condition.left.string_value ? condition.left.string_value : "");
        const bn::string<64> right = condition.right.is_variable
            ? bn::string<64>(VariableManager::instance().get_string(condition.right.variable_id))
            : bn::string<64>(condition.right.string_value ? condition.right.string_value : "");

        if(operation == "==") return left == right;
        if(operation == "!=") return !(left == right);
        if(operation == ">") return left > right;
        if(operation == ">=") return left >= right;
        if(operation == "<") return left < right;
        return left <= right;
    }

    const int left = conditionValue(condition.left);
    const int right = conditionValue(condition.right);
    if(operation == "==") return left == right;
    if(operation == "!=") return left != right;
    if(operation == ">") return left > right;
    if(operation == ">=") return left >= right;
    if(operation == "<") return left < right;
    return left <= right;
}

bool FadeEventHandler::execute(const bn::string<64>& command, const void* args)
{
    return run_fade(args, command == "EVENT_FADE_IN" ? FadeType::IN : FadeType::OUT);
}

bool WaitEventHandler::execute(const void* args)
{
    return run_wait(args);
}

bool ChangeSceneEventHandler::execute(const void* args)
{
    return run_change_scene(args);
}

bool ChangeLayerEventHandler::execute(const void* args, const bn::string<64>& sceneId)
{
    return run_change_layer(args, sceneId);
}

bool VariableEventHandler::execute(const bn::string<64>& command, const void* args)
{
    if(command == "EVENT_VARIABLE") return run_config_variables(args);
    return run_config_variables_reset_all();
}