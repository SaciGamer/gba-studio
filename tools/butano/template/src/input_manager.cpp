#include "input_manager.h"
#include "resource_types.h"
#include "bn_keypad.h"
#include "runtime_name.h"
#include <cstdint>

InputManager& InputManager::instance()
{
    static InputManager manager;
    return manager;
}

namespace {
uint16_t overridden_buttons = 0;
uint8_t disabled_groups = 0;
const unsigned short* configured_group_masks = nullptr;
const InputBinding* input_bindings = nullptr;
int input_bindings_count = 0;
const InputBinding* default_bindings = nullptr;
int default_bindings_count = 0;
const SceneInputMap* scene_input_maps = nullptr;
int scene_input_maps_count = 0;
uint16_t compiled_binding_masks[32] = {};
uint32_t compiled_bindings = 0;
uint16_t queued_default_actions = 0, default_pressed = 0, default_held = 0;
uint16_t frame_default_actions = 0;
uint16_t queued_source_actions[10] = {}, pressed_source_actions[10] = {};
uint16_t held_default_actions[10] = {};
uint16_t button_mask(const char* button)
{
    if(!button) return 0;
    switch(button[0]) {
        case 'A': return button[1] == 0 ? 1 << 0 : 0;
        case 'B': return button[1] == 0 ? 1 << 1 : 0;
        case 'L': return button[1] == 0 ? 1 << 2 : runtime_name_equal(button, "LEFT") ? 1 << 8 : 0;
        case 'R': return button[1] == 0 ? 1 << 3 : runtime_name_equal(button, "RIGHT") ? 1 << 9 : 0;
        case 'S': return runtime_name_equal(button, "START") ? 1 << 4 : runtime_name_equal(button, "SELECT") ? 1 << 5 : 0;
        case 'U': return runtime_name_equal(button, "UP") ? 1 << 6 : 0;
        case 'D': return runtime_name_equal(button, "DOWN") ? 1 << 7 : 0;
        default: return 0;
    }
}

uint8_t group_mask(const char* group)
{
    const char* value = group ? group : "";
    if(runtime_name_equal(value, "gameplay")) return 1 << 0;
    if(runtime_name_equal(value, "menu")) return 1 << 1;
    if(runtime_name_equal(value, "interaction")) return 1 << 2;
    if(runtime_name_equal(value, "all")) return 1 << 3;
    return 0;
}



const InputBinding* find_binding(const char* action)
{
    if(! action || ! input_bindings || input_bindings_count <= 0) return nullptr;
    const char* target = action;
    for(int index = 0; index < input_bindings_count; ++index)
    {
        if(input_bindings[index].action && runtime_name_equal(input_bindings[index].action, target))
            return &input_bindings[index];
    }
    // Legacy menu actions follow the renamed Select binding.
    if(runtime_name_equal(action, "menu")) return find_binding("select");
    if(runtime_name_equal(action, "pause")) return find_binding("start");
    return nullptr;
}

uint16_t disabled_button_mask()
{
    if(disabled_groups & (1 << 3)) return 0x3ff;
    uint16_t mask = 0;
    if(disabled_groups & (1 << 0)) mask |= configured_group_masks ? configured_group_masks[0] : 0x3cf;
    if(disabled_groups & (1 << 1)) mask |= configured_group_masks ? configured_group_masks[1] : 0x3f3;
    if(disabled_groups & (1 << 2)) mask |= configured_group_masks ? configured_group_masks[2] : 1;
    return mask;
}

bool compiled_mask(const InputBinding* binding, uint16_t& mask)
{
    const int index = int(binding - input_bindings);
    if(index < 0 || index >= 32 || !(compiled_bindings & (uint32_t(1) << index))) return false;
    mask = compiled_binding_masks[index];
    return true;
}

const char* fallback_button(const char* action)
{
    const char* value = action ? action : "";
    if(runtime_name_equal(value, "move_left")) return "LEFT";
    if(runtime_name_equal(value, "move_right")) return "RIGHT";
    if(runtime_name_equal(value, "move_up")) return "UP";
    if(runtime_name_equal(value, "move_down")) return "DOWN";
    if(runtime_name_equal(value, "confirm") || runtime_name_equal(value, "interact") || runtime_name_equal(value, "shoot")) return "A";
    if(runtime_name_equal(value, "jump") || runtime_name_equal(value, "cancel")) return "B";
    if(runtime_name_equal(value, "pause") || runtime_name_equal(value, "start")) return "START";
    if(runtime_name_equal(value, "menu") || runtime_name_equal(value, "select")) return "SELECT";
    if(runtime_name_equal(value, "left_button")) return "L";
    if(runtime_name_equal(value, "right_button")) return "R";
    return nullptr;
}

bool hardware_pressed(uint16_t mask)
{
    return ((mask & (1 << 0)) && bn::keypad::a_pressed()) ||
        ((mask & (1 << 1)) && bn::keypad::b_pressed()) ||
        ((mask & (1 << 2)) && bn::keypad::l_pressed()) ||
        ((mask & (1 << 3)) && bn::keypad::r_pressed()) ||
        ((mask & (1 << 4)) && bn::keypad::start_pressed()) ||
        ((mask & (1 << 5)) && bn::keypad::select_pressed()) ||
        ((mask & (1 << 6)) && bn::keypad::up_pressed()) ||
        ((mask & (1 << 7)) && bn::keypad::down_pressed()) ||
        ((mask & (1 << 8)) && bn::keypad::left_pressed()) ||
        ((mask & (1 << 9)) && bn::keypad::right_pressed());
}
bool hardware_held(uint16_t mask)
{
    return ((mask & (1 << 0)) && bn::keypad::a_held()) ||
        ((mask & (1 << 1)) && bn::keypad::b_held()) ||
        ((mask & (1 << 2)) && bn::keypad::l_held()) ||
        ((mask & (1 << 3)) && bn::keypad::r_held()) ||
        ((mask & (1 << 4)) && bn::keypad::start_held()) ||
        ((mask & (1 << 5)) && bn::keypad::select_held()) ||
        ((mask & (1 << 6)) && bn::keypad::up_held()) ||
        ((mask & (1 << 7)) && bn::keypad::down_held()) ||
        ((mask & (1 << 8)) && bn::keypad::left_held()) ||
        ((mask & (1 << 9)) && bn::keypad::right_held());
}
}

