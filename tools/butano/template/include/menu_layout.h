#ifndef GBA_STUDIO_MENU_LAYOUT_H
#define GBA_STUDIO_MENU_LAYOUT_H

namespace menu_layout {
    constexpr int max_options = 32;
    constexpr int max_prompt_rows = 2;
    constexpr int text_width = 224;
    constexpr int side_width(int columns) { return columns * 60; }
    constexpr int line_height = 16;
    constexpr int gap = 8;
    constexpr int cursor_width = 16;
    constexpr int columns(int value) { return value < 1 ? 1 : value > 4 ? 4 : value; }
    constexpr int visible_rows(int position, int prompt_rows) { return position == 0 ? 3 - prompt_rows : 9 - prompt_rows; }
    constexpr int columns_for_position(int value, int position) { return columns(value) > 2 && (position == 2 || position == 3) ? 2 : columns(value); }
    constexpr int width_for_position(int position, int cols) { return position == 2 || position == 3 ? side_width(columns_for_position(cols, position)) : text_width; }
    constexpr int content_width_for_position(int position, int cols) { return position == 2 || position == 3 ? width_for_position(position, cols) - 16 : text_width; }
    constexpr int content_left_for_position(int position, int cols) { return position == 3 ? 240 - width_for_position(position, cols) + 8 : 8; }
    constexpr int option_left_for_position(int position, int cols) { return position == 2 ? 0 : position == 3 ? 240 - width_for_position(position, cols) : 8; }
    constexpr int cell_width(int width, int cols) { return (width - (cols - 1) * gap) / cols; }
    constexpr int row(int index, int cols, int rows, bool column_major) { return column_major ? index % rows : index / cols; }
    constexpr int column(int index, int cols, int rows, bool column_major) { return column_major ? index / rows : index % cols; }
    constexpr int move(int index, int count, int cols, int rows, bool column_major, int dx, int dy) {
        if(count <= 1) return 0;
        if(column_major ? dy != 0 : dx != 0) return (index + (column_major ? dy : dx) + count) % count;
        const int stride = column_major ? rows : cols;
        const int fixed = index % stride;
        const int cells = (count + stride - 1) / stride;
        int moving = index / stride;
        for(int attempt = 0; attempt < cells; ++attempt) {
            moving = (moving + (column_major ? dx : dy) + cells) % cells;
            const int candidate = moving * stride + fixed;
            if(candidate < count) return candidate;
        }
        return index;
    }
}
#endif
