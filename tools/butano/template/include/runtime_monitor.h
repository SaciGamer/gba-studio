#ifndef GBA_STUDIO_RUNTIME_MONITOR_H
#define GBA_STUDIO_RUNTIME_MONITOR_H

namespace RuntimeMonitor
{
#if defined(GBA_STUDIO_NATIVE_SCENE_LIFECYCLE) || !defined(__arm__)
    inline void sample() {}
    inline void update() {}
#else
    // Memory-only checkpoints never allocate or log. Updates publish once per
    // 60 gameplay frames through the mGBA debug channel used by EmulatorJS.
    void sample();
    void update();
#endif
}
#endif
