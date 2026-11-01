#include "save_manager.h"
#include "variable_manager.h"
#if defined(__arm__) || defined(__thumb__)
#include "bn_sram.h"
#endif

namespace
{
    constexpr unsigned MAGIC = 0x47424153;
    constexpr unsigned SCHEMA_MASK = 0xffu;
    struct Record {
        unsigned magic;
        unsigned schema;
        unsigned group_count;
        unsigned group_index;
        VariableType type;
        int value;
        char text[48];
    };
#if defined(__arm__) || defined(__thumb__)
    #define SAVE_MANAGER_EWRAM_BSS __attribute__((section(".sbss")))
#else
    #define SAVE_MANAGER_EWRAM_BSS
#endif
#if !defined(__arm__) && !defined(__thumb__)
    Record native_records[16]{};
#endif
    SAVE_MANAGER_EWRAM_BSS char loaded_strings[16][48]{};

    unsigned variable_hash(const char* id)
    {
        // FNV-1a truncated to 24 bits.  Zero is reserved for legacy records
        // written before IDs were embedded in the schema word.
        unsigned hash = 2166136261u;
        if(id)
        {
            for(const unsigned char* cursor = reinterpret_cast<const unsigned char*>(id); *cursor; ++cursor)
            {
                hash ^= *cursor;
                hash *= 16777619u;
            }
        }
        hash &= 0x00ffffffu;
        return hash ? hash : 1u;
    }

    unsigned packed_schema(unsigned schema, const char* id)
    {
        return (schema & SCHEMA_MASK) | (variable_hash(id) << 8);
    }

    bool read_record(int slot, Record& record)
    {
        if(slot < 0 || slot >= 16) return false;
#if defined(__arm__) || defined(__thumb__)
        bn::sram::read_offset(record, slot * int(sizeof(Record)));
#else
        record = native_records[slot];
#endif
        return record.magic == MAGIC;
    }

    void write_record(int slot, const Record& record)
    {
#if defined(__arm__) || defined(__thumb__)
        bn::sram::write_offset(record, slot * int(sizeof(Record)));
#else
        native_records[slot] = record;
#endif
    }

    bool next_id(const char*& cursor, char (&id)[64])
    {
        if(!cursor || !*cursor) return false;
        int length = 0;
        while(*cursor == ' ' || *cursor == ',') ++cursor;
        while(cursor[length] && cursor[length] != ',')
        {
            if(length >= 63) return false;
            id[length] = cursor[length];
            ++length;
        }
        while(length > 0 && id[length - 1] == ' ') --length;
        id[length] = '\0';
        cursor += length;
        while(*cursor && *cursor != ',') ++cursor;
        if(*cursor == ',') ++cursor;
        return length > 0;
    }

    bool make_record(const char* variable_id, unsigned schema, unsigned group_count, unsigned group_index, Record& record)
    {
        const VariableDefinition* definition = VariableManager::instance().find(variable_id);
        if(!definition) return false;
        record = {};
        record.magic = MAGIC;
        record.schema = packed_schema(schema, variable_id);
        record.group_count = group_count;
        record.group_index = group_index;
        record.type = definition->type;
        if(definition->type == VariableType::number) record.value = VariableManager::instance().get_number(variable_id);
        else if(definition->type == VariableType::boolean) record.value = VariableManager::instance().get_boolean(variable_id) ? 1 : 0;
        else
        {
            const char* source = VariableManager::instance().get_string(variable_id);
            if(!source) return false;
            int index = 0;
            for(; index < 47 && source[index]; ++index) record.text[index] = source[index];
            record.text[index] = '\0';
        }
        return true;
    }

