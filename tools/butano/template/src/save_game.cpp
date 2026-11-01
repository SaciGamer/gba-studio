#include "save_manager.h"
#include "variable_manager.h"
#include <cstring>
#if defined(__arm__) || defined(__thumb__)
#include "bn_sram.h"
#define GAME_SAVE_EWRAM __attribute__((section(".sbss")))
#else
#define GAME_SAVE_EWRAM
#endif

namespace {
    constexpr uint32_t GAME_MAGIC = 0x47424732, VARIABLES_MAGIC = 0x47425631;
    constexpr int SLOT_COUNT = 8, SLOT_BYTES = 4096;
    struct Header { uint32_t magic, version, bytes, checksum, point, self_actor; uint16_t variables, reserved; };
    struct Blob { Header header; unsigned char payload[SLOT_BYTES - sizeof(Header)]; };
    static_assert(sizeof(Blob) == SLOT_BYTES);
    GAME_SAVE_EWRAM Blob scratch{}, loaded{};
    GAME_SAVE_EWRAM GameWorldState world_state;
    // Keep strings owned after partial loads, including untouched values loaded
    // from a different slot. Prepare in the inactive bank before committing.
    GAME_SAVE_EWRAM char variable_strings[2][SLOT_BYTES]{};
    int variable_strings_bank = 0;
#if !defined(__arm__) && !defined(__thumb__)
    Blob native_slots[SLOT_COUNT]{};
#endif
    uint32_t checksum(const Blob& blob) {
        uint32_t hash = 2166136261u;
        const auto* data = reinterpret_cast<const unsigned char*>(&blob);
        for(uint32_t i = 16; i < blob.header.bytes; ++i) { hash ^= data[i]; hash *= 16777619u; }
        return hash;
    }
    bool read_slot(int slot, bool include_variables = false) {
        if(slot < 0 || slot >= SLOT_COUNT) return false;
#if defined(__arm__) || defined(__thumb__)
        bn::sram::read_offset(scratch, slot * SLOT_BYTES);
#else
        scratch = native_slots[slot];
#endif
        return (scratch.header.magic == GAME_MAGIC || (include_variables && scratch.header.magic == VARIABLES_MAGIC)) && scratch.header.version == 1 &&
            scratch.header.bytes >= sizeof(Header) && scratch.header.bytes <= SLOT_BYTES && (scratch.header.magic == GAME_MAGIC ? scratch.header.reserved <= 1 : scratch.header.reserved == 0) &&
            scratch.header.checksum == checksum(scratch);
    }
    const VariableDefinition* definition(uint32_t key) {
        auto& manager = VariableManager::instance();
        for(int i = 0; i < manager.global_count(); ++i) {
            const auto* value = manager.global_definition(i);
            if(value && game_save_key(value->id) == key) return value;
        }
        return nullptr;
    }
    struct Cursor {
        unsigned char* data;
        int position, limit;
        bool valid = true;
        void write(uint32_t value, int size) {
            if(position + size > limit) { valid = false; return; }
            for(int i = 0; i < size; ++i) data[position++] = static_cast<unsigned char>(value >> (i * 8));
        }
        uint32_t read(int size) {
            if(position + size > limit) { valid = false; return 0; }
            uint32_t value = 0;
            for(int i = 0; i < size; ++i) value |= uint32_t(data[position++]) << (i * 8);
            return value;
        }
        void integer(uint32_t value) {
            do { const uint32_t part = value & 127; value >>= 7; write(part | (value ? 128 : 0), 1); } while(value && valid);
        }
        uint32_t integer() {
            uint32_t result = 0;
            for(int shift = 0; shift <= 28; shift += 7) {
                const uint32_t byte = read(1);
                if(!valid || (shift == 28 && byte > 15)) { valid = false; return 0; }
                result |= (byte & 127) << shift;
                if(!(byte & 128)) return result;
            }
            valid = false; return 0;
        }
        void signed_integer(int value) { integer((uint32_t(value) << 1) ^ uint32_t(value >> 31)); }
        int signed_integer() { const uint32_t value = integer(); return int((value >> 1) ^ (0u - (value & 1))); }
    };
    void clear_world() {
        world_state.scene = 0; world_state.camera_x = world_state.camera_y = 0;
        world_state.camera_follow = world_state.actor_residency = 0; world_state.actors_count = 0;
        for(auto& actor : world_state.actors) actor = GameActorState();
    }
    // Existing v1 slots retain their exact 768-byte world prefix. Larger worlds
    // use a packed prefix selected by the previously reserved header field.
    // SRAM slots, magic and version stay compatible; overflow is never truncated.
    bool read_world(Blob& blob, int& values_offset) {
        clear_world();
        if(blob.header.reserved == 0) {
            values_offset = int(sizeof(Header)) + 768;
            if(blob.header.bytes < uint32_t(values_offset)) return false;
            int count = 0; std::memcpy(&count, blob.payload + 16, 4);
            if(count < 0 || count > 17 || count > GBA_STUDIO_MAX_ACTOR_DEFINITIONS + 1) return false;
            std::memcpy(reinterpret_cast<unsigned char*>(&world_state), blob.payload, 20);
            std::memcpy(world_state.actors, blob.payload + 20, unsigned(count) * sizeof(GameActorState));
            return true;
        }
        Cursor cursor{reinterpret_cast<unsigned char*>(&blob), int(sizeof(Header)), int(blob.header.bytes)};
        world_state.scene = cursor.integer(); world_state.camera_x = cursor.signed_integer(); world_state.camera_y = cursor.signed_integer();
        world_state.camera_follow = uint8_t(cursor.read(1)); world_state.actor_residency = uint8_t(cursor.read(1));
        const uint32_t count = cursor.integer();
        if(!cursor.valid || count > GBA_STUDIO_MAX_ACTOR_DEFINITIONS + 1) return false;
        world_state.actors_count = int(count);
        for(int index = 0; index < world_state.actors_count; ++index) {
            auto& actor = world_state.actors[index];
            actor.id = cursor.integer(); actor.sprite = cursor.integer(); actor.state = cursor.integer(); actor.animation = cursor.integer();
            actor.x = cursor.signed_integer(); actor.y = cursor.signed_integer(); actor.velocity = cursor.signed_integer(); actor.remainder = cursor.signed_integer();
            actor.frame = cursor.signed_integer();
            const uint32_t flags = cursor.integer();
            if(flags >> 15) return false;
            actor.direction = flags & 3; actor.animation_speed = (flags >> 2) & 63; actor.visible = (flags >> 8) & 1;
            actor.mode = (flags >> 9) & 7; actor.grounded = (flags >> 12) & 1; actor.climbing = (flags >> 13) & 1; actor.reverse = (flags >> 14) & 1;
        }
        values_offset = cursor.position; return cursor.valid;
    }
    bool write_world(Cursor& cursor) {
        if(world_state.actors_count < 0 || world_state.actors_count > GBA_STUDIO_MAX_ACTOR_DEFINITIONS + 1) return false;
        if(world_state.actors_count <= 17) {
            std::memcpy(scratch.payload, &world_state, 20);
            std::memcpy(scratch.payload + 20, world_state.actors, unsigned(world_state.actors_count) * sizeof(GameActorState));
            cursor.position = int(sizeof(Header)) + 768; return true;
        }
        scratch.header.reserved = 1;
        cursor.integer(world_state.scene); cursor.signed_integer(world_state.camera_x); cursor.signed_integer(world_state.camera_y);
        cursor.write(world_state.camera_follow, 1); cursor.write(world_state.actor_residency, 1); cursor.integer(uint32_t(world_state.actors_count));
        for(int index = 0; index < world_state.actors_count; ++index) {
            const auto& actor = world_state.actors[index];
            if(actor.direction > 3 || actor.animation_speed > 60 || actor.visible > 1 || actor.mode > 4 || actor.grounded > 1 || actor.climbing > 1 || actor.reverse > 1) return false;
            cursor.integer(actor.id); cursor.integer(actor.sprite); cursor.integer(actor.state); cursor.integer(actor.animation);
            cursor.signed_integer(actor.x); cursor.signed_integer(actor.y); cursor.signed_integer(actor.velocity); cursor.signed_integer(actor.remainder); cursor.signed_integer(actor.frame);
            const uint32_t flags = uint32_t(actor.direction) | (uint32_t(actor.animation_speed) << 2) | (uint32_t(actor.visible) << 8) |
                (uint32_t(actor.mode) << 9) | (uint32_t(actor.grounded) << 12) | (uint32_t(actor.climbing) << 13) | (uint32_t(actor.reverse) << 14);
            cursor.integer(flags);
        }
        return cursor.valid;
    }
    bool variables(Blob& blob, bool apply, int values_offset) {
        Cursor cursor{reinterpret_cast<unsigned char*>(&blob), values_offset, int(blob.header.bytes)};
        auto& manager = VariableManager::instance();
        for(int i = 0; i < blob.header.variables; ++i) {
            const uint32_t key = cursor.read(4), type = cursor.read(1);
            const auto* variable = definition(key);
            if(!cursor.valid || type > uint32_t(VariableType::string) || (variable && uint32_t(variable->type) != type)) return false;
            if(type == uint32_t(VariableType::number)) {
                const int value = int(cursor.read(4));
                if(apply && variable && !manager.set_number(variable->id, value)) return false;
            } else if(type == uint32_t(VariableType::boolean)) {
                const uint32_t value = cursor.read(1);
                if(value > 1) return false;
                if(apply && variable && !manager.set_boolean(variable->id, value != 0)) return false;
            } else {
                const int length = int(cursor.read(2));
                if(!cursor.valid || length < 1 || cursor.position + length > cursor.limit || cursor.data[cursor.position + length - 1] != 0) return false;
                if(apply && variable && !manager.set_string(variable->id, reinterpret_cast<const char*>(cursor.data + cursor.position))) return false;
                cursor.position += length;
            }
            if(!cursor.valid) return false;
        }
        return cursor.position == cursor.limit;
    }
    bool same_variable_id(const char* left, const char* right) {
        if(!left || !right) return false;
        while(*left && *left == *right) { ++left; ++right; }
        return *left == *right;
    }
    bool selected(const char* id, const char* const* ids, int count, bool all) {
        if(all) return true;
        for(int i = 0; i < count; ++i) if(same_variable_id(ids[i], id)) return true;
        return false;
    }
    bool valid_selection(const char* const* ids, int count, bool all) {
        if(all) return true;
        auto& manager = VariableManager::instance();
        if(!ids || count <= 0 || count > manager.global_count()) return false;
        for(int i = 0; i < count; ++i) {
            if(!ids[i]) return false;
            bool found = false;
            for(int j = 0; j < manager.global_count(); ++j) if(same_variable_id(manager.global_definition(j)->id, ids[i])) found = true;
            if(!found) return false;
            for(int j = 0; j < i; ++j) if(same_variable_id(ids[i], ids[j])) return false;
        }
        return true;
    }
    bool saved_value(int offset, uint32_t key, VariableValueData& result) {
        Cursor cursor{reinterpret_cast<unsigned char*>(&scratch), offset, int(scratch.header.bytes)};
        for(int i = 0; i < scratch.header.variables; ++i) {
            const uint32_t record_key = cursor.read(4);
            result = {}; result.type = VariableType(cursor.read(1));
            if(result.type == VariableType::number) result.number_value = int(cursor.read(4));
            else if(result.type == VariableType::boolean) result.boolean_value = cursor.read(1) != 0;
            else {
                const int length = int(cursor.read(2));
                result.string_value = reinterpret_cast<const char*>(cursor.data + cursor.position);
                cursor.position += length;
            }
            if(record_key == key) return true;
        }
        return false;
    }

}

