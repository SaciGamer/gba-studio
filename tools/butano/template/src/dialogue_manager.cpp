#include "dialogue_manager.h"
#include "graphics_manager.h"
#include "resource_registry.h"
#include "variable_manager.h"
#include "bn_sprite_text_generator.h"
#include "bn_sprites.h"
#include "bn_log.h"
#include "common_variable_8x16_sprite_font.h"
#include "common_fixed_8x8_sprite_font.h"
#include "common_fixed_8x16_sprite_font.h"
#include "common_variable_8x8_sprite_font.h"
#include "common_variable_16x16_sprite_font.h"

#ifndef BN_DATA_EWRAM_BSS
#define BN_DATA_EWRAM_BSS __attribute__((section(".sbss")))
#endif
#ifndef BN_DATA_EWRAM
#define BN_DATA_EWRAM __attribute__((section(".ewram")))
#endif

namespace
{
    constexpr int max_dialogue_bytes = 255;
    constexpr int max_dialogue_lines = 256;
    BN_DATA_EWRAM_BSS uint8_t dialogue_line_starts[max_dialogue_lines] = {};
    // The renderer owns fixed-capacity sprite storage. Keep the singleton in
    // EWRAM so it doesn't consume the IWRAM reserved for the GBA stack.
    BN_DATA_EWRAM DialogueManager dialogue_manager_instance;

    int utf8_sequence_size(unsigned char first)
    {
        if((first & 0x80) == 0) return 1;
        if((first & 0xE0) == 0xC0) return 2;
        if((first & 0xF0) == 0xE0) return 3;
        if((first & 0xF8) == 0xF0) return 4;
        return 1;
    }

    // Offscreen glyphs must not consume OAM/tiles. Keep the advance of the
    // selected font, including spaces, and retain partially visible glyphs.
    bool generate_screen_text(bn::sprite_text_generator& generator, int x, int y,
                              const bn::string_view& text, bn::ivector<bn::sprite_ptr>& output)
    {
        const int height = generator.font().item().shape_size().height();
        if(y >= 160 || y + height <= 0 || x >= 240 || text.empty()) return true;
        bn::string<256> clipped;
        int position = x;
        int first_x = x;
        const int text_size = text.size();
        for(int index = 0; index < text_size && position < 240;)
        {
            const int size = utf8_sequence_size(static_cast<unsigned char>(text[index]));
            if(index + size > text_size) break;
            bn::string<8> glyph;
            for(int byte = 0; byte < size; ++byte) glyph.push_back(text[index++]);
            const int advance = generator.width(glyph);
            if(position + advance > 0)
            {
                if(clipped.empty()) first_x = position;
                for(char byte : glyph) clipped.push_back(byte);
            }
            position += advance;
        }
        const int start = output.size();
        if(clipped.empty() || generator.generate_top_left_optional(first_x, y, clipped, output)) return true;
        // Optional generation may leave a partial line behind. Roll it back.
        while(output.size() > start) output.pop_back();
        return false;
    }

    bool utf8_continuation(unsigned char value)
    {
        return (value & 0xC0) == 0x80;
    }

    bn::string<256> sanitize_utf8(const bn::string<256>& source)
    {
        bn::string<256> result;
        for(int index = 0; index < source.size();)
        {
            const unsigned char first = static_cast<unsigned char>(source[index]);
            int sequence_size = 0;
            if(first <= 0x7F) sequence_size = 1;
            else if(first >= 0xC2 && first <= 0xDF) sequence_size = 2;
            else if(first >= 0xE0 && first <= 0xEF) sequence_size = 3;
            else if(first >= 0xF0 && first <= 0xF4) sequence_size = 4;
            else
            {
                ++index;
                continue;
            }

            if(index + sequence_size > source.size()) break;
            bool valid = true;
            for(int offset = 1; offset < sequence_size; ++offset)
            {
                if(!utf8_continuation(static_cast<unsigned char>(source[index + offset])))
                {
                    valid = false;
                    break;
                }
            }
            if(!valid)
            {
                ++index;
                continue;
            }
            if(result.size() + sequence_size > max_dialogue_bytes) break;
            for(int offset = 0; offset < sequence_size; ++offset) result.push_back(source[index + offset]);
            index += sequence_size;
        }
        return result;
    }

    int dialogue_page_count(const bn::string<256>& value)
    {
        constexpr int page_size = 255;
        int pages = 0;
        int start = 0;
        while(start < value.size())
        {
            ++pages;
            int end = bn::min(start + page_size, value.size());
            while(end < value.size() && end > start &&
                  utf8_continuation(static_cast<unsigned char>(value[end])))
                --end;
            if(end <= start) end = bn::min(start + page_size, value.size());
            start = end;
        }
        return bn::max(1, pages);
    }

    void append_utf8_limited(bn::string<256>& target, const char* value)
    {
        if(!value) return;
        for(int index = 0; value[index] != '\0';)
        {
            const int sequence_size = utf8_sequence_size(static_cast<unsigned char>(value[index]));
            if(target.size() + sequence_size > max_dialogue_bytes) return;
            for(int byte_index = 0; byte_index < sequence_size; ++byte_index)
                if(value[index + byte_index] == '\0') return;
            for(int byte_index = 0; byte_index < sequence_size && value[index + byte_index] != '\0'; ++byte_index)
                target.push_back(value[index + byte_index]);
            index += sequence_size;
        }
    }

    bn::string<256> interpolate(const char* source)
    {
        bn::string<256> result;
        for(int i = 0; source && source[i] != '\0'; ++i)
        {
            if(source[i] == '$' && source[i + 1] == '{')
            {
                int end = i + 2;
                while(source[end] && source[end] != '}') ++end;
                if(source[end] == '}' && end - (i + 2) <= 63)
                {
                    bn::string<64> id;
                    for(int j = i + 2; j < end; ++j) id.push_back(source[j]);
                    const VariableDefinition* definition = VariableManager::instance().find(id.c_str());
                    if(definition)
                    {
                        if(definition->type == VariableType::number) append_utf8_limited(result, bn::to_string<16>(VariableManager::instance().get_number(id.c_str())).c_str());
                        else if(definition->type == VariableType::boolean) append_utf8_limited(result, VariableManager::instance().get_boolean(id.c_str()) ? "true" : "false");
                        else append_utf8_limited(result, VariableManager::instance().get_string(id.c_str()));
                        i = end;
                        continue;
                    }
                }
                // A complete reference is metadata even when its variable is
                // missing. Never display the reference itself as literal text.
                if(source[end] == '}') { i = end; continue; }
            }
            const int sequence_size = utf8_sequence_size(static_cast<unsigned char>(source[i]));
            if(result.size() + sequence_size > max_dialogue_bytes) break;
            for(int byte_index = 0; byte_index < sequence_size; ++byte_index)
                if(source[i + byte_index] == '\0') return result;
            for(int byte_index = 0; byte_index < sequence_size && source[i + byte_index] != '\0'; ++byte_index)
                result.push_back(source[i + byte_index]);
            i += sequence_size - 1;
        }
        return result;
    }
}

DialogueManager& DialogueManager::instance()
{
    return dialogue_manager_instance;
}

