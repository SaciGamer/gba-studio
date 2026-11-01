#include "camera_manager.h"

#include "bn_display.h"
#include "graphics_manager.h"

void CameraManager::stop_follow()
{
    // Clear the Follow configuration and persistence without moving the camera.
    follow_actor(false, "__PLAYER__", false, 0, 0);
}

void CameraManager::reset_for_scene(int next_x, int next_y)
{
    if(!persist_across_scenes) {
        follow_player = false;
        follow_actor_id = "__PLAYER__";
        clamp_to_scene = false;
        lock_x = false;
        lock_y = false;
        dead_zone_width = 0;
        dead_zone_height = 0;
    }
    shake_frames = 0;
    shake_amplitude = 0;
    shake_axis = 0;
    set_position(next_x, next_y);
}

void CameraManager::follow_actor(bool enabled, const char* actor_id, bool clamp, int width, int height, bool lock_horizontal, bool lock_vertical, bool persist)
{
    if(enabled) {
        // Scene setup can position the viewport outside CameraManager. Follow
        // starts there, without recentering a locked axis or adopting our shake.
        const auto& graphics = GraphicsManager::instance();
        const int visible_x = graphics.get_camera_x();
        const int visible_y = graphics.get_camera_y();
        if(visible_x != last_render_x) x = visible_x;
        if(visible_y != last_render_y) y = visible_y;
    }
    follow_player = enabled;
    follow_actor_id = actor_id ? actor_id : "__PLAYER__";
    clamp_to_scene = clamp;
    lock_x = lock_horizontal;
    lock_y = lock_vertical;
    persist_across_scenes = persist;
    dead_zone_width = width < 0 ? 0 : width > 240 ? 240 : width;
    dead_zone_height = height < 0 ? 0 : height > 160 ? 160 : height;
}

void CameraManager::set_position(int next_x, int next_y)
{
    x = next_x;
    y = next_y;
    last_render_x = x;
    last_render_y = y;
    GraphicsManager::instance().set_camera_position(x, y);
}

void CameraManager::shake(int frames, int amplitude, int axis)
{
    shake_frames = frames > 120 ? 120 : frames > 0 ? frames : 0;
    shake_amplitude = amplitude > 8 ? 8 : amplitude > 0 ? amplitude : 0;
    shake_axis = axis == 1 || axis == 2 ? axis : 0;
}

void CameraManager::update()
{
    if(follow_player)
    {
        auto& graphics = GraphicsManager::instance();
        const int target_x = graphics.read_numeric_actor_property(follow_actor_id.data(), 0);
        const int target_y = graphics.read_numeric_actor_property(follow_actor_id.data(), 1);
        const int left = (240 - dead_zone_width) / 2;
        const int top = (160 - dead_zone_height) / 2;
        if(!lock_x) {
            if(target_x < x + left) x = target_x - left;
            else if(target_x > x + left + dead_zone_width) x = target_x - left - dead_zone_width;
        }
        if(!lock_y) {
            if(target_y < y + top) y = target_y - top;
            else if(target_y > y + top + dead_zone_height) y = target_y - top - dead_zone_height;
        }
        if(clamp_to_scene) if(const auto* scene = graphics.getScene()) {
            const int max_x = scene->scene_width > 240 ? scene->scene_width - 240 : 0;
            const int max_y = scene->scene_height > 160 ? scene->scene_height - 160 : 0;
            if(!lock_x) x = x < 0 ? 0 : x > max_x ? max_x : x;
            if(!lock_y) y = y < 0 ? 0 : y > max_y ? max_y : y;
        }
    }

    int render_x = x;
    int render_y = y;
    if(shake_frames > 0)
    {
        const int phase = shake_frames & 1;
        if(shake_axis != 2) render_x += phase ? shake_amplitude : -shake_amplitude;
        if(shake_axis != 1) render_y += phase ? -shake_amplitude : shake_amplitude;
        --shake_frames;
    }
    last_render_x = render_x;
    last_render_y = render_y;
    GraphicsManager::instance().set_camera_position(render_x, render_y);
}
