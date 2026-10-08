#include "dialogue_manager.h"
#include "graphics_manager.h"
#include "resource_registry.h"
#include "variable_manager.h"
#include "bn_sprite_text_generator.h"
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
            for(int byte_index = 0; byte_index < sequence_size && value[index + byte_index] != '\0'; ++byte_index)
                target.push_back(value[index + byte_index]);
            index += sequence_size;
        }
    }

    bn::string<256> interpolate(const bn::string<256>& source)
    {
        bn::string<256> result;
        for(int i = 0; i < source.size(); ++i)
        {
            if(source[i] == '$' && i + 1 < source.size() && source[i + 1] == '{')
            {
                int end = i + 2;
                while(end < source.size() && source[end] != '}') ++end;
                if(end < source.size())
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
            for(int byte_index = 0; byte_index < sequence_size && i + byte_index < source.size(); ++byte_index)
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
        const bool should_show = !hidden && state.visible && !(state.blink_active && !state.blink_visible);
        for(int index = state.sprite_start; index < state.sprite_start + state.sprite_count; ++index)
            ui_rendered_sprites[index].set_visible(should_show);
        state.sprites_visible = should_show && state.sprite_count > 0;
        return true;
    }
    BN_LOG("[UI] Visibility target not found: ", data.ui_id);
    return false;
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
        // Erase only this UI's owned sprites. Keep other UIs, including hidden
        // ones, alive and update their ranges after compacting the shared cache.
        const int start = state.sprite_start;
        const int count = state.sprite_count;
        const int end = start + count;
        if(count > 0)
        {
            ui_rendered_sprites.erase(ui_rendered_sprites.begin() + start, ui_rendered_sprites.begin() + end);
            for(UiElementState& other : ui_elements)
                if(&other != &state && other.sprite_start >= end) other.sprite_start -= count;
        }
        if(last_ui_id && bn::string<64>(last_ui_id) == state.id) last_ui_id = nullptr;
        // Reset text ownership, visibility, both animations, timers and ranges;
        // removing the id also makes this slot reusable by a later Set UI Text.
        state = UiElementState{};
        return true;
    }
    BN_LOG("[UI] Destroy target not found: ", data.ui_id);
    return false;
}

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