bool DialogueManager::show_variable_text(const VariableTextEventData& data)
{
    if(!data.variable_id || !data.variable_id[0]) return false;
    variable_text = data;
    variable_text_visible = true;
    return true;
}

#if GBA_STUDIO_FEATURE_UI
bool DialogueManager::set_ui_text(const UiSetTextEventData& data)
{
    if(!data.ui_id || !data.text)
    {
        BN_LOG("[UI] Set UI Text missing id/text");
        return false;
    }
    UiElementState* state = nullptr;
    for(UiElementState& element : ui_elements) if(element.id && bn::string<64>(element.id) == data.ui_id) { state = &element; break; }
    if(!state) for(UiElementState& element : ui_elements) if(!element.id) { state = &element; state->id = data.ui_id; break; }
    if(!state)
    {
        BN_LOG("[UI] Set UI Text capacity exhausted: ", data.ui_id);
        return false;
    }
    state->text = data;
    state->visible = data.text[0] != '\0';
    state->dirty = true;
    last_ui_id = data.ui_id;
    return true;
}

bool DialogueManager::set_ui_value(const UiSetValueEventData& data)
{
    if(!data.ui_id) return false;
    UiElementState* state = nullptr;
    for(UiElementState& element : ui_elements) if(element.id && bn::string<64>(element.id) == data.ui_id) { state = &element; break; }
    if(!state) for(UiElementState& element : ui_elements) if(!element.id) { state = &element; state->id = data.ui_id; break; }
    if(!state) return false;
    state->storage.clear();
    if(data.label) state->storage = data.label;
    if(!state->storage.empty()) state->storage += ": ";
    state->storage += bn::to_string<16>(data.value);
    last_ui_id = data.ui_id;
    UiSetTextEventData text_data{ data.ui_id, state->storage.c_str(), data.x, data.y, data.font };
    return set_ui_text(text_data);
}

#if GBA_STUDIO_FEATURE_UI_ANIMATION
bool DialogueManager::animate_ui(const UiAnimateEventData& data)
{
    if(!data.ui_id)
    {
        BN_LOG("[UI] Animate missing target id");
        return false;
    }
    const char* target_id = bn::string<64>(data.ui_id) == "__LAST_UI__" ? last_ui_id : data.ui_id;
    for(UiElementState& state : ui_elements) if(target_id && state.id && bn::string<64>(state.id) == target_id && state.visible)
    {
        const bool blink = data.animation && bn::string<8>(data.animation) == "blink";
        if(blink)
        {
            state.blink_active = true;
            state.blink_visible = true;
            state.blink_tick = 0;
            state.blink_elapsed = 0;
            state.blink_speed_units = bn::max(1, data.speed_units);
            state.blink_duration = data.duration_frames;
        }
        else
        {
            state.move_active = true;
            state.start_x = state.text.x; state.start_y = state.text.y;
            state.target_x = bn::clamp(data.x, 0, 240); state.target_y = bn::clamp(data.y, 0, 160);
            state.move_elapsed = 0;
            state.move_speed_units = bn::max(1, data.speed_units);
            state.move_speed_accumulator = 0;
        }
        BN_LOG("[UI] Animate started id=", target_id, " type=", data.animation, " speed_units=", data.speed_units);
        return true;
    }
    BN_LOG("[UI] Animate target not found or hidden: ", target_id);
    return false;
}

#endif
bool DialogueManager::set_ui_hidden(const UiTargetEventData& data, bool hidden)
{
    if(!data.ui_id || !data.ui_id[0])
    {
        BN_LOG("[UI] Visibility missing target id");
        return false;
    }
    for(UiElementState& state : ui_elements) if(state.id && bn::string<64>(state.id) == data.ui_id)
    {
        state.hidden = hidden;
        if(hidden) release_ui_sprites(state);
        return true;
    }
    BN_LOG("[UI] Visibility target not found: ", data.ui_id);
    return false;
}

void DialogueManager::release_ui_sprites(UiElementState& state)
{
    const int start = state.sprite_start;
    const int count = state.sprite_count;
    const int end = start + count;
    const int cache_size = ui_rendered_sprites.size();
    if(count > 0 && start >= 0 && end <= cache_size)
    {
        ui_rendered_sprites.erase(ui_rendered_sprites.begin() + start, ui_rendered_sprites.begin() + end);
        for(UiElementState& other : ui_elements)
            if(&other != &state && other.sprite_start >= end) other.sprite_start -= count;
    }
    state.sprite_start = 0;
    state.sprite_count = 0;
    state.sprites_visible = false;
    state.rendered = false;
}

bool DialogueManager::destroy_ui(const UiTargetEventData& data)
{
    if(!data.ui_id || !data.ui_id[0])
    {
        BN_LOG("[UI] Destroy missing target id");
        return false;
    }
    for(UiElementState& state : ui_elements) if(state.id && bn::string<64>(state.id) == data.ui_id)
    {
        release_ui_sprites(state);
        if(last_ui_id && bn::string<64>(last_ui_id) == state.id) last_ui_id = nullptr;
        // Reset text ownership, visibility, both animations, timers and ranges;
        // removing the id also makes this slot reusable by a later Set UI Text.
        state = UiElementState{};
        return true;
    }
    BN_LOG("[UI] Destroy target not found: ", data.ui_id);
    return false;
}

#if GBA_STUDIO_FEATURE_UI_ANIMATION
bool DialogueManager::stop_ui_animation(const UiAnimationStopEventData& data)
{
    if(!data.ui_id)
    {
        BN_LOG("[UI] Stop animation missing target id");
        return false;
    }
    for(UiElementState& state : ui_elements) if(state.id && bn::string<64>(state.id) == data.ui_id)
    {
        state.move_active = false;
        state.blink_active = false;
        state.blink_visible = true;
        BN_LOG("[UI] Animation stopped id=", data.ui_id);
        return true;
    }
    BN_LOG("[UI] Stop animation target not found: ", data.ui_id);
    return false;
}

