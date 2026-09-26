#include "input_manager.h"
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
}

InputSnapshot InputManager::poll() const
{
    return {
        bn::keypad::a_pressed() && !is_overridden("A"),
        bn::keypad::b_pressed() && !is_overridden("B"),
        bn::keypad::up_pressed() && !is_overridden("UP"),
        bn::keypad::down_pressed() && !is_overridden("DOWN"),
        false,
    };
}

bool InputManager::pressed(const char* button) const
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

bool InputManager::held(const char* button) const
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

void InputManager::clear_overrides()
{
    overridden_buttons = 0;
}
