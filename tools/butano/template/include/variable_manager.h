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
public:
    struct Binding {
        VariableDefinition definition{};
        VariableValueData value{};
        Binding* alias = nullptr;
        NumericInstruction reference{};
        bool by_reference = false;
    };
    struct Scope {
        Binding bindings[40]{};
        int start = 0;
        int used = 0;
    };
    Scope* scope = nullptr;
    bool enter_call(const ScriptDefinition& script, const CallScriptEventData& call);
private:
    Binding* find_binding(const char* id) const;
    VariableValueData read_binding(Binding& binding) const;
    bool write_binding(Binding& binding, const VariableValueData& value);
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
    uint32_t local_owner = 0;
    bool reset_local();
    void clear_locals();
    void release_local_owner(uint32_t owner);
    int global_count() const { return definition_count; }
    const VariableDefinition* global_definition(int index) const {
        return index >= 0 && index < definition_count ? &definitions[index] : nullptr;
    }
};

#endif // VARIABLE_MANAGER_H
