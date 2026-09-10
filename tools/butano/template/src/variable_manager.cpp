#include "variable_manager.h"

VariableManager::VariableManager()
    : definitions(nullptr), definition_count(0), number_values(nullptr),
      boolean_values(nullptr), string_values(nullptr)
{
}

VariableManager& VariableManager::instance()
{
    static VariableManager manager;
    return manager;
}

void VariableManager::initialize(const VariableDefinition* next_definitions, int next_definition_count)
{
    delete[] number_values;
    delete[] boolean_values;
    delete[] string_values;

    definitions = next_definitions;
    definition_count = next_definition_count;
    number_values = new int[definition_count]();
    boolean_values = new bool[definition_count]();
    string_values = new const char*[definition_count]();

    for(int index = 0; index < definition_count; ++index)
    {
        const VariableDefinition& definition = definitions[index];
        number_values[index] = definition.number_value;
        boolean_values[index] = definition.boolean_value;
        string_values[index] = definition.string_value;
    }
}

const VariableDefinition* VariableManager::find(const char* id) const
{
    if(!id || !definitions)
    {
        return nullptr;
    }

    for(int index = 0; index < definition_count; ++index)
    {
        const char* definition_id = definitions[index].id;
        const char* requested_id = id;
        while(*definition_id && *definition_id == *requested_id)
        {
            ++definition_id;
            ++requested_id;
        }

        if(*definition_id == *requested_id)
        {
            return &definitions[index];
        }
    }

    return nullptr;
}

int VariableManager::get_number(const char* id) const
{
    const VariableDefinition* definition = find(id);
    if(!definition)
    {
        return 0;
    }

    return number_values[definition - definitions];
}

bool VariableManager::get_boolean(const char* id) const
{
    const VariableDefinition* definition = find(id);
    if(!definition)
    {
        return false;
    }

    return boolean_values[definition - definitions];
}

const char* VariableManager::get_string(const char* id) const
{
    const VariableDefinition* definition = find(id);
    if(!definition)
    {
        return "";
    }

    return string_values[definition - definitions];
}

bool VariableManager::set_number(const char* id, int value)
{
    const VariableDefinition* definition = find(id);
    if(!definition || definition->type != VariableType::number)
    {
        return false;
    }

    number_values[definition - definitions] = value;
    return true;
}

bool VariableManager::set_boolean(const char* id, bool value)
{
    const VariableDefinition* definition = find(id);
    if(!definition || definition->type != VariableType::boolean)
    {
        return false;
    }

    boolean_values[definition - definitions] = value;
    return true;
}

bool VariableManager::set_string(const char* id, const char* value)
{
    const VariableDefinition* definition = find(id);
    if(!definition || definition->type != VariableType::string)
    {
        return false;
    }

    string_values[definition - definitions] = value ? value : "";
    return true;
}

bool VariableManager::set_value(const char* id, const VariableValueData& value)
{
    if(value.type == VariableType::number)
    {
        return set_number(id, value.number_value);
    }
    if(value.type == VariableType::boolean)
    {
        return set_boolean(id, value.boolean_value);
    }
    return set_string(id, value.string_value);
}

void VariableManager::reset_all()
{
    for(int index = 0; index < definition_count; ++index)
    {
        const VariableDefinition& definition = definitions[index];
        number_values[index] = definition.number_value;
        boolean_values[index] = definition.boolean_value;
        string_values[index] = definition.string_value;
    }
}