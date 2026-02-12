#ifndef RESOURCE_REGISTRY_H
#define RESOURCE_REGISTRY_H

#include "resource_types.h"
#include "bn_string.h"

// // Função para buscar recurso pelo nome
// const Resource* get_resource_by_name(const char* name);

// // Função para buscar recurso pelo ID
// const Resource* get_resource_by_id(const bn::string<64>& resource_id);

// // Função para buscar recurso pelo ID e tipo
// const Resource* get_resource_by_id_and_type(const bn::string<64>& resource_id, ResourceType type);

// FUNCOES PARA BACKGROUND
const Backgrounds* get_background_by_name(const char* name);
const Backgrounds* get_background_by_id(const bn::string<64>& background_id);
const Backgrounds* get_background_by_id_and_type(const bn::string<64>& background_id, ResourceType type);

// FUNCOES PARA SCENE
const Scenes* get_scene_by_name(const char* name);
const Scenes* get_scene_by_id(const bn::string<64>& scene_id);
const Scenes* get_scene_by_id_and_type(const bn::string<64>& scene_id, ResourceType type);

// FUNCOES PARA SETTINGS
const Settings* get_settings();

// FUNCOES PARA TILEMAP ....


#endif // RESOURCE_REGISTRY_H