void DialogueManager::render_ui_text()
{
    bool rebuild_sprites = false;
    for(const UiElementState& ui : ui_elements) rebuild_sprites = rebuild_sprites || (ui.id && ui.dirty);
    if(rebuild_sprites)
    {
        ui_rendered_sprites.clear();
        for(UiElementState& ui : ui_elements)
        {
            ui.rendered = false;
            ui.sprites_visible = false;
            ui.sprite_start = 0;
            ui.sprite_count = 0;
        }
    }

    for(UiElementState& ui : ui_elements)
    {
        if(!ui.id) continue;
        const bool should_show = ui.visible && !ui.hidden && !(ui.blink_active && !ui.blink_visible) && ui.text.text && ui.text.text[0];
        ui.dirty = false;
        if(rebuild_sprites) ui.sprite_start = ui_rendered_sprites.size();
        if(!ui.rendered && should_show)
        {
            // A UI hidden before its first render is generated later, after
            // any existing cached sprites, rather than at its old empty range.
            ui.sprite_start = ui_rendered_sprites.size();
            BN_LOG("[UI] render text begin id=", ui.id, " chars=", bn::string<256>(ui.text.text).size(), " cache=", ui_rendered_sprites.size());
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
            const bn::string<256> render_text(ui.text.text);
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
                        generated = generator.generate_top_left_optional(ui.text.x, line_y, render_line, ui_rendered_sprites) && generated;
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
            ui.rendered = true;
            BN_LOG("[UI] render text complete id=", ui.id, " generated=", generated, " lines=", line_number, " sprites=", ui.sprite_count, " cache=", ui_rendered_sprites.size());
            if(!generated) BN_LOG("[UI] Sprite generation failed id=", ui.id, " text=", ui.text.text);
        }
        if(ui.sprites_visible != should_show)
        {
            if(ui.blink_active)
                BN_LOG("[UI] blink visibility begin id=", ui.id, " visible=", should_show, " sprite_count=", ui.sprite_count);
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
            if(ui.blink_active) BN_LOG("[UI] blink visibility complete id=", ui.id);
        }
    }
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
    // Variable text coordinates are local to the 240x160 screen, like UI text.
    const int screen_x = variable_text.x;
    const int screen_y = variable_text.y;
    if(!value.empty())
    {
        (void) generator.generate_top_left_optional(screen_x, screen_y, value, rendered_sprites);
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

bool DialogueManager::show(const bn::string<256>& value, const char* font, bool frame, const char* horizontal, const char* vertical, bool animate, const char* speed, bool continuous, bool manual)
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
    continuous_scroll = continuous;
    scroll_offset = 0;
    scroll_tick = 0;
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
    choice_options_count = 0;
    for(bn::string<64>& option : choice_options) option.clear();
    if(data.options && data.options[0])
    {
        bn::string<256> source = data.options;
        int start = 0;
        while(start <= source.size() && choice_options_count < choice_options.size())
        {
            int end = start;
            while(end < source.size() && source[end] != '\n') ++end;
            for(int index = start; index < end && choice_options[choice_options_count].size() < 63; ++index)
                choice_options[choice_options_count].push_back(source[index]);
            if(!choice_options[choice_options_count].empty()) ++choice_options_count;
            start = end + 1;
            if(end >= source.size()) break;
        }
    }
    if(choice_options_count == 0)
    {
        if(data.option_a && data.option_a[0]) choice_options[choice_options_count++] = data.option_a;
        if(data.option_b && data.option_b[0]) choice_options[choice_options_count++] = data.option_b;
    }
    if(choice_options_count == 0) return false;
    for(UiElementState& ui : ui_elements)
    {
        ui.id = nullptr;
        ui.visible = false;
        ui.sprites_visible = false;
        ui.sprite_start = 0;
        ui.sprite_count = 0;
        ui.rendered = false;
        ui.dirty = true;
        ui.move_active = false;
        ui.blink_active = false;
        ui.text = {};
        ui.storage.clear();
    }
    ui_rendered_sprites.clear();
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
    choice_acknowledged = false;
    choice_index = 0;
    choice_options_count = 0;
    for(bn::string<64>& option : choice_options) option.clear();
    closing = false;
    close_finished = false;
    frame_animation = 0;
    frame_tick = 0;
    continuous_scroll = false;
    scroll_offset = 0;
    scroll_tick = 0;
    clear_rendered();
}

void DialogueManager::clear_rendered()
{
    rendered_sprites.clear();
    rendered_frame_bg = bn::nullopt;
}

void DialogueManager::render()
{
    bool has_ui = false;
    bool trace_ui_render = false;
    for(UiElementState& ui : ui_elements)
    {
        has_ui = has_ui || ui.visible || ui.id;
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
                if(move_x || move_y)
                {
                    BN_LOG("[UI] move sprites begin id=", ui.id, " elapsed=", ui.move_elapsed,
                           " delta=", move_x, ",", move_y, " start=", ui.sprite_start,
                           " count=", ui.sprite_count, " cache=", ui_rendered_sprites.size());
                    for(int index = ui.sprite_start; index < ui.sprite_start + ui.sprite_count; ++index)
                    {
                        bn::sprite_ptr& sprite = ui_rendered_sprites[index];
                        BN_LOG("[UI] move sprite begin id=", ui.id, " index=", index,
                               " pos=", sprite.x(), ",", sprite.y());
                        sprite.set_x(sprite.x() + move_x);
                        sprite.set_y(sprite.y() + move_y);
                        BN_LOG("[UI] move sprite complete id=", ui.id, " index=", index,
                               " pos=", sprite.x(), ",", sprite.y());
                    }
                    BN_LOG("[UI] move sprites complete id=", ui.id, " elapsed=", ui.move_elapsed);
                }
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
    }
    if(has_ui && trace_ui_render) BN_LOG("[UI] render pass begin has_ui=true");
    clear_rendered();
    if(has_ui && trace_ui_render) BN_LOG("[UI] dialogue sprites cleared");
    if(!visible && !choice_visible && !variable_text_visible && !has_ui) return;
    if(has_ui) render_ui_text();
    if(has_ui && trace_ui_render) BN_LOG("[UI] render pass complete cache=", ui_rendered_sprites.size());
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
    if(continuous_scroll && visible && frame_animation >= 8 && reveal_count >= text.size())
    {
        if(++scroll_tick >= animation_interval)
        {
            scroll_tick = 0;
            scroll_offset += 1;
        }
    }
    bn::string<256> display;
    if(visible)
    {
        // Keep the original typewriter order: each UTF-8 character is
        // revealed from left to right, while the visible lines stay bottom
        // aligned and scroll upward only when a new line is formed.
        for(int index = 0; index < bn::min(reveal_count, text.size()); ++index)
            if(text[index] != '\r' && display.size() < max_dialogue_bytes) display.push_back(text[index]);
    }
    auto append_display_text = [&display](const char* value) {
        if(!value) return;
        for(int index = 0; value[index] != '\0' && display.size() < max_dialogue_bytes; ++index)
            if(value[index] != '\r') display.push_back(value[index]);
    };
    if(choice_visible)
    {
        if(!display.empty() && display.size() < max_dialogue_bytes) display.push_back('\n');
        append_display_text(choice_data.prompt);
        const Settings* settings = get_settings();
        const bool has_cursor_image = settings && settings->ui_cursor_image && settings->ui_cursor_image[0] != '\0';
        for(int option_index = 0; option_index < choice_options_count; ++option_index)
        {
            if(display.size() < max_dialogue_bytes) display.push_back('\n');
            append_display_text(has_cursor_image ? "  " : (choice_index == option_index ? "> " : "  "));
            append_display_text(choice_options[option_index].c_str());
        }
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
        if(generator.width(wrapped_line) > max_line_width)
        {
            int break_index = -1;
            for(int candidate = wrapped_line.size() - 2; candidate >= 0; --candidate)
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

    constexpr int max_visible_lines = 3;
    const int first_line = continuous_scroll ? 0 : bn::max(0, line_count - max_visible_lines);
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
    int line_y = text_top_y - scroll_offset;

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
            if(!rendered_sprites.full()) rendered_sprites.push_back(*frame);
            }
        }
    }

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
        if(continuous_scroll && (line_y > 160 || line_y + line_height < 0))
        {
            line_y += line_height;
            continue;
        }
        const int line_width = generator.width(paint_line);
        const int left_x = horizontal_align && horizontal_align[0] == 'l'
            ? 8
            : horizontal_align && horizontal_align[0] == 'r'
                ? 240 - 8 - line_width
                : (240 - line_width) / 2;
        if(!paint_line.empty())
        {
            (void) generator.generate_top_left_optional(left_x, line_y, paint_line, rendered_sprites);
        }
        line_y += line_height;
    }

    if(continuous_scroll && reveal_count >= text.size() && scroll_offset >= line_count * line_height)
    {
        if(page_index + 1 < page_count)
        {
            ++page_index;
            load_page();
            scroll_offset = 0;
            scroll_tick = 0;
        }
        else
        {
            hide();
            close_finished = true;
        }
    }

    if(choice_visible && settings && settings->ui_cursor_image && settings->ui_cursor_image[0] != '\0')
    {
        const int cursor_line = line_count - choice_options_count + choice_index;
        auto cursor = GraphicsManager::instance().create_ui_sprite(settings->ui_cursor_image, -112 + 8, text_top_y - 80 + cursor_line * line_height + 8);
        if(cursor.has_value())
        {
            cursor->set_bg_priority(0);
            cursor->set_z_order(-3);
            if(!rendered_sprites.full()) rendered_sprites.push_back(*cursor);
        }
    }
    render_variable_text();
}