#endif
void DialogueManager::render_ui_text()
{
    // Reclaim every hidden/changed UI before allocating visible text. Retain
    // logical state (including blink/move phase) for later reconstruction.
    for(UiElementState& ui : ui_elements)
        if(ui.id && (ui.dirty || !ui.should_show())) release_ui_sprites(ui);

    for(UiElementState& ui : ui_elements)
    {
        if(!ui.id) continue;
        const bool should_show = ui.should_show() && ui.text.text && ui.text.text[0];
        ui.dirty = false;
        if(!ui.rendered && should_show)
        {
            // A UI hidden before its first render is generated later, after
            // any existing cached sprites, rather than at its old empty range.
            ui.sprite_start = ui_rendered_sprites.size();
            BN_LOG("[UI] render text begin id=", ui.id, " cache=", ui_rendered_sprites.size());
            const bn::sprite_font* selected_font = &common::fixed_8x16_sprite_font;
            if(ui.text.font && ui.text.font[0] == 'f')
                selected_font = ui.text.font[7] == '8' ? &common::fixed_8x8_sprite_font : &common::fixed_8x16_sprite_font;
            else if(ui.text.font && ui.text.font[8] == '1') selected_font = &common::variable_16x16_sprite_font;
            else if(ui.text.font && ui.text.font[10] == '8') selected_font = &common::variable_8x8_sprite_font;
            else if(ui.text.font) selected_font = &common::variable_8x16_sprite_font;
            BN_LOG("[UI] render font selected id=", ui.id, " font=", ui.text.font ? ui.text.font : "(default)", " pos=", ui.text.x, ",", ui.text.y);
            bn::sprite_text_generator generator(*selected_font);
            generator.set_bg_priority(0);
            generator.set_z_order(-2);
            BN_LOG("[UI] render generator ready id=", ui.id, " cache=", ui_rendered_sprites.size());
            const bn::string<256> render_text = sanitize_utf8(interpolate(ui.text.text));
            // The editor accepts multiline UI text. Butano's text generator handles
            // one line at a time and treats '\n' as an invalid character, so split
            // the text here just like the dialogue renderer does.
            const int line_height = selected_font->item().shape_size().height();
            int line_y = ui.text.y;
            int line_number = 0;
            bool generated = true;
            bn::string<256> render_line;
            for(int text_index = 0; text_index <= render_text.size(); ++text_index)
            {
                const char character = text_index < render_text.size() ? render_text[text_index] : '\n';
                if(character == '\r') continue;
                if(character == '\n')
                {
                    if(!render_line.empty())
                    {
                        BN_LOG("[UI] render line begin id=", ui.id, " line=", line_number, " chars=", render_line.size());
                        BN_LOG("[UI] render line text id=", ui.id, " text=", render_line.c_str(),
                               " graphics=", selected_font->item().tiles_item().graphics_count(),
                               " tiles_per_glyph=", selected_font->item().tiles_item().tiles_count_per_graphic());
                        const int line_width = generator.width(render_line);
                        BN_LOG("[UI] render line measured id=", ui.id, " width=", line_width);
                        generated = generate_screen_text(generator, ui.text.x, line_y, render_line, ui_rendered_sprites) && generated;
                        BN_LOG("[UI] render line generated id=", ui.id, " cache=", ui_rendered_sprites.size());
                    }
                    render_line.clear();
                    line_y += line_height;
                    ++line_number;
                    continue;
                }
                if(static_cast<unsigned char>(character) < 32 && character != '\t') continue;
                render_line.push_back(character);
            }
            ui.sprite_count = ui_rendered_sprites.size() - ui.sprite_start;
            ui.sprites_visible = ui.sprite_count > 0;
            ui.rendered = generated;
            if(!generated) release_ui_sprites(ui);
            BN_LOG("[UI] render text complete id=", ui.id, " generated=", generated, " lines=", line_number, " sprites=", ui.sprite_count, " cache=", ui_rendered_sprites.size());
            if(!generated) BN_LOG("[UI] Sprite generation failed id=", ui.id, " text=", ui.text.text);
        }
        if(ui.sprites_visible != should_show)
        {
#if GBA_STUDIO_FEATURE_UI_ANIMATION
            if(ui.blink_active)
                BN_LOG("[UI] blink visibility begin id=", ui.id, " visible=", should_show, " sprite_count=", ui.sprite_count);
#endif
            const int cache_size = ui_rendered_sprites.size();
            if(ui.sprite_start >= 0 && ui.sprite_count >= 0 && ui.sprite_start <= cache_size &&
               ui.sprite_count <= cache_size - ui.sprite_start)
            {
                for(int index = ui.sprite_start; index < ui.sprite_start + ui.sprite_count; ++index)
                    ui_rendered_sprites[index].set_visible(should_show);
                ui.sprites_visible = should_show;
            }
            else
            {
                BN_LOG("[UI] skip visibility update with invalid cache range id=", ui.id,
                       " start=", ui.sprite_start, " count=", ui.sprite_count, " cache=", cache_size);
            }
#if GBA_STUDIO_FEATURE_UI_ANIMATION
            if(ui.blink_active) BN_LOG("[UI] blink visibility complete id=", ui.id);
#endif
        }
    }
}

#endif
void DialogueManager::render_variable_text()
{
    if(!variable_text_visible || !variable_text.variable_id) return;
    const VariableDefinition* definition = VariableManager::instance().find(variable_text.variable_id);
    if(!definition) return;

    bn::string<256> value;
    if(definition->type == VariableType::number) value = bn::to_string<16>(VariableManager::instance().get_number(variable_text.variable_id));
    else if(definition->type == VariableType::boolean) value = VariableManager::instance().get_boolean(variable_text.variable_id) ? "true" : "false";
    else value = VariableManager::instance().get_string(variable_text.variable_id);

    const bn::sprite_font* selected_font = &common::variable_8x16_sprite_font;
    if(variable_text.font && variable_text.font[0] == '1') selected_font = &common::variable_16x16_sprite_font;
    else if(variable_text.font && variable_text.font[10] == '8') selected_font = &common::variable_8x8_sprite_font;
    bn::sprite_text_generator generator(*selected_font);
    generator.set_bg_priority(0);
    generator.set_z_order(-2);
    // Variable text coordinates are local to the 240x160 screen, like UI text.
    const int screen_x = variable_text.x;
    const int screen_y = variable_text.y;
    if(!value.empty())
    {
        (void) generate_screen_text(generator, screen_x, screen_y, value, rendered_sprites);
    }
}

void DialogueManager::load_page()
{
    constexpr int page_size = 255;
    text.clear();
    int start = 0;
    for(int page = 0; page < page_index; ++page)
    {
        int page_end = bn::min(start + page_size, full_text.size());
        while(page_end < full_text.size() && page_end > start &&
              utf8_continuation(static_cast<unsigned char>(full_text[page_end])))
            --page_end;
        if(page_end <= start) page_end = bn::min(start + page_size, full_text.size());
        start = page_end;
    }
    int end = bn::min(start + page_size, full_text.size());
    while(end < full_text.size() && end > start &&
          utf8_continuation(static_cast<unsigned char>(full_text[end])))
        --end;
    if(end <= start) end = bn::min(start + page_size, full_text.size());
    for(int index = start; index < end; ++index) text.push_back(full_text[index]);
    reveal_count = animate_text ? 0 : text.size();
    reveal_tick = 0;
}

bool DialogueManager::show(const char* value, const char* font, bool frame, const char* horizontal, const char* vertical, bool animate, const char* speed, bool manual, const char* avatar, int avatar_size_value, const char* avatar_placement_value, const char* avatar_anchor_value, int avatar_x_value, int avatar_y_value)
{
    if(manual) hide();
    if(close_finished)
    {
        close_finished = false;
        return true;
    }
    if(closing) return false;
    if(acknowledged)
    {
        acknowledged = false;
        if(page_index + 1 < page_count)
        {
            ++page_index;
            load_page();
            return false;
        }
        closing = true;
        frame_animation = 8;
        return false;
    }
    if(visible || !value || !value[0]) return false;
    // Stream the ROM template, expanding references before applying the output
    // budget. Template metadata never occupies the 255-byte display buffer.
    full_text = sanitize_utf8(interpolate(value));
    dialogue_font = font && font[0] ? font : "fixed8x16";
    avatar_image = avatar && avatar[0] ? avatar : "";
    avatar_size = avatar_size_value == 32 ? 32 : 16;
    avatar_placement = avatar_placement_value && avatar_placement_value[0] ? avatar_placement_value : "inside";
    avatar_anchor = avatar_anchor_value && avatar_anchor_value[0] ? avatar_anchor_value : "top-left";
    avatar_x = bn::clamp(avatar_x_value, 0, 240 - avatar_size);
    avatar_y = bn::clamp(avatar_y_value, 0, 160 - avatar_size);
    show_frame = frame;
    horizontal_align = horizontal ? horizontal : "center";
    vertical_align = vertical ? vertical : "bottom";
    animate_text = animate;
    animation_interval = speed && speed[0] == 's' ? 4 : (speed && speed[0] == 'f' ? 1 : 2);
    page_index = 0;
    page_count = dialogue_page_count(full_text);
    load_page();
    closing = false;
    close_finished = false;
    frame_animation = show_frame ? 0 : 8;
    frame_tick = 0;
    visible = true;
    manual_close = manual;
    return manual;
}

