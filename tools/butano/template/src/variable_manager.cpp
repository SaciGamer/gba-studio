#include "local_variables.h"
#include "variable_manager.h"
namespace {
    struct LocalBank { uint32_t owner = 0; int values[LOCAL_VARIABLE_COUNT]{}; };
#if defined(__arm__) || defined(__thumb__)
    __attribute__((section(".sbss")))
#endif
    LocalBank local_banks[GBA_STUDIO_MAX_ACTOR_DEFINITIONS + 64]{};
    const VariableDefinition local_definitions[LOCAL_VARIABLE_COUNT] = {
        {"__LOCAL__:A", VariableType::number, 0, false, "", "local_A"},
        {"__LOCAL__:B", VariableType::number, 0, false, "", "local_B"},
        {"__LOCAL__:C", VariableType::number, 0, false, "", "local_C"},
        {"__LOCAL__:D", VariableType::number, 0, false, "", "local_D"},
        {"__LOCAL__:E", VariableType::number, 0, false, "", "local_E"},
        {"__LOCAL__:F", VariableType::number, 0, false, "", "local_F"},
        {"__LOCAL__:G", VariableType::number, 0, false, "", "local_G"},
        {"__LOCAL__:H", VariableType::number, 0, false, "", "local_H"},
    };
    LocalBank* local_bank(uint32_t owner, bool create) {
        if(!owner) return nullptr;
        LocalBank* free = nullptr;
        for(auto& bank : local_banks) {
            if(bank.owner == owner) return &bank;
            if(!bank.owner && !free) free = &bank;
        }
        if(create && free) { free->owner = owner; for(int& value : free->values) value = 0; return free; }
        return nullptr;
    }

    bool same_id(const char* left, const char* right) {
        if(!left || !right) return false;
        while(*left && *left == *right) { ++left; ++right; }
        return *left == *right;
    }
}

VariableManager::Binding* VariableManager::find_binding(const char* id) const
{
    if(!scope || !id) return nullptr;
    for(int index = scope->start; index < scope->used; ++index)
        if(same_id(scope->bindings[index].definition.id, id) || same_id(scope->bindings[index].definition.symbol, id)) return &scope->bindings[index];
    return nullptr;
}

VariableValueData VariableManager::read_binding(Binding& initial) const
{
    Binding* binding = &initial;
    for(int depth = 0; binding->alias && depth < 8; ++depth) binding = binding->alias;
    if(binding->alias) return {};
    if(!binding->by_reference) return binding->value;
    const auto& source = binding->reference;
    VariableValueData value{binding->definition.type, 0, false, ""};
    if(source.operation == NumericOperation::op_variable) {
        value.number_value = get_number(source.reference);
        value.boolean_value = get_boolean(source.reference);
        value.string_value = get_string(source.reference);
    } else {
        value.number_value = source.operation == NumericOperation::op_property
            ? (numeric_runtime_hooks.property ? numeric_runtime_hooks.property(source.reference, source.argument) : 0)
            : (numeric_runtime_hooks.engine ? numeric_runtime_hooks.engine(source.argument) : 0);
        value.boolean_value = value.number_value != 0;
    }
    return value;
}

bool VariableManager::write_binding(Binding& initial, const VariableValueData& value)
{
    Binding* binding = &initial;
    for(int depth = 0; binding->alias && depth < 8; ++depth) binding = binding->alias;
    if(binding->alias || binding->definition.type != value.type) return false;
    if(!binding->by_reference) { binding->value = value; return true; }
    const auto& target = binding->reference;
    if(target.operation == NumericOperation::op_variable) return set_value(target.reference, value);
    const int number = value.type == VariableType::boolean ? int(value.boolean_value) : value.number_value;
    if(target.operation == NumericOperation::op_property) return numeric_runtime_hooks.write_property && numeric_runtime_hooks.write_property(target.reference, target.argument, number);
    if(target.operation == NumericOperation::op_engine) return numeric_runtime_hooks.write_engine && numeric_runtime_hooks.write_engine(target.argument, number);
    return false;
}

