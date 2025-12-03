/**
 * {{PROJECT_NAME}} - GBA Game
 * Author: {{AUTHOR}}
 * Version: {{VERSION}}
 * 
 * Built with Butano engine for GBA
 */

#include "bn_string.h"
#include "resource_types.h"
#include "resources.h"

static const Resource RESOURCES[] = {
    // {{NAME_FILE}}
{{OBJECT_CONSTANTS}}
};

// Tamanho do array RESOURCES para iteração segura
const size_t RESOURCES_SIZE = sizeof(RESOURCES) / sizeof(RESOURCES[0]);

const Resource* get_resource_by_name(const char* name)
{
    for(const auto& r : RESOURCES)
    {
        bn::string<64> res_name(r.name);
        if(res_name == bn::string<64>(name))
        {
            return &r;
        }
    }
    return nullptr;
}

const Resource* get_resource_by_id(const bn::string<64>& resource_id)
{
    // Busca na array RESOURCES pelo ID
    for(size_t i = 0; i < RESOURCES_SIZE; ++i)
    {
        if(RESOURCES[i].id && bn::string<64>(RESOURCES[i].id) == resource_id)
        {
            return &RESOURCES[i];
        }
    }
    return nullptr;
}

const Resource* get_resource_by_id_and_type(const bn::string<64>& resource_id, ResourceType type)
{
    // Busca na array RESOURCES pelo ID e tipo
    for(size_t i = 0; i < RESOURCES_SIZE; ++i)
    {
        if(RESOURCES[i].type == type && RESOURCES[i].id && bn::string<64>(RESOURCES[i].id) == resource_id)
        {
            return &RESOURCES[i];
        }
    }
    return nullptr;
}