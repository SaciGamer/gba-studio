#ifndef GBA_STUDIO_LOCAL_VARIABLES_H
#define GBA_STUDIO_LOCAL_VARIABLES_H
#include <cstdint>
#include "runtime_capacity.h"

constexpr int LOCAL_VARIABLE_COUNT = 8;
inline int local_variable_index(const char* id) {
    if(!id) return -1;
    const char* prefix = id[0] == '_' ? "__LOCAL__:" : "local_";
    for(; *prefix; ++prefix, ++id) if(*id != *prefix) return -1;
    return id[0] >= 'A' && id[0] <= 'H' && !id[1] ? id[0] - 'A' : -1;
}
inline uint32_t local_owner_key(const char* scene, const char* owner, bool trigger = false) {
    if(!owner || !owner[0]) return 0;
    uint32_t hash = 2166136261u;
    if(scene) for(; *scene; ++scene) { hash ^= static_cast<unsigned char>(*scene); hash *= 16777619u; }
    hash ^= trigger ? 'T' : 'A'; hash *= 16777619u;
    for(; *owner; ++owner) { hash ^= static_cast<unsigned char>(*owner); hash *= 16777619u; }
    return hash ? hash : 1u;
}
#endif
