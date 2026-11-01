#ifndef BACKGROUND_ANIMATION_BITMAP_H
#define BACKGROUND_ANIMATION_BITMAP_H

#include <cstdint>
#include "bn_algorithm.h"
#include "bn_hdma.h"
#include "bn_sp_direct_bitmap_bg_painter.h"

namespace background_animation {

inline void copy_bitmap_row(const bn::color* source, int count, bn::color* target, bool aligned, bool use_dma) {
#ifdef __arm__
    if(use_dma) {
        // Immediate DMA3, the same channel reserved for low-priority HDMA.
        auto* registers = reinterpret_cast<volatile uint32_t*>(0x040000D4);
        registers[2] = 0;
        registers[0] = uint32_t(reinterpret_cast<std::uintptr_t>(source));
        registers[1] = uint32_t(reinterpret_cast<std::uintptr_t>(target));
        registers[2] = aligned ? (0x84000000u | unsigned(count / 2)) : (0x80000000u | unsigned(count));
        return;
    }
#else
    (void)use_dma;
#endif
    if(aligned) _bn::memory::unsafe_copy_words(source, count / 2, target);
    else _bn::memory::unsafe_copy_half_words(source, count, target);
}

// Paint only the visible window. Never clear pixels which the opaque ROM image
// immediately replaces: single-page bitmap VRAM is also the displayed page.
inline void paint_bitmap(bn::sp_direct_bitmap_bg_painter& painter,
                         const bn::direct_bitmap_item& item, int x, int y) {
    const int width = item.dimensions().width(), height = item.dimensions().height();
    constexpr int screen_width = 240, screen_height = 160;
    const int left = bn::max(0, bn::min(screen_width, x));
    const int top = bn::max(0, bn::min(screen_height, y));
    const int right = bn::max(left, bn::min(screen_width, x + width));
    const int bottom = bn::max(top, bn::min(screen_height, y + height));
    const bn::color black(0, 0, 0);
    if(bottom <= top || right <= left) {
        painter.fill(black);
        return;
    }
    if(top > 0) painter.rectangle(0, 0, screen_width - 1, top - 1, black);
    if(bottom < screen_height) painter.rectangle(0, bottom, screen_width - 1, screen_height - 1, black);
    if(left > 0) painter.rectangle(0, top, left - 1, bottom - 1, black);
    if(right < screen_width) painter.rectangle(right, top, screen_width - 1, bottom - 1, black);
    const bn::color* source = item.colors_ptr() + (top - y) * width + left - x;
    // Access through the BG pointer: this Butano version's painter.page()
    // casts its _page function instead of calling it and is not a VRAM span.
    auto bg = painter.bg();
    bn::color* target = bg.page().data() + top * screen_width + left;
    const int count = right - left;
    const bool aligned = ((reinterpret_cast<std::uintptr_t>(source) |
                           reinterpret_cast<std::uintptr_t>(target) |
                           unsigned(width * 2) | unsigned(count * 2)) & 3) == 0;
    // DMA3 is free outside Butano's commit unless low-priority HDMA owns it.
    // Immediate DMA completes before the CPU continues; audio uses DMA1/2.
    const bool use_dma = !bn::hdma::running();
    for(int row = top; row < bottom; ++row) {
        copy_bitmap_row(source, count, target, aligned, use_dma);
        source += width;
        target += screen_width;
    }
}

}
#endif
