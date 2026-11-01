// Integration probe for the actual actor pool, event spawns and packed saves.
#include "bn_sprites.h"
#include "save_manager.h"

void GraphicsManager::verify_scene_performance()
{
    static int stage = 0, frames = 0;
    if(stage || !currentScene) return;
    if(actor_count != 127) {
        BN_ASSERT(++frames < 240, "All 32 event-created actors must join the 95 placed actors");
        return;
    }
    BN_ASSERT(player_slot >= 0 && sprites[player_slot], "Player must retain its sprite at full capacity");
    BN_ASSERT(bn::sprites::used_items_count() == 128, "Expected 127 complete actors plus the player");
    int event_actors = 0;
    for(int index = 0; index < actor_count; ++index) if(actor_definitions[index]->spawn_prefab_id) ++event_actors;
    BN_ASSERT(event_actors == 32, "Prefab creation must exceed the previous 16-instance pool");
    const bn::string<64> first = actor_ids[0], last = actor_ids[126];
    const int last_x = actor_world_x[126], last_y = actor_world_y[126];
    auto& save = SaveManager::instance();
    BN_ASSERT(save.save_game(0), "Save must capture every actor at full OAM capacity");
    BN_ASSERT(remove_actor(first.data()) && remove_actor(last.data()), "Full-capacity removal failed");
    BN_ASSERT(actor_count == 125 && bn::sprites::used_items_count() == 126, "Removal must release native objects");
    BN_ASSERT(save.load_game(0), "Packed save must restore more than 16 complete actors");
    BN_ASSERT(actor_count == 127 && bn::sprites::used_items_count() == 128, "Save/load lost live actors");
    BN_ASSERT(read_numeric_actor_property(last.data(), 0) == last_x && read_numeric_actor_property(last.data(), 1) == last_y, "Save/load changed event-created actor coordinates");
    // Demonstrate player input remains responsive with all 128 OAM slots used.
    const int old_x = player_world_x;
    InputManager::instance().queue_default_action("RIGHT"); InputManager::instance().poll();
    move_player_from_input();
    BN_ASSERT(player_world_x > old_x, "Player movement stopped at full capacity");
    stage = 1;
    BN_LOG("[ACTOR_CAPACITY_OK]127 actors + player; 32 event spawns; full save/load; movement");
}
