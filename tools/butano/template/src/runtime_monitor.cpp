#include "runtime_monitor.h"
#if defined(__arm__) && !defined(GBA_STUDIO_NATIVE_SCENE_LIFECYCLE)
#include "bn_memory.h"
#include "bn_log.h"
#include "bn_sprites.h"
#include "bn_sprite_tiles.h"
#include "bn_bg_tiles.h"
#include <cstdint>

extern unsigned BN_IWRAM_TOP;
namespace
{
    struct MonitorState
    {
        int frame = 0;
        int publish_tick = 0;
        int stack = 0;
        int stack_peak = 0;
        int iwram_min = 0;
        int heap_min = 0;
        bool initialized = false;
        int sprites_peak = 0;
        int sprite_tiles_peak = 0;
        int bg_blocks_peak = 0;
    };
    __attribute__((section(".sbss"))) MonitorState state;
}

void RuntimeMonitor::sample()
{
    if(!state.initialized)
    {
        state.iwram_min = 32768;
        state.heap_min = 262144;
        state.initialized = true;
    }
    state.stack = bn::memory::used_stack_iwram();
    state.stack_peak = bn::max(state.stack_peak, state.stack);
    const int stack_top = int(reinterpret_cast<uintptr_t>(&BN_IWRAM_TOP) - 0x03000000);
    const int remaining = stack_top - bn::memory::used_static_iwram() - state.stack;
    state.iwram_min = bn::min(state.iwram_min, remaining);
    state.heap_min = bn::min(state.heap_min, bn::memory::available_alloc_ewram());
    state.sprites_peak = bn::max(state.sprites_peak, bn::sprites::used_items_count());
    state.sprite_tiles_peak = bn::max(state.sprite_tiles_peak, bn::sprite_tiles::used_tiles_count());
    state.bg_blocks_peak = bn::max(state.bg_blocks_peak, bn::bg_tiles::used_blocks_count());
}

void RuntimeMonitor::update()
{
    sample();
    ++state.frame;
    if(++state.publish_tick < 60) return;
    state.publish_tick = 0;
    // Versioned numeric payload stays well below Butano's 256-byte log limit.
    // No ROM pointers or scene strings are sent to the host.
    BN_LOG("[GBAS_MONITOR:1]", state.frame, ",", bn::memory::used_static_iwram(), ",",
        state.stack, ",", state.stack_peak, ",", state.iwram_min, ",",
        bn::memory::used_static_ewram(), ",", bn::memory::used_alloc_ewram(), ",",
        bn::memory::available_alloc_ewram(), ",", state.heap_min, ",",
        bn::sprites::used_items_count(), ",", bn::sprites::available_items_count(), ",",
        bn::sprite_tiles::used_tiles_count(), ",", bn::sprite_tiles::available_tiles_count(), ",",
        bn::bg_tiles::used_blocks_count(), ",", bn::bg_tiles::available_blocks_count(), ",", state.sprites_peak, ",", state.sprite_tiles_peak, ",", state.bg_blocks_peak, ";");
}
#endif