bool VariableManager::enter_call(const ScriptDefinition& script, const CallScriptEventData& call)
{
    if(!scope || script.parameters_count < 0 || script.parameters_count > 20 || call.arguments_count != script.parameters_count
       || scope->used + script.parameters_count > 40) return false;
    const int start = scope->used;
    for(int index = 0; index < script.parameters_count; ++index) {
        const auto& parameter = script.parameters[index];
        const ScriptCallArgument* argument = nullptr;
        for(int candidate = 0; call.arguments && candidate < call.arguments_count; ++candidate)
            if(same_id(call.arguments[candidate].parameter_id, parameter.variable.id)) {
                if(argument) return false;
                argument = &call.arguments[candidate];
            }
        if(!argument) return false;
        // Keep the caller frame visible while evaluating all input values.
        Binding& binding = scope->bindings[start + index];
        binding = Binding{};
        binding.definition = parameter.variable;
        binding.value.type = parameter.variable.type;
        binding.by_reference = parameter.by_reference;
        if(parameter.by_reference) {
            if(!argument->has_reference) return false;
            binding.reference = argument->reference;
            if(binding.reference.operation == NumericOperation::op_variable) {
                const auto* definition = find(binding.reference.reference);
                if(!definition || definition->type != parameter.variable.type) return false;
                binding.alias = find_binding(binding.reference.reference);
            } else if(parameter.variable.type == VariableType::string
                || (binding.reference.operation != NumericOperation::op_property && binding.reference.operation != NumericOperation::op_engine)) return false;
        } else if(parameter.variable.type == VariableType::string) {
            if(argument->string_variable_id) {
                const auto* definition = find(argument->string_variable_id);
                if(!definition || definition->type != VariableType::string) return false;
                binding.value.string_value = get_string(argument->string_variable_id);
            } else binding.value.string_value = argument->string_value ? argument->string_value : "";
        } else {
            if(!argument->number) return false;
            binding.value.number_value = evaluate_numeric_program(*argument->number);
            binding.value.boolean_value = binding.value.number_value != 0;
        }
    }
    scope->start = start;
    scope->used += script.parameters_count;
    return true;
}

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

    clear_locals();
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
    if(auto* binding = find_binding(id)) return &binding->definition;
    const int local = local_variable_index(id);
    if(local >= 0) return local_owner ? &local_definitions[local] : nullptr;
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

        if(*definition_id == *requested_id || same_id(definitions[index].symbol, id))
        {
            return &definitions[index];
        }
    }

    return nullptr;
}

int VariableManager::get_number(const char* id) const
{
    if(auto* binding = find_binding(id)) return read_binding(*binding).number_value;
    const int local = local_variable_index(id);
    if(local >= 0) { const auto* bank = local_bank(local_owner, false); return bank ? bank->values[local] : 0; }
    const VariableDefinition* definition = find(id);
    if(!definition)
    {
        return 0;
    }

    return number_values[definition - definitions];
}

bool VariableManager::get_boolean(const char* id) const
{
    if(auto* binding = find_binding(id)) return read_binding(*binding).boolean_value;
    if(local_variable_index(id) >= 0) return get_number(id) != 0;
    const VariableDefinition* definition = find(id);
    if(!definition)
    {
        return false;
    }

    return boolean_values[definition - definitions];
}

const char* VariableManager::get_string(const char* id) const
{
    if(auto* binding = find_binding(id)) return read_binding(*binding).string_value;
    if(local_variable_index(id) >= 0) return "";
    const VariableDefinition* definition = find(id);
    if(!definition)
    {
        return "";
    }

    return string_values[definition - definitions];
}

bool VariableManager::set_number(const char* id, int value)
{
    if(auto* binding = find_binding(id)) return write_binding(*binding, {VariableType::number, value, false, ""});
    const int local = local_variable_index(id);
    if(local >= 0) { auto* bank = local_bank(local_owner, true); if(!bank) return false; bank->values[local] = value; return true; }
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
    if(auto* binding = find_binding(id)) return write_binding(*binding, {VariableType::boolean, 0, value, ""});
    if(local_variable_index(id) >= 0) return set_number(id, value ? 1 : 0);
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
    if(auto* binding = find_binding(id)) return write_binding(*binding, {VariableType::string, 0, false, value ? value : ""});
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

void VariableManager::release_local_owner(uint32_t owner) {
    if(auto* bank = local_bank(owner, false)) bank->owner = 0;
}
bool VariableManager::reset_local() {
    if(!local_owner) return false;
    release_local_owner(local_owner); return true;
}
void VariableManager::clear_locals() {
    for(auto& bank : local_banks) bank.owner = 0;
    local_owner = 0;
}
