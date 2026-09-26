#include "camera_manager.h"

#include "bn_display.h"
#include "graphics_manager.h"

void CameraManager::set_position(int next_x, int next_y)
{
    x = next_x;
    y = next_y;
    GraphicsManager::instance().set_camera_position(x, y);
}

void CameraManager::shake(int frames, int amplitude)
{
    shake_frames = frames > 0 ? frames : 0;
    shake_amplitude = amplitude > 0 ? amplitude : 0;
}

void CameraManager::update()
{
    if(follow_player)
    {
        // Keep the player centred while retaining the explicit world position
        // as the source of truth for scene transitions.
        const int target_x = GraphicsManager::instance().get_player_world_x() - 120;
        const int target_y = GraphicsManager::instance().get_player_world_y() - 80;
        x = target_x;
        y = target_y;
    }

    int render_x = x;
    int render_y = y;
    if(shake_frames > 0)
    {
        const int phase = shake_frames & 1;
        render_x += phase ? shake_amplitude : -shake_amplitude;
        render_y += phase ? -shake_amplitude : shake_amplitude;
        --shake_frames;
    }
    GraphicsManager::instance().set_camera_position(render_x, render_y);
}
