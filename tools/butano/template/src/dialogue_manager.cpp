#include "dialogue_manager.h"
#include "graphics_manager.h"
#include "resource_registry.h"
#include "variable_manager.h"
#include "bn_sprite_text_generator.h"
#include "common_variable_8x16_sprite_font.h"
#include "common_fixed_8x8_sprite_font.h"
#include "common_fixed_8x16_sprite_font.h"
#include "common_variable_8x8_sprite_font.h"
#include "common_variable_16x16_sprite_font.h"

namespace
{
    constexpr int max_dialogue_bytes = 255;

    int utf8_sequence_size(unsigned char first)
    {
        if((first & 0x80) == 0) return 1;
        if((first & 0xE0) == 0xC0) return 2;
        if((first & 0xF0) == 0xE0) return 3;
        if((first & 0xF8) == 0xF0) return 4;
        return 1;
    }

    bool utf8_continuation(unsigned char value)
    {
        return (value & 0xC0) == 0x80;
    }

    bn::string<256> sanitize_utf8(const bn::string<256>& source)
    {
        bn::string<256> result;
        for(int index = 0; index < int(source.size());)
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

            if(index + sequence_size > int(source.size())) break;
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
        while(start < int(value.size()))
        {
            ++pages;
            int end = bn::min(start + page_size, int(value.size()));
            while(end < int(value.size()) && end > start &&
                  utf8_continuation(static_cast<unsigned char>(value[end])))
                --end;
            if(end <= start) end = bn::min(start + page_size, int(value.size()));
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
            for(int byte_index = 0; byte_index < sequence_size && value[index + byte_index] != '\0'; ++byte_index)
                target.push_back(value[index + byte_index]);
            index += sequence_size;
        }
    }

    bn::string<256> interpolate(const bn::string<256>& source)
    {
        bn::string<256> result;
        for(int i = 0; i < int(source.size()); ++i)
        {
            if(source[i] == '$' && i + 1 < int(source.size()) && source[i + 1] == '{')
            {
                int end = i + 2;
                while(end < int(source.size()) && source[end] != '}') ++end;
                if(end < int(source.size()))
                {
                    bn::string<32> id;
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
            }
            const int sequence_size = utf8_sequence_size(static_cast<unsigned char>(source[i]));
            if(result.size() + sequence_size > max_dialogue_bytes) break;
            for(int byte_index = 0; byte_index < sequence_size && i + byte_index < int(source.size()); ++byte_index)
                result.push_back(source[i + byte_index]);
            i += sequence_size - 1;
        }
        return result;
    }
}

DialogueManager& DialogueManager::instance()
{
    static DialogueManager manager;
    return manager;
}

bool DialogueManager::show_variable_text(const VariableTextEventData& data)
{
    if(!data.variable_id || !data.variable_id[0]) return false;
    variable_text = data;
    variable_text_visible = true;
    return true;
}

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
    const int screen_x = variable_text.x - GraphicsManager::instance().get_camera_x();
    const int screen_y = variable_text.y - GraphicsManager::instance().get_camera_y();
    if(!value.empty()) generator.generate_top_left(screen_x, screen_y, value, rendered_sprites);
}

void DialogueManager::load_page()
{
    constexpr int page_size = 255;
    text.clear();
    int start = 0;
    for(int page = 0; page < page_index; ++page)
    {
        int page_end = bn::min(start + page_size, int(full_text.size()));
        while(page_end < int(full_text.size()) && page_end > start &&
              utf8_continuation(static_cast<unsigned char>(full_text[page_end])))
            --page_end;
        if(page_end <= start) page_end = bn::min(start + page_size, int(full_text.size()));
        start = page_end;
    }
    int end = bn::min(start + page_size, int(full_text.size()));
    while(end < int(full_text.size()) && end > start &&
          utf8_continuation(static_cast<unsigned char>(full_text[end])))
        --end;
    if(end <= start) end = bn::min(start + page_size, int(full_text.size()));
    for(int index = start; index < end; ++index) text.push_back(full_text[index]);
    reveal_count = animate_text ? 0 : int(text.size());
    reveal_tick = 0;
}

bool DialogueManager::show(const bn::string<256>& value, const char* font, bool frame, const char* horizontal, const char* vertical, bool animate, const char* speed)
{
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
    if(visible || value.empty()) return false;
    // bn::string<256> can truncate a literal at 255 bytes. If that happens in
    // the middle of an accented UTF-8 character, the font renderer receives an
    // incomplete sequence and reports "Invalid UTF-8 character". Normalize the
    // already-sized input before interpolation and paging as a final runtime
    // safeguard for older or hand-edited project files.
    full_text = interpolate(sanitize_utf8(value));
    dialogue_font = font && font[0] ? font : "fixed8x16";
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
    return false;
}

