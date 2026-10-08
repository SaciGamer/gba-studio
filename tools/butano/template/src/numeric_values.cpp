#include "numeric_values.h"
#include "variable_manager.h"
#include "graphics_manager.h"
#include "resource_registry.h"
#include "bn_log.h"

namespace {
    int read_variable(const char* id) {
        const auto* definition = VariableManager::instance().find(id);
        if(!definition) { BN_LOG("Numeric expression: variable not found"); return 0; }
        if(definition->type == VariableType::boolean) return VariableManager::instance().get_boolean(id) ? 1 : 0;
        if(definition->type == VariableType::number) return VariableManager::instance().get_number(id);
        BN_LOG("Numeric expression: string variable is not numeric"); return 0;
    }
    int read_property(const char* id, int property) { return GraphicsManager::instance().read_numeric_actor_property(id, property); }
    int read_engine(int field) {
        const auto& graphics = GraphicsManager::instance();
        const auto* scene = graphics.getScene();
        const auto* settings = get_settings();
        switch(field) {
            case 0: return graphics.get_camera_x();
            case 1: return graphics.get_camera_y();
            case 2: return scene ? scene->scene_width : 0;
            case 3: return scene ? scene->scene_height : 0;
            case 4: return settings ? settings->move_speed : 1;
            case 5: return settings ? settings->anim_speed : 1;
            case 6: return numeric_frame_count > uint32_t(INT_MAX) ? INT_MAX : int(numeric_frame_count);
            default: return 0;
        }
    }
}
void configure_numeric_runtime() { numeric_runtime_hooks = { read_variable, read_property, read_engine }; }
