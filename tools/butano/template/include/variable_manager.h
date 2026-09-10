#ifndef VARIABLE_MANAGER_H
#define VARIABLE_MANAGER_H

#include "resource_types.h"

struct VariableValueData
{
    VariableType type;
    int number_value;
    bool boolean_value;
    const char* string_value;
};

class VariableManager
{
private:
    const VariableDefinition* definitions;
    int definition_count;
    int* number_values;
    bool* boolean_values;
    const char** string_values;

    VariableManager();

public:
    static VariableManager& instance();

    void initialize(const VariableDefinition* definitions, int definition_count);
    const VariableDefinition* find(const char* id) const;
    int get_number(const char* id) const;
    bool get_boolean(const char* id) const;
    const char* get_string(const char* id) const;
    bool set_number(const char* id, int value);
    bool set_boolean(const char* id, bool value);
    bool set_string(const char* id, const char* value);
    bool set_value(const char* id, const VariableValueData& value);
    void reset_all();
};

#endif // VARIABLE_MANAGER_H