bool DialogueManager::acknowledge()
{
    if(!visible || manual_close) return false;
    if(reveal_count < text.size())
    {
        reveal_count = text.size();
        return true;
    }
    acknowledged = true;
    return true;
}

#if GBA_STUDIO_FEATURE_CHOICES
bool DialogueManager::show_choice(const DialogueChoiceEventData& data)
{
    if(choice_acknowledged)
    {
        choice_acknowledged = false;
        if(data.result_variable) VariableManager::instance().set_number(data.result_variable, choice_cancelled ? -1 : choice_index);
        choice_cancelled = false;
        choice_visible = false;
        return true;
    }
    if(choice_visible || !data.prompt || !data.option_a || !data.option_b || !data.result_variable) return false;
    choice_data = data;
    choice_index = 0;
    choice_render_cached = false;
    choice_render_ready = false;
    choice_resource_warning = false;
    choice_cancelled = false;
    const bn::string<256> prompt = sanitize_utf8(interpolate(data.prompt));
    choice_prompt_text.clear();
    const int prompt_width = menu_layout::content_width_for_position(data.menu_position, data.columns);
    const int prompt_characters_per_row = prompt_width / 8;
    choice_prompt_rows = prompt.empty() ? 0 : 1;
    int prompt_column = 0;
    for(int index = 0; index < prompt.size();)
    {
        const int size = utf8_sequence_size(static_cast<unsigned char>(prompt[index]));
        if(index + size > prompt.size()) break;
        if(prompt[index] == '\r') { ++index; continue; }
        if(prompt[index] == '\n' || prompt_column == prompt_characters_per_row)
        {
            if(choice_prompt_rows == menu_layout::max_prompt_rows) break;
            ++choice_prompt_rows;
            prompt_column = 0;
            choice_prompt_text.push_back('\n');
            if(prompt[index] == '\n') { ++index; continue; }
        }
        for(int byte = 0; byte < size; ++byte) choice_prompt_text.push_back(prompt[index++]);
        ++prompt_column;
    }
    visible = false;
    text.clear();
    dialogue_font = data.dialogue_font ? data.dialogue_font : "fixed8x16";
    show_frame = data.show_frame;
    avatar_image = data.avatar_image && data.avatar_image[0] ? data.avatar_image : "";
    avatar_size = data.avatar_size == 32 ? 32 : 16;
    avatar_placement = data.avatar_placement && data.avatar_placement[0] ? data.avatar_placement : "inside";
    avatar_anchor = data.avatar_anchor && data.avatar_anchor[0] ? data.avatar_anchor : "top-left";
    avatar_x = bn::clamp(data.avatar_x, 0, 240 - avatar_size);
    avatar_y = bn::clamp(data.avatar_y, 0, 160 - avatar_size);
    horizontal_align = data.horizontal_align ? data.horizontal_align : "left";
    vertical_align = data.vertical_align ? data.vertical_align : "bottom";
    animate_text = data.animate;
    animation_interval = data.animation_speed && data.animation_speed[0] == 's' ? 4 : (data.animation_speed && data.animation_speed[0] == 'f' ? 1 : 2);
    frame_animation = show_frame && data.menu_position == 0 ? 0 : 8;
    frame_tick = 0;
    closing = false;
    close_finished = false;
    choice_reveal_count = animate_text ? 0 : choice_prompt_text.size();
    choice_reveal_tick = 0;
    choice_options_revealed = 0;
    choice_option_reveal_tick = 0;
    choice_options_visible = false;
    choice_options_count = 0;
    for(bn::string<64>& option : choice_options) option.clear();
    if(data.options && data.options[0])
    {
        // The list can exceed 255 bytes. Stream ROM text into bounded cells.
        const char* source = data.options;
        while(*source && choice_options_count < choice_options.size())
        {
            bn::string<64>& option = choice_options[choice_options_count];
            while(*source && *source != '\n')
            {
                const int size = utf8_sequence_size(static_cast<unsigned char>(*source));
                bool complete = true;
                for(int byte = 0; byte < size; ++byte) if(!source[byte] || source[byte] == '\n') { complete = false; break; }
                if(!complete) { ++source; continue; }
                if(option.size() + size <= 63 && static_cast<unsigned char>(*source) >= 32)
                    for(int byte = 0; byte < size; ++byte) option.push_back(source[byte]);
                source += size;
            }
            if(!option.empty()) ++choice_options_count;
            if(*source == '\n') ++source;
        }
    }
    if(choice_options_count == 0)
    {
        if(data.option_a && data.option_a[0]) choice_options[choice_options_count++] = data.option_a;
        if(data.option_b && data.option_b[0]) choice_options[choice_options_count++] = data.option_b;
    }
    if(choice_options_count == 0) return false;
    if(!animate_text) choice_options_revealed = choice_options_count;
    choice_options_visible = choice_options_revealed >= choice_options_count;
    choice_index = bn::clamp(data.initial_selection, 0, choice_options_count - 1);
#if GBA_STUDIO_FEATURE_UI
    for(UiElementState& ui : ui_elements)
    {
        ui.id = nullptr;
        ui.visible = false;
        ui.sprites_visible = false;
        ui.sprite_start = 0;
        ui.sprite_count = 0;
        ui.rendered = false;
        ui.dirty = true;
#if GBA_STUDIO_FEATURE_UI_ANIMATION
        ui.move_active = false;
        ui.blink_active = false;
#endif
        ui.text = {};
        ui.storage.clear();
    }
    ui_rendered_sprites.clear();
#endif
    choice_visible = true;
    return false;
}

bool DialogueManager::acknowledge_choice()
{
    if(choice_cancelled) return false;
    if(!choice_visible || !choice_render_ready || !choice_options_visible || frame_animation < 8) return false;
    choice_acknowledged = true;
    choice_cancelled = false;
    return true;
}

bool DialogueManager::cancel_choice()
{
    if(!choice_visible || !choice_data.allow_cancel) return false;
    choice_acknowledged = true;
    choice_cancelled = true;
    return true;
}

