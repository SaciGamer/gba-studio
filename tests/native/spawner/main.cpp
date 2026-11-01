#include <cassert>
#include "spawner_timeline_manager.h"

int main()
{
    const SpawnerTimelineEntry entries[] = {
        {0, "enemy_a", 10, 20, "straight", nullptr},
        {2, "enemy_b", 30, 40, "sine", nullptr},
    };
    const SpawnerTimeline timelines[] = {{"wave_1", entries, 2}};
    auto& manager = SpawnerTimelineManager::instance();
    manager.configure(timelines, 1);
    assert(manager.start("wave_1"));
    SpawnerTimelineEntry due{};
    assert(manager.pop_due(due) && due.frame == 0 && due.x == 10);
    assert(!manager.pop_due(due));
    manager.update();
    assert(!manager.pop_due(due));
    manager.update();
    assert(manager.pop_due(due) && due.frame == 2 && due.y == 40);
    assert(!manager.pop_due(due));
    assert(!manager.start("missing"));
    return 0;
}
