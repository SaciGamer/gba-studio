#pragma once
class DialogueManager {
public:
    static DialogueManager& instance() { static DialogueManager value; return value; }
    bool is_visible() const { return false; }
    bool is_choice_visible() const { return false; }
    void move_choice(int, int) {}
    void cycle_choice(int = 1) {}
    void acknowledge_choice() {}
    void cancel_choice() {}
    void acknowledge() {}
    void render() {}
};
