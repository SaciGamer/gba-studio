#include "numeric_values.h"
#include "variable_manager.h"
#include "graphics_manager.h"
#include "resource_registry.h"
#include "bn_log.h"
#include "camera_manager.h"

namespace {
    bool trigger_reference(const char* id) {
        constexpr char prefix[] = "__TRIGGER__:";
        if(!id) return false;
        for(int index = 0; index < 12; ++index) if(id[index] != prefix[index]) return false;
        return true;
    }
    int read_variable(const char* id) {
        const auto* definition = VariableManager::instance().find(id);
        if(!definition) { BN_LOG("Numeric expression: variable not found"); return 0; }
        if(definition->type == VariableType::boolean) return VariableManager::instance().get_boolean(id) ? 1 : 0;
        if(definition->type == VariableType::number) return VariableManager::instance().get_number(id);
        BN_LOG("Numeric expression: string variable is not numeric"); return 0;
    }
    int read_property(const char* id, int property) {
        if(trigger_reference(id)) return GraphicsManager::instance().read_numeric_trigger_property(id + 12, property);
        if(id && bn::string<64>(id) == "__SELF__") id = numeric_self_actor_id;
        return GraphicsManager::instance().read_numeric_actor_property(id, property);
    }
    bool write_property(const char* id, int property, int value) {
        if(trigger_reference(id)) return GraphicsManager::instance().write_numeric_trigger_property(id + 12, property, value);
        if(id && bn::string<64>(id) == "__SELF__") id = numeric_self_actor_id;
        return GraphicsManager::instance().write_numeric_actor_property(id, property, value);
    }
    bool write_engine(int field, int value) {
        auto& graphics = GraphicsManager::instance();
        if(field == 0) CameraManager::instance().set_position(value, graphics.get_camera_y());
        else if(field == 1) CameraManager::instance().set_position(graphics.get_camera_x(), value);
        else return false;
        return true;
    }
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
void configure_numeric_runtime() { numeric_runtime_hooks = { read_variable, read_property, read_engine, write_property, write_engine }; }
