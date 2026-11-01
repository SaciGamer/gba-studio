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
        return false;
    }

    VariableValueData value{
        variable->type,
        variable->number_value,
        variable->boolean_value,
        variable->string_value
    };

    if(variable->source_variable_id)
    {
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

    const bool result = VariableManager::instance().set_value(variable->variable_id, value);
    if(result)
    {
        BN_LOG("[EVENT_VARIABLE] set: ", variable->variable_id);
    }
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
