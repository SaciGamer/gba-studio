#ifndef DIALOGUE_MANAGER_H
#define DIALOGUE_MANAGER_H

#include "bn_string.h"
#include "bn_sprite_ptr.h"
#include "bn_regular_bg_ptr.h"
#include "bn_vector.h"
#include "resource_types.h"

class DialogueManager {
    bn::string<256> text;
    bn::string<256> full_text;
    bool visible = false;
    bool acknowledged = false;
    bool animate_text = true;
    int animation_interval = 2;
    int reveal_count = 0;
    int reveal_tick = 0;
    int frame_tick = 0;
    int page_index = 0;
    int page_count = 0;
    DialogueChoiceEventData choice_data{};
    bool choice_visible = false;
    bool choice_acknowledged = false;
    bool closing = false;
    bool close_finished = false;
    int frame_animation = 0;
    int choice_index = 0;
    const char* horizontal_align = "center";
    const char* vertical_align = "bottom";
    const char* dialogue_font = "fixed8x16";
    bool show_frame = true;
    bool variable_text_visible = false;
    VariableTextEventData variable_text{};
    bn::vector<bn::sprite_ptr, 256> rendered_sprites;
    bn::optional<bn::regular_bg_ptr> rendered_frame_bg;

    void load_page();
    void clear_rendered();
    void render_variable_text();
public:
    static DialogueManager& instance();
    bool show(const bn::string<256>& value, const char* font = "fixed8x16", bool frame = true, const char* horizontal = "center", const char* vertical = "bottom", bool animate = true, const char* speed = "medium");
    bool acknowledge();
    void hide();
    const bn::string<256>& current_text() const { return text; }
    bool is_visible() const { return visible; }
    int current_page() const { return page_index; }
    int total_pages() const { return page_count; }
    bool show_choice(const DialogueChoiceEventData& data);
    bool show_variable_text(const VariableTextEventData& data);
    void cycle_choice() { if(choice_visible) choice_index = choice_index == 0 ? 1 : 0; }
    bool acknowledge_choice();
    bool is_choice_visible() const { return choice_visible; }
    int choice_index_value() const { return choice_index; }
    void render();
};

#endif
