#include <iostream>
#include "input_manager.h"
#include "resource_types.h"
#include "bn_keypad.h"

int main()
{
    InputManager& input = InputManager::instance();
    input.clear_overrides();
    const char* move_buttons[] = {"LEFT"};
    const InputBinding bindings[] = {{"move_left", move_buttons, 1}};
    input.configure(bindings, 1);
    bn::keypad::a_pressed_state = true;
    bn::keypad::left_pressed_state = true;
    bn::keypad::start_pressed_state = true;

    if(! input.pressed("A") || ! input.pressed("LEFT") || ! input.pressed("START")) return 1;
    if(! input.action_pressed("move_left") || input.action_pressed("missing")) return 12;
    if(! input.pressed("move_left") || ! input.held("move_left")) return 13;
    if(! input.set_group_enabled("gameplay", false)) return 2;
    if(input.pressed("A") || input.pressed("LEFT") || ! input.pressed("START")) return 3;
    if(! input.set_group_enabled("menu", false) || input.pressed("START")) return 4;
    if(! input.set_group_enabled("gameplay", true) || input.pressed("A")) return 5;
    if(! input.set_group_enabled("menu", true) || ! input.pressed("START")) return 6;
    if(! input.set_group_enabled("interaction", false) || input.pressed("A")) return 7;
    if(! input.set_group_enabled("interaction", true) || ! input.pressed("A")) return 8;
    if(input.set_group_enabled("unknown", false)) return 9;
    input.set_override("A", true);
    if(input.pressed("A")) return 10;
    if(!input.binding_pressed("A") || !input.binding_pressed("confirm")) return 15;
    input.set_override("START", true);
    if(input.pressed("START") || !input.binding_pressed("START")) return 16;
    input.set_group_enabled("menu", false);
    if(input.binding_pressed("A") || input.binding_pressed("START")) return 17;
    input.set_group_enabled("menu", true);
    bn::keypad::b_pressed_state = true;
    input.set_override("B", true);
    if(input.pressed("B") || !input.binding_pressed("B")) return 18;
    input.clear_overrides();
    input.configure(nullptr, 0);
    if(! input.pressed("move_left") || ! input.held("move_left")) return 14;
    if(! input.pressed("A")) return 11;
    std::cout << "Input group behavior passed.\n";
}