bool DialogueManager::acknowledge()
{
    if(!visible) return false;
    if(reveal_count < int(text.size()))
    {
        reveal_count = int(text.size());
        return true;
    }
    acknowledged = true;
    return true;
}

bool DialogueManager::show_choice(const DialogueChoiceEventData& data)
{
    if(choice_acknowledged)
    {
        choice_acknowledged = false;
        if(data.result_variable) VariableManager::instance().set_number(data.result_variable, choice_index);
        choice_visible = false;
        return true;
    }
    if(choice_visible || !data.prompt || !data.option_a || !data.option_b || !data.result_variable) return false;
    choice_data = data;
    choice_index = 0;
    choice_visible = true;
    return false;
}

bool DialogueManager::acknowledge_choice()
{
    if(!choice_visible) return false;
    choice_acknowledged = true;
    return true;
}

void DialogueManager::hide()
{
    visible = false;
    acknowledged = false;
    page_index = 0;
    page_count = 0;
    reveal_count = 0;
    reveal_tick = 0;
    text.clear();
    full_text.clear();
    choice_visible = false;
    choice_acknowledged = false;
    choice_index = 0;
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
}

void DialogueManager::render()
{
    clear_rendered();
    if(!visible && !choice_visible && !variable_text_visible) return;
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
    if(!closing && frame_animation >= 8 && visible && reveal_count < int(text.size()))
    {
        ++reveal_tick;
        if(reveal_tick >= animation_interval)
        {
            reveal_tick = 0;
            reveal_count += utf8_sequence_size(static_cast<unsigned char>(text[reveal_count]));
            reveal_count = bn::min(reveal_count, int(text.size()));
        }
    }
    bn::string<256> display;
    if(visible)
    {
        // Keep the original typewriter order: each UTF-8 character is
        // revealed from left to right, while the visible lines stay bottom
        // aligned and scroll upward only when a new line is formed.
        for(int index = 0; index < bn::min(reveal_count, int(text.size())); ++index) display.push_back(text[index]);
    }
    if(choice_visible)
    {
        if(!display.empty()) display += "\n";
        display += choice_data.prompt ? choice_data.prompt : "";
        display += "\n";
        const Settings* settings = get_settings();
        const bool has_cursor_image = settings && settings->ui_cursor_image && settings->ui_cursor_image[0] != '\0';
        display += has_cursor_image ? "  " : (choice_index == 0 ? "> " : "  ");
        display += choice_data.option_a ? choice_data.option_a : "";
        display += "\n";
        display += has_cursor_image ? "  " : (choice_index == 1 ? "> " : "  ");
        display += choice_data.option_b ? choice_data.option_b : "";
    }
    if(frame_animation < 8 || closing) display.clear();
    const bn::sprite_font* selected_font = &common::variable_8x16_sprite_font;
    if(dialogue_font[0] == 'f')
        selected_font = dialogue_font[7] == '8' ? &common::fixed_8x8_sprite_font : &common::fixed_8x16_sprite_font;
    else if(dialogue_font[8] == '1')
        selected_font = &common::variable_16x16_sprite_font;
    else if(dialogue_font[10] == '8')
        selected_font = &common::variable_8x8_sprite_font;
    bn::sprite_text_generator generator(*selected_font);
    // Dialogue must stay above backgrounds and actors on every scene type.
    // GBA priority 0 is drawn above backgrounds. In Butano lower z orders
    // are drawn later, so they appear above sprites with higher z orders.
    generator.set_bg_priority(0);
    generator.set_z_order(-2);

    // Butano's sprite text generator treats newlines as invalid characters.
    // Generate each dialogue-box line independently instead.
    constexpr int max_line_width = 224;
    constexpr int line_height = 16;
    bn::vector<bn::string<256>, 32> lines;
    bn::string<256> wrapped_line;
    for(int index = 0; index < int(display.size());)
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
            lines.push_back(wrapped_line);
            wrapped_line.clear();
            ++index;
            continue;
        }

        const int sequence_size = utf8_sequence_size(static_cast<unsigned char>(character));
        if(index + sequence_size > int(display.size())) break;
        for(int byte_index = 0; byte_index < sequence_size; ++byte_index)
            wrapped_line.push_back(display[index + byte_index]);
        index += sequence_size;
        if(generator.width(wrapped_line) > max_line_width)
        {
            int break_index = -1;
            for(int candidate = int(wrapped_line.size()) - 2; candidate >= 0; --candidate)
            {
                if(wrapped_line[candidate] == ' ')
                {
                    break_index = candidate;
                    break;
                }
            }

            if(break_index >= 0)
            {
                bn::string<256> line;
                for(int character_index = 0; character_index < break_index; ++character_index) line.push_back(wrapped_line[character_index]);
                lines.push_back(line);

                bn::string<256> remainder;
                for(int character_index = break_index + 1; character_index < int(wrapped_line.size()); ++character_index) remainder.push_back(wrapped_line[character_index]);
                wrapped_line = remainder;
            }
            else
            {
                int last_sequence_start = int(wrapped_line.size()) - 1;
                while(last_sequence_start > 0 && utf8_continuation(static_cast<unsigned char>(wrapped_line[last_sequence_start])))
                    --last_sequence_start;
                bn::string<256> remainder;
                for(int character_index = last_sequence_start; character_index < int(wrapped_line.size()); ++character_index)
                    remainder.push_back(wrapped_line[character_index]);
                while(int(wrapped_line.size()) > last_sequence_start) wrapped_line.pop_back();
                lines.push_back(wrapped_line);
                wrapped_line = remainder;
            }
        }
    }
    if(!wrapped_line.empty() || display.empty() || display[display.size() - 1] == '\n') lines.push_back(wrapped_line);

    const int line_count = int(lines.size());
    constexpr int frame_height = 64;
    constexpr int max_visible_lines = 3;
    const int first_line = bn::max(0, line_count - max_visible_lines);
    // Keep a fixed three-line text area. The typewriter fills line 1, then
    // line 2, then line 3; only the fourth line starts scrolling the oldest
    // line out of the box.
    const int text_height = max_visible_lines * line_height;
    // Text generator top-left coordinates are screen coordinates (0..240,
    // 0..160), while sprites use the centered camera coordinates.
    const int text_top_y = vertical_align && vertical_align[0] == 't'
        ? 8
        : vertical_align && vertical_align[0] == 'c'
            ? (160 - text_height) / 2
            : 160 - 8 - text_height;
    int line_y = text_top_y;

    const Settings* settings = get_settings();
    if(show_frame && settings && settings->ui_frame_image && settings->ui_frame_image[0] != '\0')
    {
        // The generated sprite sheet has four 64x64 frames in one row.
        const int target_frame_top = vertical_align && vertical_align[0] == 't' ? -48 : vertical_align && vertical_align[0] == 'c' ? 0 : 48;
        const int frame_slide = (8 - frame_animation) * 16;
        const int frame_y = vertical_align && vertical_align[0] == 't'
            ? target_frame_top - frame_slide
            : target_frame_top + frame_slide;
        constexpr int frame_x[4] = { -96, -32, 32, 96 };
        for(int column = 0; column < 4; ++column)
        {
            auto frame = GraphicsManager::instance().create_ui_sprite_frame(settings->ui_frame_image, frame_x[column], frame_y, column);
            if(frame.has_value())
            {
                frame->set_bg_priority(0);
                frame->set_z_order(-1);
                rendered_sprites.push_back(*frame);
            }
        }
    }

    for(int line_index = first_line; line_index < line_count; ++line_index)
    {
        const bn::string<256>& line = lines[line_index];
        // Never pass CR/LF or other control bytes to Butano's painter. The
        // dialogue splitter already handles line breaks structurally.
        bn::string<256> paint_line;
        for(int byte_index = 0; byte_index < int(line.size()); ++byte_index)
        {
            const unsigned char byte = static_cast<unsigned char>(line[byte_index]);
            if(byte == '\t' || byte >= 32) paint_line.push_back(line[byte_index]);
        }
        const int line_width = generator.width(paint_line);
        const int left_x = horizontal_align && horizontal_align[0] == 'l'
            ? 8
            : horizontal_align && horizontal_align[0] == 'r'
                ? 240 - 8 - line_width
                : (240 - line_width) / 2;
        if(!paint_line.empty()) generator.generate_top_left(left_x, line_y, paint_line, rendered_sprites);
        line_y += line_height;
    }

    if(choice_visible && settings && settings->ui_cursor_image && settings->ui_cursor_image[0] != '\0')
    {
        const int cursor_line = line_count - 2 + choice_index;
        auto cursor = GraphicsManager::instance().create_ui_sprite(settings->ui_cursor_image, -112 + 8, text_top_y - 80 + cursor_line * line_height + 8);
        if(cursor.has_value())
        {
            cursor->set_bg_priority(0);
            cursor->set_z_order(-3);
            rendered_sprites.push_back(*cursor);
        }
    }
    render_variable_text();
}
