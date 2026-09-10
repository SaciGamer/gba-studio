#include "config_variables.h"

#include "bn_log.h"
#include "variable_manager.h"

ConfigVariables& ConfigVariables::instance()
{
    static ConfigVariables config_variables;
    return config_variables;
}

bool ConfigVariables::configure(const void* args)
{
    const auto* variable = static_cast<const VariableSetValueData*>(args);
    if(!variable)
    {
        BN_LOG("[EVENT_VARIABLE] missing arguments");
        return false;
    }

    VariableValueData value{
        variable->type,
        variable->number_value,
        variable->boolean_value,
        variable->string_value
    };

    BN_LOG("[EVENT_VARIABLE] id: ", variable->variable_id);
    BN_LOG("[EVENT_VARIABLE] type: ", variable->type == VariableType::number ? "number" :
           variable->type == VariableType::boolean ? "boolean" : "string");

    if(variable->source_variable_id)
    {
        BN_LOG("[EVENT_VARIABLE] source: ", variable->source_variable_id);
        if(variable->type == VariableType::number)
        {
            value.number_value = VariableManager::instance().get_number(variable->source_variable_id);
        }
        else if(variable->type == VariableType::boolean)
        {
            value.boolean_value = VariableManager::instance().get_boolean(variable->source_variable_id);
        }
        else
        {
            value.string_value = VariableManager::instance().get_string(variable->source_variable_id);
        }
    }

    if(value.type == VariableType::number)
    {
        BN_LOG("[EVENT_VARIABLE] value: ", value.number_value);
    }
    else if(value.type == VariableType::boolean)
    {
        BN_LOG("[EVENT_VARIABLE] value: ", value.boolean_value);
    }
    else
    {
        BN_LOG("[EVENT_VARIABLE] value: ", value.string_value);
    }

    const bool result = VariableManager::instance().set_value(variable->variable_id, value);
    BN_LOG("[EVENT_VARIABLE] set result: ", result);
    return result;
}

bool ConfigVariables::reset_all()
{
    BN_LOG("[EVENT_VARIABLE_RESET_ALL] resetting variables");
    VariableManager::instance().reset_all();
    return true;
}

bool run_config_variables(const void* args)
{
    return ConfigVariables::instance().configure(args);
}

bool run_config_variables_reset_all()
{
    return ConfigVariables::instance().reset_all();
}
