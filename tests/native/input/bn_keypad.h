#pragma once

namespace bn::keypad {
inline bool a_pressed_state = false;
inline bool b_pressed_state = false;
inline bool l_pressed_state = false;
inline bool r_pressed_state = false;
inline bool start_pressed_state = false;
inline bool select_pressed_state = false;
inline bool up_pressed_state = false;
inline bool down_pressed_state = false;
inline bool left_pressed_state = false;
inline bool right_pressed_state = false;
inline bool a_pressed() { return a_pressed_state; }
inline bool b_pressed() { return b_pressed_state; }
inline bool l_pressed() { return l_pressed_state; }
inline bool r_pressed() { return r_pressed_state; }
inline bool start_pressed() { return start_pressed_state; }
inline bool select_pressed() { return select_pressed_state; }
inline bool up_pressed() { return up_pressed_state; }
inline bool down_pressed() { return down_pressed_state; }
inline bool left_pressed() { return left_pressed_state; }
inline bool right_pressed() { return right_pressed_state; }
inline bool a_held() { return a_pressed_state; }
inline bool b_held() { return b_pressed_state; }
inline bool l_held() { return l_pressed_state; }
inline bool r_held() { return r_pressed_state; }
inline bool start_held() { return start_pressed_state; }
inline bool select_held() { return select_pressed_state; }
inline bool up_held() { return up_pressed_state; }
inline bool down_held() { return down_pressed_state; }
inline bool left_held() { return left_pressed_state; }
inline bool right_held() { return right_pressed_state; }
}
