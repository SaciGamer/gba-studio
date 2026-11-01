// Frozen pre-optimization runtime used only as the differential test oracle.
// The test renames the class and links it beside the production InputManager.
#include "input_manager.h"
#include "resource_types.h"
#include "bn_keypad.h"
#include "bn_string.h"
#include <cstdint>

InputManager& InputManager::instance()
{
    static InputManager manager;
    return manager;
}

namespace {
uint16_t overridden_buttons = 0;
uint8_t disabled_groups = 0;
const InputBinding* input_bindings = nullptr;
int input_bindings_count = 0;
const char* const physical_buttons[] = { "A", "B", "L", "R", "START", "SELECT", "UP", "DOWN", "LEFT", "RIGHT" };
uint16_t queued_default_actions = 0, default_pressed = 0, default_held = 0;
uint16_t frame_default_actions = 0;
uint16_t queued_source_actions[10] = {}, pressed_source_actions[10] = {};
uint16_t held_default_actions[10] = {};
uint16_t button_mask(const char* button)
{
    const bn::string<16> value = button ? button : "";
    if(value == "A") return 1 << 0;
    if(value == "B") return 1 << 1;
    if(value == "L") return 1 << 2;
    if(value == "R") return 1 << 3;
    if(value == "START") return 1 << 4;
    if(value == "SELECT") return 1 << 5;
    if(value == "UP") return 1 << 6;
    if(value == "DOWN") return 1 << 7;
    if(value == "LEFT") return 1 << 8;
    if(value == "RIGHT") return 1 << 9;
    return 0;
}

uint8_t group_mask(const char* group)
{
    const bn::string<16> value = group ? group : "";
    if(value == "gameplay") return 1 << 0;
    if(value == "menu") return 1 << 1;
    if(value == "interaction") return 1 << 2;
    if(value == "all") return 1 << 3;
    return 0;
}

uint8_t button_group_mask(const char* button)
{
    const uint16_t mask = button_mask(button);
    if(! mask) return 0;
    uint8_t result = 1 << 3;
    if(mask & ((1 << 0) | (1 << 1) | (1 << 2) | (1 << 3) | (1 << 6) | (1 << 7) | (1 << 8) | (1 << 9))) result |= 1 << 0;
    if(mask & ((1 << 0) | (1 << 1) | (1 << 4) | (1 << 5) | (1 << 6) | (1 << 7) | (1 << 8) | (1 << 9))) result |= 1 << 1;
    if(mask & (1 << 0)) result |= 1 << 2;
    return result;
}

const InputBinding* find_binding(const char* action)
{
    if(! action || ! input_bindings || input_bindings_count <= 0) return nullptr;
    const bn::string<32> target(action);
    for(int index = 0; index < input_bindings_count; ++index)
    {
        if(input_bindings[index].action && bn::string<32>(input_bindings[index].action) == target)
            return &input_bindings[index];
    }
    return nullptr;
}

const char* fallback_button(const char* action)
{
    const bn::string<32> value = action ? action : "";
    if(value == "move_left") return "LEFT";
    if(value == "move_right") return "RIGHT";
    if(value == "move_up") return "UP";
    if(value == "move_down") return "DOWN";
    if(value == "confirm" || value == "interact" || value == "shoot") return "A";
    if(value == "jump" || value == "cancel") return "B";
    if(value == "pause") return "START";
    if(value == "menu") return "SELECT";
    return nullptr;
}

bool hardware_pressed(const char* button)
{
    const bn::string<16> value = button ? button : "";
    if(value == "A") return bn::keypad::a_pressed();
    if(value == "B") return bn::keypad::b_pressed();
    if(value == "L") return bn::keypad::l_pressed();
    if(value == "R") return bn::keypad::r_pressed();
    if(value == "START") return bn::keypad::start_pressed();
    if(value == "SELECT") return bn::keypad::select_pressed();
    if(value == "UP") return bn::keypad::up_pressed();
    if(value == "DOWN") return bn::keypad::down_pressed();
    if(value == "LEFT") return bn::keypad::left_pressed();
    if(value == "RIGHT") return bn::keypad::right_pressed();
    return false;
}
bool hardware_held(const char* button)
{
    const bn::string<16> value = button ? button : "";
    if(value == "A") return bn::keypad::a_held();
    if(value == "B") return bn::keypad::b_held();
    if(value == "L") return bn::keypad::l_held();
    if(value == "R") return bn::keypad::r_held();
    if(value == "START") return bn::keypad::start_held();
    if(value == "SELECT") return bn::keypad::select_held();
    if(value == "UP") return bn::keypad::up_held();
    if(value == "DOWN") return bn::keypad::down_held();
    if(value == "LEFT") return bn::keypad::left_held();
    if(value == "RIGHT") return bn::keypad::right_held();
    return false;
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
            if(hardware_held(physical_buttons[index])) default_held |= held_default_actions[index];
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
    if(!button_mask(button) && find_binding(button)) return action_pressed(button);
    if(!button_mask(button) && !find_binding(button))
        if(const char* fallback = fallback_button(button)) return pressed(fallback);
    if((default_pressed & button_mask(button)) && !(disabled_groups & button_group_mask(button))) return true;
    if(is_blocked(button)) return false;
    return hardware_pressed(button);
}

bool InputManager::binding_pressed(const char* button) const
{
    if(!button_mask(button))
    {
        const InputBinding* binding = find_binding(button);
        if(binding && binding->buttons)
        {
            for(int index = 0; index < binding->buttons_count; ++index)
                if(binding->buttons[index] && binding_pressed(binding->buttons[index])) return true;
            return false;
        }
        if(const char* fallback = fallback_button(button)) return binding_pressed(fallback);
        return false;
    }
    if((disabled_groups & button_group_mask(button)) != 0) return false;
    return hardware_pressed(button);
}

bool InputManager::binding_held(const char* button) const
{
    if(!button_mask(button))
    {
        const InputBinding* binding = find_binding(button);
        if(binding && binding->buttons)
        {
            for(int index = 0; index < binding->buttons_count; ++index)
                if(binding->buttons[index] && binding_held(binding->buttons[index])) return true;
            return false;
        }
        if(const char* fallback = fallback_button(button)) return binding_held(fallback);
        return false;
    }
    if((disabled_groups & button_group_mask(button)) != 0) return false;
    return hardware_held(button);
}

bool InputManager::held(const char* button) const
{
    const bn::string<16> value = button ? button : "";
    if(!button_mask(button) && find_binding(button)) return action_held(button);
    if(!button_mask(button) && !find_binding(button))
        if(const char* fallback = fallback_button(button)) return held(fallback);
    if((default_held & button_mask(button)) && !(disabled_groups & button_group_mask(button))) return true;
    if(is_blocked(button)) return false;
    if(value == "A") return bn::keypad::a_held();
    if(value == "B") return bn::keypad::b_held();
    if(value == "L") return bn::keypad::l_held();
    if(value == "R") return bn::keypad::r_held();
    if(value == "START") return bn::keypad::start_held();
    if(value == "SELECT") return bn::keypad::select_held();
    if(value == "UP") return bn::keypad::up_held();
    if(value == "DOWN") return bn::keypad::down_held();
    if(value == "LEFT") return bn::keypad::left_held();
    if(value == "RIGHT") return bn::keypad::right_held();
    return false;
}

bool InputManager::action_pressed(const char* action) const
{
    const InputBinding* binding = find_binding(action);
    if(! binding || ! binding->buttons) return false;
    for(int index = 0; index < binding->buttons_count; ++index)
        if(binding->buttons[index] && pressed(binding->buttons[index])) return true;
    return false;
}

bool InputManager::action_held(const char* action) const
{
    const InputBinding* binding = find_binding(action);
    if(! binding || ! binding->buttons) return false;
    for(int index = 0; index < binding->buttons_count; ++index)
        if(binding->buttons[index] && held(binding->buttons[index])) return true;
    return false;
}

void InputManager::configure(const InputBinding* bindings, int bindings_count)
{
    input_bindings = bindings;
    input_bindings_count = bindings && bindings_count > 0 ? bindings_count : 0;
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
    return is_overridden(button) || (disabled_groups & button_group_mask(button)) != 0;
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
