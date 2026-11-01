#ifndef DIALOGUE_MANAGER_H
#define DIALOGUE_MANAGER_H

#include "bn_string.h"
#include "bn_sprite_ptr.h"
#include "bn_regular_bg_ptr.h"
#include "bn_vector.h"
#include "bn_array.h"
#include "resource_types.h"
#include "menu_layout.h"
#include "gba_studio_features.h"
#include <cstdint>

class DialogueManager {
    bn::string<256> text;
    bn::string<256> full_text;
    bool visible = false;
    bool acknowledged = false;
    bool manual_close = false;
    bool animate_text = true;
    int animation_interval = 2;
    int reveal_count = 0;
    int reveal_tick = 0;
    int frame_tick = 0;
    int page_index = 0;
    int page_count = 0;
    bool choice_visible = false;
#if GBA_STUDIO_FEATURE_CHOICES
    DialogueChoiceEventData choice_data{};
    bool choice_acknowledged = false;
    bool choice_cancelled = false;
    bn::string<256> choice_prompt_text;
    int choice_reveal_count = 0;
    int choice_reveal_tick = 0;
    int choice_options_revealed = 0;
    int choice_option_reveal_tick = 0;
    bool choice_options_visible = false;
    bool choice_render_ready = false;
    bool choice_render_cached = false;
    bool choice_resource_warning = false;
#endif
    bool closing = false;
    bool close_finished = false;
    int frame_animation = 0;
#if GBA_STUDIO_FEATURE_CHOICES
    int choice_index = 0;
    bn::array<bn::string<64>, menu_layout::max_options> choice_options{};
    int choice_prompt_rows = 0;
    int choice_options_count = 0;
    int choice_columns() const { return menu_layout::columns_for_position(choice_data.columns, choice_data.menu_position); }
    int choice_rows() const { return menu_layout::visible_rows(choice_data.menu_position, choice_prompt_rows); }
#endif
    const char* horizontal_align = "center";
    const char* vertical_align = "bottom";
    const char* dialogue_font = "fixed8x16";
    const char* avatar_image = "";
    const char* avatar_placement = "inside";
    const char* avatar_anchor = "top-left";
    int avatar_size = 16;
    int avatar_x = 112, avatar_y = 16;
    bool show_frame = true;
    bool variable_text_visible = false;
    VariableTextEventData variable_text{};
#if GBA_STUDIO_FEATURE_UI
    struct UiElementState {
        const char* id = nullptr;
        UiSetTextEventData text{};
        bn::string<64> storage;
        int sprite_start = 0, sprite_count = 0;
        bool visible = false;
        bool hidden = false;
        bool sprites_visible = false;
        bool rendered = false;
        bool dirty = true;
#if GBA_STUDIO_FEATURE_UI_ANIMATION
        bool move_active = false;
        bool blink_active = false;
        bool blink_visible = true;
        int start_x = 0, start_y = 0, target_x = 0, target_y = 0;
        int move_speed_units = 16, move_speed_accumulator = 0, move_elapsed = 0;
        int blink_speed_units = 16, blink_elapsed = 0, blink_duration = 0, blink_tick = 0;
#endif
        bool should_show() const {
            return visible && !hidden
#if GBA_STUDIO_FEATURE_UI_ANIMATION
                && !(blink_active && !blink_visible)
#endif
                ;
        }
    };
    bn::array<UiElementState, 16> ui_elements{};
    void release_ui_sprites(UiElementState& state);
    const char* last_ui_id = nullptr;
    bn::vector<bn::sprite_ptr, 128> ui_rendered_sprites;
#endif
    bn::vector<bn::sprite_ptr, 256> rendered_sprites;
    // Wrapped text offsets are stored in EWRAM; avoid placing 32 strings of
    // 256 bytes (over 8 KiB) on the GBA stack every render.
    bn::optional<bn::regular_bg_ptr> rendered_frame_bg;

    void load_page();
    void clear_rendered();
    void render_variable_text();
    void render_ui_text();
    bool set_ui_hidden(const UiTargetEventData& data, bool hidden);
public:
    static DialogueManager& instance();
    bool show(const char* value, const char* font = "fixed8x16", bool frame = true, const char* horizontal = "center", const char* vertical = "bottom", bool animate = true, const char* speed = "medium", bool manual = false, const char* avatar = "", int avatar_size = 16, const char* avatar_placement = "inside", const char* avatar_anchor = "top-left", int avatar_x = 112, int avatar_y = 16);
    bool acknowledge();
    void hide();
    const bn::string<256>& current_text() const { return text; }
    bool is_visible() const { return visible; }
    int current_page() const { return page_index; }
    int total_pages() const { return page_count; }
    bool show_choice(const DialogueChoiceEventData& data);
    bool show_variable_text(const VariableTextEventData& data);
    bool set_ui_text(const UiSetTextEventData& data);
    bool set_ui_value(const UiSetValueEventData& data);
    bool animate_ui(const UiAnimateEventData& data);
    bool destroy_ui(const UiTargetEventData& data);
    bool hide_ui(const UiTargetEventData& data) { return set_ui_hidden(data, true); }
    bool show_ui(const UiTargetEventData& data) { return set_ui_hidden(data, false); }
    bool stop_ui_animation(const UiAnimationStopEventData& data);
#if GBA_STUDIO_FEATURE_CHOICES
    void move_choice(int dx, int dy) {
        if(!choice_visible || !choice_render_ready || !choice_options_visible || frame_animation < 8 || choice_options_count <= 0) return;
        choice_index = menu_layout::move(choice_index, choice_options_count, choice_columns(), choice_rows(), choice_data.column_major && choice_columns() > 1, dx, dy);
        choice_render_ready = false;
        choice_render_cached = false;
    }
    void cycle_choice(int direction = 1) { move_choice(0, direction); }
    bool acknowledge_choice();
    bool cancel_choice();
    int choice_index_value() const { return choice_index; }
#else
    void move_choice(int, int) {}
    void cycle_choice(int = 1) {}
    bool acknowledge_choice() { return false; }
    int choice_index_value() const { return 0; }
#endif
    bool is_choice_visible() const { return choice_visible; }
    void render();
};

#endif