InputSnapshot InputManager::poll() const
{
    frame_default_actions = queued_default_actions;
    default_pressed = frame_default_actions;
    default_held = frame_default_actions;
    queued_default_actions = 0;
    for(int index = 0; index < 10; ++index) {
        pressed_source_actions[index] = queued_source_actions[index];
        queued_source_actions[index] = 0;
        default_pressed |= pressed_source_actions[index];
        default_held |= pressed_source_actions[index];
        if(held_default_actions[index]) {
            if(hardware_held(uint16_t(1 << index))) default_held |= held_default_actions[index];
            else held_default_actions[index] = 0;
        }
    }
    return {
        pressed("confirm"),
        pressed("cancel"),
        pressed("move_up"),
        pressed("move_down"),
        false,
    };
}

bool InputManager::pressed(const char* button) const
{
    const uint16_t mask = button_mask(button);
    if(!mask) {
        if(find_binding(button)) return action_pressed(button);
        if(const char* fallback = fallback_button(button)) return pressed(fallback);
        return false;
    }
    const uint16_t disabled = disabled_button_mask();
    if((default_pressed & mask) && !(disabled & mask)) return true;
    if((overridden_buttons | disabled) & mask) return false;
    return hardware_pressed(mask);
}

bool InputManager::binding_pressed(const char* button) const
{
    const uint16_t physical = button_mask(button);
    if(!physical)
    {
        const InputBinding* binding = find_binding(button);
        if(binding && binding->buttons)
        {
            uint16_t mask;
            if(compiled_mask(binding, mask)) return hardware_pressed(mask & ~disabled_button_mask());
            for(int index = 0; index < binding->buttons_count; ++index)
                if(binding->buttons[index] && binding_pressed(binding->buttons[index])) return true;
            return false;
        }
        if(const char* fallback = fallback_button(button)) return binding_pressed(fallback);
        return false;
    }
    if((disabled_button_mask() & physical) != 0) return false;
    return hardware_pressed(physical);
}

bool InputManager::binding_held(const char* button) const
{
    const uint16_t physical = button_mask(button);
    if(!physical)
    {
        const InputBinding* binding = find_binding(button);
        if(binding && binding->buttons)
        {
            uint16_t mask;
            if(compiled_mask(binding, mask)) return hardware_held(mask & ~disabled_button_mask());
            for(int index = 0; index < binding->buttons_count; ++index)
                if(binding->buttons[index] && binding_held(binding->buttons[index])) return true;
            return false;
        }
        if(const char* fallback = fallback_button(button)) return binding_held(fallback);
        return false;
    }
    if((disabled_button_mask() & physical) != 0) return false;
    return hardware_held(physical);
}

bool InputManager::held(const char* button) const
{
    const uint16_t mask = button_mask(button);
    if(!mask) {
        if(find_binding(button)) return action_held(button);
        if(const char* fallback = fallback_button(button)) return held(fallback);
        return false;
    }
    const uint16_t disabled = disabled_button_mask();
    if((default_held & mask) && !(disabled & mask)) return true;
    if((overridden_buttons | disabled) & mask) return false;
    return hardware_held(mask);
}

bool InputManager::action_pressed(const char* action) const
{
    const InputBinding* binding = find_binding(action);
    if(! binding || ! binding->buttons) return false;
    uint16_t mask;
    if(compiled_mask(binding, mask)) {
        mask &= ~disabled_button_mask();
        return (mask & default_pressed) || hardware_pressed(mask & ~overridden_buttons);
    }
    for(int index = 0; index < binding->buttons_count; ++index)
        if(binding->buttons[index] && pressed(binding->buttons[index])) return true;
    return false;
}