bool SaveManager::save_game(int slot, uint32_t point, uint32_t self_actor) {
    last_operation = 0;
    if(slot < 0 || slot >= SLOT_COUNT || !game_hooks.capture) return false;
    scratch.header = {};
    for(auto& byte : scratch.payload) byte = 0;
    clear_world();
    if(!game_hooks.capture(world_state)) return false;
    auto& manager = VariableManager::instance();
    if(manager.global_count() < 0 || manager.global_count() > 65535) return false;
    Cursor cursor{reinterpret_cast<unsigned char*>(&scratch), int(sizeof(Header)), SLOT_BYTES};
    if(!write_world(cursor)) return false;
    for(int i = 0; i < manager.global_count(); ++i) {
        const auto* variable = manager.global_definition(i);
        if(!variable) return false;
        cursor.write(game_save_key(variable->id), 4); cursor.write(uint32_t(variable->type), 1);
        if(variable->type == VariableType::number) cursor.write(uint32_t(manager.get_number(variable->id)), 4);
        else if(variable->type == VariableType::boolean) cursor.write(manager.get_boolean(variable->id) ? 1 : 0, 1);
        else {
            const char* value = manager.get_string(variable->id);
            int length = 0; if(!value) value = "";
            while(value[length] && length < SLOT_BYTES) ++length;
            if(length >= SLOT_BYTES || cursor.position + length + 3 > cursor.limit) return false;
            cursor.write(uint32_t(length + 1), 2);
            for(int index = 0; index <= length; ++index) cursor.write(static_cast<unsigned char>(value[index]), 1);
        }
        if(!cursor.valid) return false;
    }
    scratch.header = {GAME_MAGIC, 1, uint32_t(cursor.position), 0, point, self_actor, uint16_t(manager.global_count()), scratch.header.reserved};
    scratch.header.checksum = checksum(scratch);
#if defined(__arm__) || defined(__thumb__)
    bn::sram::write_offset(scratch, slot * SLOT_BYTES);
#else
    native_slots[slot] = scratch;
#endif
    loaded_save_point = point; loaded_self_actor = self_actor; last_operation = 1; return true;
}