    bool apply_record(const Record& record, const char* variable_id, int slot)
    {
        if(record.type == VariableType::number) return VariableManager::instance().set_number(variable_id, record.value);
        if(record.type == VariableType::boolean) return VariableManager::instance().set_boolean(variable_id, record.value != 0);
        int index = 0;
        for(; index < 47 && record.text[index]; ++index) loaded_strings[slot][index] = record.text[index];
        loaded_strings[slot][index] = '\0';
        return VariableManager::instance().set_string(variable_id, loaded_strings[slot]);
    }
}

SaveManager& SaveManager::instance()
{
    static SaveManager manager;
    return manager;
}

bool SaveManager::write(int slot, const char* variable_id)
{
    return write_group(slot, variable_id, 1);
}

bool SaveManager::load(int slot, const char* variable_id)
{
    return load_group(slot, variable_id, 1);
}

bool SaveManager::write_group(int slot, const char* variable_ids, int schema)
{
    if(slot < 0 || slot >= 16 || !variable_ids || !variable_ids[0] || schema < 1 || schema > 255) return false;
    const char* cursor = variable_ids;
    char id[64]{};
    int count = 0;
    while(next_id(cursor, id)) ++count;
    if(count < 1 || slot + count > 16) return false;
    cursor = variable_ids;
    for(int index = 0; index < count; ++index)
    {
        if(!next_id(cursor, id)) return false;
        Record validation{};
        if(!make_record(id, unsigned(schema), unsigned(count), unsigned(index), validation)) return false;
    }
    cursor = variable_ids;
    for(int index = 0; index < count; ++index)
    {
        if(!next_id(cursor, id)) return false;
        Record record{};
        if(!make_record(id, unsigned(schema), unsigned(count), unsigned(index), record)) return false;
        write_record(slot + index, record);
    }
    return true;
}

bool SaveManager::load_group(int slot, const char* variable_ids, int schema)
{
    if(slot < 0 || slot >= 16 || !variable_ids || !variable_ids[0] || schema < 1 || schema > 255) return false;
    const char* cursor = variable_ids;
    char id[64]{};
    Record first{};
    if(!next_id(cursor, id) || !read_record(slot, first) || first.group_index != 0 || first.group_count < 1 || slot + int(first.group_count) > 16) return false;
    const unsigned count = first.group_count;
    const unsigned first_schema = first.schema & SCHEMA_MASK;
    if(first_schema > unsigned(schema)) return false;
    for(unsigned index = 0; index < count; ++index)
    {
        if(index > 0 && !next_id(cursor, id)) return false;
        if(index == 0)
        {
            // id already contains the first group member.
        }
        Record record{};
        int record_slot = slot + int(index);
        const unsigned requested_hash = variable_hash(id);
        bool found_by_hash = false;
        for(unsigned candidate = 0; candidate < count; ++candidate)
        {
            Record candidate_record{};
            if(!read_record(slot + int(candidate), candidate_record) || (candidate_record.schema & SCHEMA_MASK) > unsigned(schema) || candidate_record.group_count != count) return false;
            const unsigned candidate_hash = candidate_record.schema >> 8;
            if(candidate_hash && candidate_hash == requested_hash)
            {
                record = candidate_record;
                record_slot = slot + int(candidate);
                found_by_hash = true;
                break;
            }
        }
        if(!found_by_hash && (!read_record(record_slot, record) || (record.schema & SCHEMA_MASK) > unsigned(schema) || record.group_count != count || record.group_index != index)) return false;
        const VariableDefinition* definition = VariableManager::instance().find(id);
        if(!definition || definition->type != record.type) return false;
        if(!apply_record(record, id, record_slot)) return false;
        if((record.schema & SCHEMA_MASK) < unsigned(schema) || (record.schema >> 8) != requested_hash)
        {
            // Upgrade in place so a later load with the old schema is rejected,
            // while preserving the physical slot/index for future lookups.
            record.schema = (unsigned(schema) & SCHEMA_MASK) | (requested_hash << 8);
            write_record(record_slot, record);
        }
    }
    char extra_id[64]{};
    return !next_id(cursor, extra_id);
}