bool InputManager::action_held(const char* action) const
{
    const InputBinding* binding = find_binding(action);
    if(! binding || ! binding->buttons) return false;
    uint16_t mask;
    if(compiled_mask(binding, mask)) {
        mask &= ~disabled_button_mask();
        return (mask & default_held) || hardware_held(mask & ~overridden_buttons);
    }
    for(int index = 0; index < binding->buttons_count; ++index)
        if(binding->buttons[index] && held(binding->buttons[index])) return true;
    return false;
}

void InputManager::configure(const InputBinding* bindings, int bindings_count, const unsigned short* group_masks)
{
    default_bindings = bindings;
    default_bindings_count = bindings_count;
    configured_group_masks = group_masks;
    input_bindings = bindings;
    input_bindings_count = bindings && bindings_count > 0 ? bindings_count : 0;
    compiled_bindings = 0;
    for(int index = 0; index < input_bindings_count && index < 32; ++index) {
        const auto& binding = input_bindings[index];
        if(!binding.buttons || binding.buttons_count < 0) continue;
        uint16_t mask = 0;
        bool physical_only = true;
        for(int button = 0; button < binding.buttons_count; ++button) {
            if(!binding.buttons[button]) continue;
            const uint16_t physical = button_mask(binding.buttons[button]);
            if(!physical) { physical_only = false; break; }
            mask |= physical;
        }
        if(physical_only) { compiled_binding_masks[index] = mask; compiled_bindings |= uint32_t(1) << index; }
    }
}

void InputManager::configure_scene_maps(const SceneInputMap* maps, int count)
{
    scene_input_maps = maps;
    scene_input_maps_count = maps && count > 0 ? count : 0;
}

void InputManager::set_scene_type(const char* type)
{
    const InputBinding* bindings = default_bindings;
    int count = default_bindings_count;
    if(type && runtime_name_equal(type, "Platform")) type = "Platformer";
    for(int index = 0; type && index < scene_input_maps_count; ++index)
    {
        const auto& map = scene_input_maps[index];
        if(map.scene_type && runtime_name_equal(map.scene_type, type))
        {
            bindings = map.bindings;
            count = map.bindings_count;
            break;
        }
    }
    const InputBinding* fallback = default_bindings;
    const int fallback_count = default_bindings_count;
    configure(bindings, count, configured_group_masks);
    default_bindings = fallback;
    default_bindings_count = fallback_count;
}

void InputManager::set_override(const char* button, bool enabled)
{
    const uint16_t mask = button_mask(button);
    if(enabled) overridden_buttons |= mask;
    else overridden_buttons &= ~mask;
}

bool InputManager::is_overridden(const char* button) const
{
    return (overridden_buttons & button_mask(button)) != 0;
}

bool InputManager::is_blocked(const char* button) const
{
    return ((overridden_buttons | disabled_button_mask()) & button_mask(button)) != 0;
}

bool InputManager::set_group_enabled(const char* group, bool enabled)
{
    const uint8_t mask = group_mask(group);
    if(! mask) return false;
    if(enabled) disabled_groups &= ~mask;
    else disabled_groups |= mask;
    return true;
}

void InputManager::clear_overrides()
{
    overridden_buttons = 0;
    disabled_groups = 0;
    queued_default_actions = default_pressed = default_held = 0;
    frame_default_actions = 0;
    for(auto& actions : queued_source_actions) actions = 0;
    for(auto& actions : pressed_source_actions) actions = 0;
    for(auto& actions : held_default_actions) actions = 0;
}

bool InputManager::queue_default_action(const char* button, const char* held_by)
{
    const uint16_t mask = button_mask(button);
    if(!mask) return false;
    uint16_t trigger = button_mask(held_by);
    if(held_by && *held_by && !trigger) {
        if(const auto* binding = find_binding(held_by)) {
            for(int i = 0; binding->buttons && i < binding->buttons_count; ++i) trigger |= button_mask(binding->buttons[i]);
        } else trigger = button_mask(fallback_button(held_by));
        if(!trigger) return false;
    }
    if(!trigger) queued_default_actions |= mask;
    for(int index = 0; index < 10; ++index) if(trigger & (1 << index)) {
        queued_source_actions[index] |= mask;
        held_default_actions[index] |= mask;
    }
    return true;
}

void InputManager::clear_button_actions(const char* button)
{
    const uint16_t source = button_mask(button);
    if(!source) {
        if(const auto* binding = find_binding(button)) {
            for(int index = 0; binding->buttons && index < binding->buttons_count; ++index)
                if(button_mask(binding->buttons[index])) clear_button_actions(binding->buttons[index]);
        } else if(const char* fallback = fallback_button(button)) clear_button_actions(fallback);
        return;
    }
    for(int index = 0; index < 10; ++index) if(source & (1 << index)) {
        queued_source_actions[index] = 0;
        pressed_source_actions[index] = 0;
        held_default_actions[index] = 0;
    }
    default_pressed = frame_default_actions;
    default_held = frame_default_actions;
    for(int index = 0; index < 10; ++index) {
        default_pressed |= pressed_source_actions[index];
        default_held |= pressed_source_actions[index] | held_default_actions[index];
    }
}