bool SaveManager::load_game(int slot) {
    last_operation = 0;
    int values_offset = 0;
    if(!read_slot(slot) || !read_world(scratch, values_offset) || !variables(scratch, false, values_offset) || !game_hooks.restore) return false;
    auto* destination = reinterpret_cast<unsigned char*>(&loaded);
    const auto* source = reinterpret_cast<const unsigned char*>(&scratch);
    for(int index = 0; index < SLOT_BYTES; ++index) destination[index] = source[index];
    if(!game_hooks.restore(world_state)) return false;
    VariableManager::instance().reset_all();
    if(!variables(loaded, true, values_offset)) return false;
    loaded_save_point = loaded.header.point; loaded_self_actor = loaded.header.self_actor; last_operation = 2; return true;
}

bool SaveManager::has_game(int slot) { return read_slot(slot); }
bool SaveManager::remove_game(int slot) {
    last_operation = 0;
    if(slot < 0 || slot >= SLOT_COUNT) return false;
    uint32_t empty = 0;
#if defined(__arm__) || defined(__thumb__)
    bn::sram::write_offset(empty, slot * SLOT_BYTES);
#else
    native_slots[slot].header.magic = empty;
#endif
    last_operation = 3; loaded_save_point = 0; return true;
}


bool SaveManager::save_variables(int slot, const char* const* ids, int count, bool all) {
    last_operation = 0;
    if(slot < 0 || slot >= SLOT_COUNT || !valid_selection(ids, count, all)) return false;
    scratch.header = {};
    for(auto& byte : scratch.payload) byte = 0;
    auto& manager = VariableManager::instance();
    Cursor cursor{reinterpret_cast<unsigned char*>(&scratch), int(sizeof(Header)), SLOT_BYTES};
    int saved_count = 0;
    for(int i = 0; i < manager.global_count(); ++i) {
        const auto* variable = manager.global_definition(i);
        if(!selected(variable->id, ids, count, all)) continue;
        cursor.write(game_save_key(variable->id), 4); cursor.write(uint32_t(variable->type), 1);
        if(variable->type == VariableType::number) cursor.write(uint32_t(manager.get_number(variable->id)), 4);
        else if(variable->type == VariableType::boolean) cursor.write(manager.get_boolean(variable->id) ? 1 : 0, 1);
        else {
            const char* value = manager.get_string(variable->id);
            int length = 0;
            while(value && value[length] && length < SLOT_BYTES) ++length;
            if(length >= SLOT_BYTES) return false;
            cursor.write(uint32_t(length + 1), 2);
            for(int j = 0; j <= length; ++j) cursor.write(value ? static_cast<unsigned char>(value[j]) : 0, 1);
        }
        if(!cursor.valid) return false;
        ++saved_count;
    }
    if(saved_count > 65535) return false;
    scratch.header = {VARIABLES_MAGIC, 1, uint32_t(cursor.position), 0, 0, 0, uint16_t(saved_count), 0};
    scratch.header.checksum = checksum(scratch);
#if defined(__arm__) || defined(__thumb__)
    bn::sram::write_offset(scratch, slot * SLOT_BYTES);
#else
    native_slots[slot] = scratch;
#endif
    last_operation = 4; return true;
}