#endif
void DialogueManager::hide()
{
    manual_close = false;
    visible = false;
    acknowledged = false;
    page_index = 0;
    page_count = 0;
    reveal_count = 0;
    reveal_tick = 0;
    text.clear();
    full_text.clear();
    choice_visible = false;
#if GBA_STUDIO_FEATURE_CHOICES
    choice_acknowledged = false;
    choice_cancelled = false;
    choice_index = 0;
    choice_options_count = 0;
    choice_prompt_text.clear();
    choice_reveal_count = 0;
    choice_reveal_tick = 0;
    choice_options_revealed = 0;
    choice_option_reveal_tick = 0;
    choice_options_visible = false;
    choice_render_cached = false;
    for(bn::string<64>& option : choice_options) option.clear();
#endif
    closing = false;
    close_finished = false;
    frame_animation = 0;
    frame_tick = 0;
    clear_rendered();
}

void DialogueManager::clear_rendered()
{
    rendered_sprites.clear();
    rendered_frame_bg = bn::nullopt;
#if GBA_STUDIO_FEATURE_CHOICES
    choice_render_cached = false;
#endif
}

void DialogueManager::render()
{
    bool has_ui = false;
    bool trace_ui_render = false;
#if GBA_STUDIO_FEATURE_UI
    for(UiElementState& ui : ui_elements)
    {
        has_ui = has_ui || ui.visible || ui.id;
#if GBA_STUDIO_FEATURE_UI_ANIMATION
        if(!ui.move_active && !ui.blink_active) continue;
        const int cached_sprite_count = ui_rendered_sprites.size();
        if(ui.sprite_start < 0 || ui.sprite_count < 0 || ui.sprite_start > cached_sprite_count ||
           ui.sprite_count > cached_sprite_count - ui.sprite_start)
        {
            BN_LOG("[UI] invalid sprite cache range id=", ui.id, " start=", ui.sprite_start,
                   " count=", ui.sprite_count, " cache=", cached_sprite_count);
            ui.move_active = false;
            ui.blink_active = false;
            ui.blink_visible = true;
            ui.sprite_start = 0;
            ui.sprite_count = 0;
            ui.sprites_visible = false;
            ui.rendered = false;
            ui.dirty = true;
            continue;
        }
        trace_ui_render = trace_ui_render || (ui.move_active && ui.move_elapsed < 2) || (ui.blink_active && ui.blink_elapsed < 2);
        if(ui.move_active)
        {
            if(ui.move_elapsed == 0) BN_LOG("[UI] first animation frame id=", ui.id, " type=move pos=", ui.text.x, ",", ui.text.y, " target=", ui.target_x, ",", ui.target_y);
            ++ui.move_elapsed;
            const int dx = ui.target_x - ui.text.x, dy = ui.target_y - ui.text.y;
            if(dx == 0 && dy == 0) ui.move_active = false;
            else
            {
                ui.move_speed_accumulator += ui.move_speed_units;
                const int step = ui.move_speed_accumulator / 16;
                ui.move_speed_accumulator %= 16;
                const int old_x = ui.text.x, old_y = ui.text.y;
                ui.text.x += bn::clamp(dx, -step, step);
                ui.text.y += bn::clamp(dy, -step, step);
                const int move_x = ui.text.x - old_x;
                const int move_y = ui.text.y - old_y;
                if(move_x || move_y) ui.dirty = true;
                if(ui.text.x == ui.target_x && ui.text.y == ui.target_y) ui.move_active = false;
            }
        }
        if(ui.blink_active)
        {
            if(ui.blink_elapsed == 0) BN_LOG("[UI] first animation frame id=", ui.id, " type=blink pos=", ui.text.x, ",", ui.text.y);
            ++ui.blink_elapsed;
            if(++ui.blink_tick >= bn::max(1, (960 + ui.blink_speed_units - 1) / ui.blink_speed_units))
            {
                ui.blink_tick = 0;
                ui.blink_visible = !ui.blink_visible;
                BN_LOG("[UI] blink toggle id=", ui.id, " elapsed=", ui.blink_elapsed, " visible=", ui.blink_visible);
            }
            if(ui.blink_duration > 0 && ui.blink_elapsed >= ui.blink_duration) { ui.blink_active = false; ui.blink_visible = true; }
        }
#endif
    }
    if(has_ui && trace_ui_render) BN_LOG("[UI] render pass begin has_ui=true");
#endif
#if GBA_STUDIO_FEATURE_CHOICES
    // Preserve a stationary choice's sprites instead of releasing and
    // recreating every glyph on every frame near the OAM limit.
    if(choice_visible && choice_options_visible && choice_render_cached && frame_animation >= 8 && !closing && !has_ui && !variable_text_visible) return;
#endif
    clear_rendered();
    if(has_ui && trace_ui_render) BN_LOG("[UI] dialogue sprites cleared");
    if(!visible && !choice_visible && !variable_text_visible && !has_ui) return;
#if GBA_STUDIO_FEATURE_UI
    if(has_ui) render_ui_text();
    if(has_ui && trace_ui_render) BN_LOG("[UI] render pass complete cache=", ui_rendered_sprites.size());
#endif
    if(!visible && !choice_visible)
    {
        render_variable_text();
        return;
    }
    if(closing)
    {
        if(!show_frame)
        {
            visible = false;
            closing = false;
            close_finished = true;
            return;
        }
        if(++frame_tick >= animation_interval)
        {
            frame_tick = 0;
            if(frame_animation > 0) --frame_animation;
        }
        if(frame_animation == 0)
        {
            visible = false;
            closing = false;
            close_finished = true;
            return;
        }
    }
    else if(show_frame && frame_animation < 8)
    {
        if(++frame_tick >= animation_interval)
        {
            frame_tick = 0;
            ++frame_animation;
        }
    }
    if(!closing && frame_animation >= 8 && visible && reveal_count < text.size())
    {
        ++reveal_tick;
        if(reveal_tick >= animation_interval)
        {
            reveal_tick = 0;
            reveal_count += utf8_sequence_size(static_cast<unsigned char>(text[reveal_count]));
            reveal_count = bn::min(reveal_count, text.size());
        }
    }
#if GBA_STUDIO_FEATURE_CHOICES
    if(!closing && frame_animation >= 8 && choice_visible && animate_text && choice_reveal_count < choice_prompt_text.size())
    {
        if(++choice_reveal_tick >= animation_interval)
        {
            choice_reveal_tick = 0;
            choice_reveal_count += utf8_sequence_size(static_cast<unsigned char>(choice_prompt_text[choice_reveal_count]));
            choice_reveal_count = bn::min(choice_reveal_count, choice_prompt_text.size());
            choice_render_cached = false;
        }
    }
    if(!closing && frame_animation >= 8 && choice_visible && choice_reveal_count >= choice_prompt_text.size() && choice_options_revealed < choice_options_count)
    {
        if(++choice_option_reveal_tick >= animation_interval)
        {
            choice_option_reveal_tick = 0;
            ++choice_options_revealed;
            choice_options_visible = choice_options_revealed >= choice_options_count;
            choice_render_cached = false;
        }
    }
#endif
    bn::string<256> display;
    if(visible)
    {
        // Keep the original typewriter order: each UTF-8 character is
        // revealed from left to right, while the visible lines stay bottom
        // aligned and scroll upward only when a new line is formed.
        for(int index = 0; index < bn::min(reveal_count, text.size()); ++index)
            if(text[index] != '\r' && display.size() < max_dialogue_bytes) display.push_back(text[index]);
    }
#if GBA_STUDIO_FEATURE_CHOICES
    if(choice_visible)
    {
        display.clear();
        for(int index = 0; index < bn::min(choice_reveal_count, choice_prompt_text.size()); ++index)
            display.push_back(choice_prompt_text[index]);
    }
#endif
    if(frame_animation < 8 || closing) display.clear();
    const bn::sprite_font* selected_font = &common::variable_8x16_sprite_font;
    if(dialogue_font[0] == 'f')
        selected_font = dialogue_font[7] == '8' ? &common::fixed_8x8_sprite_font : &common::fixed_8x16_sprite_font;
    else if(dialogue_font[8] == '1')
        selected_font = &common::variable_16x16_sprite_font;
    else if(dialogue_font[10] == '8')
        selected_font = &common::variable_8x8_sprite_font;
    bn::sprite_text_generator generator(*selected_font);
    // Menu glyphs share their font tiles instead of allocating composed text
    // tiles again while options are revealed or the selection changes.
    if(choice_visible) generator.set_one_sprite_per_character(true);
    // Dialogue must stay above backgrounds and actors on every scene type.
    // GBA priority 0 is drawn above backgrounds. In Butano lower z orders
    // are drawn later, so they appear above sprites with higher z orders.
    generator.set_bg_priority(0);
    generator.set_z_order(-2);

    // Butano's sprite text generator treats newlines as invalid characters.
    // Generate each dialogue-box line independently instead.
    constexpr int line_height = 16;
    constexpr int max_visible_lines = 3;
    const bool has_portrait = avatar_image && avatar_image[0] && (visible || (choice_visible && choice_data.menu_position == 0));
    const int portrait_size = avatar_size == 32 ? 32 : 16;
    const bn::string<16> portrait_placement(avatar_placement ? avatar_placement : "inside");
    const bn::string<16> portrait_anchor(avatar_anchor ? avatar_anchor : "top-left");
    const bool portrait_left_anchor = portrait_anchor == "left" || portrait_anchor == "top-left" || portrait_anchor == "bottom-left";
    const bool portrait_right_anchor = portrait_anchor == "right" || portrait_anchor == "top-right" || portrait_anchor == "bottom-right";
    const bool portrait_bottom_anchor = portrait_anchor == "bottom-left" || portrait_anchor == "bottom-right";
    const int target_frame_top = vertical_align && vertical_align[0] == 't' ? -48 : vertical_align && vertical_align[0] == 'c' ? 0 : 48;
    const bool render_frame = show_frame && !(choice_visible && choice_data.menu_position == 1);
    const int frame_slide = render_frame ? (8 - frame_animation) * 16 : 0;
    const int frame_y = vertical_align && vertical_align[0] == 't' ? target_frame_top - frame_slide : target_frame_top + frame_slide;
    const int frame_top = frame_y + 48;
    int portrait_x = 0;
    int portrait_y = 0;
    if(portrait_placement == "inside")
    {
        portrait_x = portrait_right_anchor ? 240 - 8 - portrait_size : 8;
        portrait_y = frame_top + (portrait_bottom_anchor ? 64 - 8 - portrait_size : 8);
    }
    else if(portrait_placement == "free")
    {
        portrait_x = portrait_left_anchor ? 8 : portrait_right_anchor ? 240 - 8 - portrait_size : (240 - portrait_size) / 2;
        portrait_y = avatar_y;
    }
    else if(portrait_placement == "above")
    {
        portrait_x = portrait_left_anchor ? 8 : portrait_right_anchor ? 240 - 8 - portrait_size : (240 - portrait_size) / 2;
        portrait_y = frame_top - portrait_size - 4;
    }
    else
    {
        portrait_x = portrait_left_anchor ? 8 : portrait_right_anchor ? 240 - 8 - portrait_size : (240 - portrait_size) / 2;
        portrait_y = frame_top + 4 - portrait_size / 2;
    }
    if(portrait_placement == "free") portrait_x = avatar_x;

    int text_area_left = 8;
    int text_area_right = 232;
    const int side_panel_width = menu_layout::width_for_position(choice_data.menu_position, choice_data.columns);
    if(choice_visible && (choice_data.menu_position == 2 || choice_data.menu_position == 3))
    {
        text_area_left = menu_layout::content_left_for_position(choice_data.menu_position, choice_data.columns);
        text_area_right = text_area_left + menu_layout::content_width_for_position(choice_data.menu_position, choice_data.columns);
    }
    int first_line_left = text_area_left;
    int first_line_right = text_area_right;
    bool centered_top_portrait = false;
    if(has_portrait && (portrait_placement == "inside" || portrait_placement == "frame-top"))
    {
        if(portrait_placement == "frame-top" && portrait_anchor == "center")
        {
            // Flow the first row through the left and right spaces around the
            // centered portrait; following rows use the full dialogue width.
            centered_top_portrait = true;
            first_line_right = bn::max(text_area_left + 8, portrait_x - 4);
        }
    }
    const int max_line_width = text_area_right - text_area_left;
    const bool portrait_over_text_rows = has_portrait &&
        (portrait_placement == "inside" || portrait_placement == "frame-top");
    int portrait_first_overlap_row = max_visible_lines;
    int portrait_end_overlap_row = -1;
    for(int row = 0; row < max_visible_lines; ++row)
    {
        const int row_top = 8 + row * line_height;
        const int portrait_top_in_frame = portrait_y - frame_top;
        if(portrait_top_in_frame < row_top + line_height &&
           portrait_top_in_frame + portrait_size > row_top)
        {
            portrait_first_overlap_row = bn::min(portrait_first_overlap_row, row);
            portrait_end_overlap_row = row;
        }
    }
    const bool portrait_uses_left_text = portrait_right_anchor ||
        (portrait_anchor == "center" && horizontal_align && horizontal_align[0] == 'r');
    const int portrait_text_left = portrait_uses_left_text
        ? text_area_left
        : bn::min(text_area_right - 8, portrait_x + portrait_size + 4);
    const int portrait_text_right = portrait_uses_left_text
        ? bn::max(text_area_left + 8, portrait_x - 4)
        : text_area_right;
    int line_count = 0;
    const auto push_line_start = [&](int start) {
        if(line_count < max_dialogue_lines)
        {
            dialogue_line_starts[line_count++] = static_cast<uint8_t>(start);
        }
    };
    bn::string<256> wrapped_line;
    int wrapped_line_start = 0;
    for(int index = 0; index < display.size();)
    {
        const char character = display[index];
        // Text copied from Windows sources can contain CRLF. Butano handles
        // the line split itself here, so never pass the CR byte to the font
        // painter as an invalid character.
        if(character == '\r')
        {
            ++index;
            continue;
        }
        if(character == '\n')
        {
            push_line_start(wrapped_line_start);
            wrapped_line.clear();
            ++index;
            wrapped_line_start = index;
            continue;
        }

        const int sequence_size = utf8_sequence_size(static_cast<unsigned char>(character));
        if(index + sequence_size > display.size()) break;
        for(int byte_index = 0; byte_index < sequence_size; ++byte_index)
            wrapped_line.push_back(display[index + byte_index]);
        index += sequence_size;
        const bool portrait_overlap_row = portrait_over_text_rows &&
            line_count >= portrait_first_overlap_row && line_count <= portrait_end_overlap_row;
        const int centered_portrait_flow_width = first_line_right - first_line_left +
            (centered_top_portrait ? text_area_right - (portrait_x + portrait_size + 4) : 0);
        const int current_max_line_width = portrait_overlap_row
            ? centered_top_portrait ? centered_portrait_flow_width : portrait_text_right - portrait_text_left
            : line_count == 0 && centered_top_portrait ? centered_portrait_flow_width : max_line_width;
        if(generator.width(wrapped_line) > current_max_line_width)
        {
            int break_index = -1;
            for(int candidate = wrapped_line.size() - 2; !choice_visible && candidate >= 0; --candidate)
            {
                if(wrapped_line[candidate] == ' ')
                {
                    break_index = candidate;
                    break;
                }
            }

            if(break_index >= 0)
            {
                push_line_start(wrapped_line_start);

                bn::string<256> remainder;
                for(int character_index = break_index + 1; character_index < wrapped_line.size(); ++character_index) remainder.push_back(wrapped_line[character_index]);
                wrapped_line = remainder;
                wrapped_line_start += break_index + 1;
            }
            else
            {
                int last_sequence_start = wrapped_line.size() - 1;
                while(last_sequence_start > 0 && utf8_continuation(static_cast<unsigned char>(wrapped_line[last_sequence_start])))
                    --last_sequence_start;
                bn::string<256> remainder;
                for(int character_index = last_sequence_start; character_index < wrapped_line.size(); ++character_index)
                    remainder.push_back(wrapped_line[character_index]);
                while(wrapped_line.size() > last_sequence_start) wrapped_line.pop_back();
                push_line_start(wrapped_line_start);
                wrapped_line = remainder;
                wrapped_line_start += last_sequence_start;
            }
        }
    }
    if(!wrapped_line.empty() || display.empty() || display[display.size() - 1] == '\n')
        push_line_start(wrapped_line_start);

    const int first_line = bn::max(0, line_count - max_visible_lines);
    // Keep a fixed three-line text area. The typewriter fills line 1, then
    // line 2, then line 3; only the fourth line starts scrolling the oldest
    // line out of the box.
    const int text_height = max_visible_lines * line_height;
    // Text generator top-left coordinates are screen coordinates (0..240,
    // 0..160), while sprites use the centered camera coordinates.
    const int text_top_y = choice_visible && choice_data.menu_position == 1 ? 8
        : choice_visible && (choice_data.menu_position == 2 || choice_data.menu_position == 3)
            ? 8
        : vertical_align && vertical_align[0] == 't'
        ? 8
        : vertical_align && vertical_align[0] == 'c'
            ? (160 - text_height) / 2
            : 160 - 8 - text_height;
    int line_y = text_top_y;

    const Settings* settings = get_settings();
    if(render_frame && settings && settings->ui_frame_image && settings->ui_frame_image[0] != '\0')
    {
        if(choice_visible && choice_data.menu_position != 0)
        {
            const int width = side_panel_width;
            const int height = 160;
            const char* frame_name = choice_columns() == 1 ? "menu_frame_side_1_sprite" : "menu_frame_side_2_sprite";
            const int frame_columns = (width + 63) / 64;
            const int frame_rows = (height + 63) / 64;
            const int cell_width = width / frame_columns;
            const int cell_height = height / frame_rows;
            const int panel_left = choice_data.menu_position == 3 ? 240 - width : 0;
            const int panel_top = 0;
            const bool side_panel = choice_data.menu_position == 2 || choice_data.menu_position == 3;
            for(int row = 0; row < frame_rows; ++row)
            {
                for(int column = 0; column < frame_columns; ++column)
                {
                    const int x = panel_left + (side_panel ? column * 64 + 32 : column * cell_width + cell_width / 2) - 120;
                    const int y = panel_top + (side_panel ? row * 64 + 32 : row * cell_height + cell_height / 2) - 80;
                    auto frame = GraphicsManager::instance().create_ui_sprite_frame(frame_name, x, y, row * frame_columns + column);
                    if(frame.has_value())
                    {
                        frame->set_scale(side_panel ? bn::fixed(1) : bn::fixed(cell_width) / 64,
                                         side_panel ? bn::fixed(1) : bn::fixed(cell_height) / 64);
                        frame->set_bg_priority(0);
                        frame->set_z_order(-1);
                        if(!rendered_sprites.full()) rendered_sprites.push_back(*frame);
                    }
                }
            }
        }
        else
        {
            // Four 64x64 tiles compose the nine-sliced 240x64 dialogue frame.
            constexpr int frame_x[4] = { -96, -32, 32, 96 };
            for(int column = 0; column < 4; ++column)
            {
                if(frame_y + 32 <= -80 || frame_y - 32 >= 80) continue;
                auto frame = GraphicsManager::instance().create_ui_sprite_frame(settings->ui_frame_image, frame_x[column], frame_y, column);
                if(frame.has_value())
                {
                    frame->set_bg_priority(0);
                    frame->set_z_order(-1);
                    if(!rendered_sprites.full()) rendered_sprites.push_back(*frame);
                }
            }
        }
    }

    if(has_portrait && portrait_x < 240 && portrait_x + portrait_size > 0 && portrait_y < 160 && portrait_y + portrait_size > 0)
    {
        auto portrait = GraphicsManager::instance().create_ui_sprite(avatar_image,
            portrait_x + portrait_size / 2 - 120, portrait_y + portrait_size / 2 - 80);
        if(portrait.has_value())
        {
            portrait->set_bg_priority(0);
            portrait->set_z_order(-3);
            if(!rendered_sprites.full()) rendered_sprites.push_back(*portrait);
        }
    }

    [[maybe_unused]] bool text_generated = true;
    for(int line_index = first_line; line_index < line_count; ++line_index)
    {
        const int line_start = dialogue_line_starts[line_index];
        int line_end = line_index + 1 < line_count ? dialogue_line_starts[line_index + 1] : display.size();
        if(line_index + 1 < line_count && line_end > line_start &&
           (display[line_end - 1] == '\n' || display[line_end - 1] == ' '))
        {
            --line_end;
        }
        // Never pass CR/LF or other control bytes to Butano's painter. The
        // dialogue splitter already handles line breaks structurally.
        bn::string<256> paint_line;
        for(int byte_index = line_start; byte_index < line_end; ++byte_index)
        {
            const unsigned char byte = static_cast<unsigned char>(display[byte_index]);
            if(byte == '\t' || byte >= 32) paint_line.push_back(display[byte_index]);
        }
        const int line_width = generator.width(paint_line);
        const bool portrait_visible_row = portrait_over_text_rows &&
            portrait_y < line_y + line_height && portrait_y + portrait_size > line_y;
        if(portrait_visible_row && centered_top_portrait)
        {
            int split_index = -1;
            if(line_width > first_line_right - first_line_left)
            {
                for(int candidate = 0; candidate < paint_line.size(); ++candidate)
                {
                    if(paint_line[candidate] == ' ')
                    {
                        bn::string<256> candidate_left;
                        for(int character_index = 0; character_index < candidate; ++character_index) candidate_left.push_back(paint_line[character_index]);
                        if(generator.width(candidate_left) <= first_line_right - first_line_left) split_index = candidate;
                    }
                }
            }
            bn::string<256> left_text;
            bn::string<256> right_text;
            if(split_index >= 0)
            {
                for(int character_index = 0; character_index < split_index; ++character_index) left_text.push_back(paint_line[character_index]);
                for(int character_index = split_index + 1; character_index < paint_line.size(); ++character_index) right_text.push_back(paint_line[character_index]);
            }
            else
            {
                if(line_width <= first_line_right - first_line_left) left_text = paint_line;
                else right_text = paint_line;
            }
            const int left_text_width = generator.width(left_text);
            const int left_text_x = horizontal_align && horizontal_align[0] == 'r'
                ? first_line_right - left_text_width
                : horizontal_align && horizontal_align[0] == 'c'
                    ? first_line_left + (first_line_right - first_line_left - left_text_width) / 2
                    : first_line_left;
            if(!left_text.empty()) text_generated = generate_screen_text(generator, left_text_x, line_y, left_text, rendered_sprites) && text_generated;
            if(!right_text.empty()) text_generated = generate_screen_text(generator, portrait_x + portrait_size + 4, line_y, right_text, rendered_sprites) && text_generated;
            line_y += line_height;
            continue;
        }
        const int line_area_left = portrait_visible_row
            ? portrait_text_left
            : line_index == 0 && ! centered_top_portrait ? first_line_left : text_area_left;
        const int line_area_right = portrait_visible_row
            ? portrait_text_right
            : line_index == 0 && ! centered_top_portrait ? first_line_right : text_area_right;
        const int left_x = horizontal_align && horizontal_align[0] == 'l'
            ? line_area_left
            : horizontal_align && horizontal_align[0] == 'r'
                ? line_area_right - line_width
                : line_area_left + (line_area_right - line_area_left - line_width) / 2;
        if(!paint_line.empty())
        {
            text_generated = generate_screen_text(generator, left_x, line_y, paint_line, rendered_sprites) && text_generated;
        }
        line_y += line_height;
    }

#if GBA_STUDIO_FEATURE_CHOICES
    if(choice_visible && choice_reveal_count >= choice_prompt_text.size() && choice_options_revealed > 0 && frame_animation >= 8)
    {
        const int columns = choice_columns();
        const int rows = choice_rows();
        const int capacity = columns * rows;
        const int position = choice_data.menu_position;
        const int text_width = menu_layout::content_width_for_position(position, choice_data.columns);
        const int cell_width = menu_layout::cell_width(text_width, columns);
        const int origin_x = menu_layout::content_left_for_position(position, choice_data.columns);
        const int max_option_sprite_cost = bn::max(0, bn::sprites::available_items_count() - 1);
        int first = 0;
        int visible_count = 0;
        int visible_sprite_cost = 0;
        const int rendered_option_count = choice_options_visible ? choice_options_count : choice_options_revealed;
        // Revealing off-page options must not switch the visible page and
        // briefly expose it before returning to the initial selection.
        const int target_index = bn::min(choice_index, rendered_option_count - 1);
        for(int index = 0; index < rendered_option_count; ++index)
        {
            int width = 0;
            int sprite_cost = 0;
            const bn::string<64>& option = choice_options[index];
            for(int character_index = 0; character_index < option.size();)
            {
                const int sequence_size = utf8_sequence_size(static_cast<unsigned char>(option[character_index]));
                if(character_index + sequence_size > option.size()) break;
                bn::string<8> glyph;
                for(int byte = 0; byte < sequence_size; ++byte) glyph.push_back(option[character_index + byte]);
                const int advance = generator.width(glyph);
                if(width + advance > cell_width - 16) break;
                width += advance;
                ++sprite_cost;
                character_index += sequence_size;
            }
            sprite_cost = bn::max(1, sprite_cost);
            if(visible_count > 0 && (visible_count >= capacity || visible_sprite_cost + sprite_cost > max_option_sprite_cost))
            {
                if(target_index < index) break;
                first = index;
                visible_count = 0;
                visible_sprite_cost = 0;
            }
            if(index == target_index && sprite_cost > max_option_sprite_cost)
            {
                text_generated = false;
                break;
            }
            if(index >= first)
            {
                ++visible_count;
                visible_sprite_cost += sprite_cost;
            }
        }
        const bool has_cursor = settings && settings->ui_cursor_image && settings->ui_cursor_image[0];
        for(int index = first; index < bn::min(first + visible_count, rendered_option_count); ++index)
        {
            const int local = index - first;
            const bool column_major = choice_data.column_major && columns > 1;
            const int x = origin_x + menu_layout::column(local, columns, rows, column_major) * (cell_width + menu_layout::gap);
            const int y = text_top_y + (choice_prompt_rows + menu_layout::row(local, columns, rows, column_major)) * line_height;
            bn::string<64> visible_option;
            int width = 0;
            const bn::string<64>& source_option = choice_options[index];
            for(int character_index = 0; character_index < source_option.size();)
            {
                const int sequence_size = utf8_sequence_size(static_cast<unsigned char>(source_option[character_index]));
                if(character_index + sequence_size > source_option.size()) break;
                bn::string<8> glyph;
                for(int byte = 0; byte < sequence_size; ++byte) glyph.push_back(source_option[character_index + byte]);
                const int advance = generator.width(glyph);
                if(width + advance > cell_width - 16) break;
                for(int byte = 0; byte < sequence_size; ++byte) visible_option.push_back(source_option[character_index + byte]);
                width += advance;
                character_index += sequence_size;
            }
            const int offset = horizontal_align && horizontal_align[0] == 'r' ? cell_width - 16 - width
                : horizontal_align && horizontal_align[0] == 'c' ? (cell_width - 16 - width) / 2 : 0;
            bool cursor_rendered = false;
            if(choice_options_visible && index == choice_index)
            {
                if(has_cursor)
                {
                    auto cursor = GraphicsManager::instance().create_ui_sprite(settings->ui_cursor_image, x + 8 + bn::max(0, offset) - 120, y + 8 - 80);
                    if(cursor.has_value())
                    {
                        cursor->set_bg_priority(0);
                        cursor->set_z_order(-3);
                        if(!rendered_sprites.full())
                        {
                            rendered_sprites.push_back(*cursor);
                            cursor_rendered = true;
                        }
                    }
                }
            }
            text_generated = generate_screen_text(generator, x + 16 + bn::max(0, offset), y, visible_option, rendered_sprites) && text_generated;
            if(choice_options_visible && index == choice_index && !cursor_rendered)
                text_generated = generate_screen_text(generator, x + bn::max(0, offset), y, ">", rendered_sprites) && text_generated;
        }
        choice_render_ready = text_generated;
        choice_render_cached = text_generated && choice_options_visible;
        if(!text_generated && !choice_resource_warning) BN_LOG("[MENU] Not enough sprite resources for the visible page; confirmation waits until it can be rendered.");
        choice_resource_warning = !text_generated;
    }
    else if(choice_visible) choice_render_ready = false;
#endif
    render_variable_text();
}
