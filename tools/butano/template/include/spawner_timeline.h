#ifndef SPAWNER_TIMELINE_H
#define SPAWNER_TIMELINE_H

struct SpawnerTimelineEntry
{
    int frame;
    const char* archetype_id;
    int x;
    int y;
    const char* pattern_id;
    const char* drop_id;
};

struct SpawnerTimeline
{
    const char* id;
    const SpawnerTimelineEntry* entries;
    int entries_count;
};

#endif
