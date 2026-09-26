#ifndef CAMERA_MANAGER_H
#define CAMERA_MANAGER_H

#include "bn_string.h"

class CameraManager
{
private:
    int x = 0;
    int y = 0;
    int shake_frames = 0;
    int shake_amplitude = 0;
    bool follow_player = false;

    CameraManager() = default;

public:
    static CameraManager& instance()
    {
        static CameraManager manager;
        return manager;
    }

    void set_position(int next_x, int next_y);
    void follow_player_actor(bool enabled) { follow_player = enabled; }
    bool is_following_player() const { return follow_player; }
    void shake(int frames, int amplitude);
    void update();
    int get_x() const { return x; }
    int get_y() const { return y; }
};

#endif
