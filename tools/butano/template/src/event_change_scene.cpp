#include "event_change_scene.h"

#include "bn_log.h"
#include "bn_core.h"
#include "event_fade.h"
#include "graphics_manager.h"
#include "script_command_manager.h"

ChangeScene changeScene;

bool run_change_scene(const void* args)
{
    if(!args) return true;
    return run_change_scene(*static_cast<const SceneChangeEventData*>(args));
}

bool run_change_scene(const SceneChangeEventData& data)
{
    if(changeScene.active)
    {
        if(run_fade(changeScene.fadeSpeed, FadeType::OUT, true))
        {
            if(const Scenes* currentScene = GraphicsManager::instance().getScene())
            {
                ScriptCommand::instance().cancel_scene(currentScene->id);
            }
            const Scenes* nextScene = GraphicsManager::instance().load_next_scene_by_id(changeScene.next_scene_id);
            if(nextScene)
            {
                GraphicsManager::instance().spawn_player(*nextScene, changeScene.x, changeScene.y,
                                                          changeScene.direction.data(), true);
                BN_LOG("runChangeScene sceneName: ", nextScene->name);
            }
            else
            {
                BN_LOG("runChangeScene: scene not found");
            }
            changeScene.active = false;
            return true;
        }
    }
    else
    {
        changeScene.next_scene_id = data.scene_id ? data.scene_id : "";
        changeScene.x = data.x;
        changeScene.y = data.y;
        changeScene.direction = data.direction ? data.direction : "right";
        changeScene.fadeSpeed = data.fade_speed < 1 ? 1 : data.fade_speed;
        changeScene.countFixed = bn::fixed(0);
        changeScene.active = true;
    }
    return false;
}
