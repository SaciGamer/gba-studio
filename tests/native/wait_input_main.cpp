#include <iostream>

#include "event_wait_input.h"
#include "input_manager.h"
#include "bn_keypad.h"

int main()
{
    InputManager& input = InputManager::instance();
    input.clear_overrides();
    const char* confirm_buttons[] = {"A"};
    const InputBinding bindings[] = {{"confirm", confirm_buttons, 1}};
    input.configure(bindings, 1);

    const WaitInputEventData timeout_data{"confirm", 2};
    WaitInput state{};
    if(run_wait_input_status(timeout_data, state) != EventStatus::running) return 1;
    if(run_wait_input_status(timeout_data, state) != EventStatus::running) return 2;
    if(run_wait_input_status(timeout_data, state) != EventStatus::completed) return 3;

    state = WaitInput();
    bn::keypad::a_pressed_state = true;
    if(run_wait_input_status(timeout_data, state) != EventStatus::completed) return 4;
    bn::keypad::a_pressed_state = false;

    const WaitInputEventData invalid{"", 0};
    if(run_wait_input_status(invalid, state) != EventStatus::failed) return 5;
    std::cout << "Wait input behavior passed.\n";
}
