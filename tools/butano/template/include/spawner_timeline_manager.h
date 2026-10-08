#ifndef SPAWNER_TIMELINE_MANAGER_H
#define SPAWNER_TIMELINE_MANAGER_H

#include "spawner_timeline.h"

class SpawnerTimelineManager
{
public:
    static SpawnerTimelineManager& instance();
    void configure(const SpawnerTimeline* timelines, int timelines_count);
    bool start(const char* timeline_id);
    void stop();
    void update();
    bool pop_due(SpawnerTimelineEntry& entry);
    bool active() const { return _active; }
    int frame() const { return _frame; }

private:
    const SpawnerTimeline* _timelines = nullptr;
    int _timelines_count = 0;
    const SpawnerTimeline* _current = nullptr;
    int _entry_index = 0;
    int _frame = 0;
    bool _active = false;
};

#endif