bool SaveManager::load_variables(int slot, const char* const* ids, int count, bool all) {
    last_operation = 0;
    if(!valid_selection(ids, count, all) || !read_slot(slot, true)) return false;
    int offset = int(sizeof(Header));
    if(scratch.header.magic == GAME_MAGIC && !read_world(scratch, offset)) return false;
    if(!variables(scratch, false, offset)) return false;
    auto& manager = VariableManager::instance();
    bool copy_strings = false;
    for(int i = 0; i < manager.global_count(); ++i) {
        const auto* variable = manager.global_definition(i);
        if(!selected(variable->id, ids, count, all)) continue;
        VariableValueData value{};
        const bool found = saved_value(offset, game_save_key(variable->id), value);
        if(!found && !all) return false;
        if(found && variable->type == VariableType::string) copy_strings = true;
    }
    const int next_bank = 1 - variable_strings_bank;
    int used = 0;
    if(copy_strings) for(int i = 0; i < manager.global_count(); ++i) {
        const auto* variable = manager.global_definition(i);
        if(variable->type != VariableType::string) continue;
        VariableValueData value{};
        const char* text = selected(variable->id, ids, count, all) && saved_value(offset, game_save_key(variable->id), value)
            ? value.string_value : manager.get_string(variable->id);
        do {
            if(used >= SLOT_BYTES) return false;
            variable_strings[next_bank][used++] = text ? *text : '\0';
        } while(text && *text++);
    }
    used = 0;
    for(int i = 0; i < manager.global_count(); ++i) {
        const auto* variable = manager.global_definition(i);
        VariableValueData value{};
        if(variable->type == VariableType::string) {
            if(copy_strings) {
                manager.set_string(variable->id, variable_strings[next_bank] + used);
                while(variable_strings[next_bank][used++]) {}
            }
        } else if(selected(variable->id, ids, count, all) && saved_value(offset, game_save_key(variable->id), value)) {
            if(variable->type == VariableType::number) manager.set_number(variable->id, value.number_value);
            else manager.set_boolean(variable->id, value.boolean_value);
        }
    }
    if(copy_strings) variable_strings_bank = next_bank;
    last_operation = 5; return true;
}
