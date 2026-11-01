#ifndef CAMERA_MANAGER_H
#define CAMERA_MANAGER_H

#include "bn_string.h"

class CameraManager
{
private:
    int x = 0;
    int y = 0;
    int last_render_x = 0;
    int last_render_y = 0;
    int shake_frames = 0;
    int shake_amplitude = 0;
    int shake_axis = 0;
    bool follow_player = false;
    bn::string<64> follow_actor_id = "__PLAYER__";
    bool clamp_to_scene = false;
    bool lock_x = false;
    bool lock_y = false;
    bool persist_across_scenes = false;
    int dead_zone_width = 0;
    int dead_zone_height = 0;

    CameraManager() = default;

public:
    static CameraManager& instance()
    {
        static CameraManager manager;
        return manager;
    }

    void set_position(int next_x, int next_y);
    void stop_follow();
    void reset_for_scene(int next_x, int next_y);
    void follow_player_actor(bool enabled) { follow_actor(enabled, "__PLAYER__", false, 0, 0); }
    void follow_actor(bool enabled, const char* actor_id, bool clamp, int width, int height, bool lock_horizontal = false, bool lock_vertical = false, bool persist = false);
    bool is_following_player() const { return follow_player; }
    void shake(int frames, int amplitude, int axis = 0);
    void update();
    int get_x() const { return x; }
    int get_y() const { return y; }
};

#endif
