#include "spawner_timeline_manager.h"

namespace
{
bool same_id(const char* left, const char* right)
{
    if(!left || !right) return left == right;
    while(*left && *right && *left == *right)
    {
        ++left;
        ++right;
    }
    return *left == *right;
}
}

SpawnerTimelineManager& SpawnerTimelineManager::instance()
{
    static SpawnerTimelineManager manager;
    return manager;
}

void SpawnerTimelineManager::configure(const SpawnerTimeline* timelines, int timelines_count)
{
    _timelines = timelines;
    _timelines_count = timelines_count > 0 ? timelines_count : 0;
    stop();
}

bool SpawnerTimelineManager::start(const char* timeline_id)
{
    stop();
    if(!timeline_id || !_timelines) return false;
    for(int index = 0; index < _timelines_count; ++index)
    {
        const SpawnerTimeline& timeline = _timelines[index];
        if(timeline.id && same_id(timeline.id, timeline_id))
        {
            _current = &timeline;
            _active = true;
            return true;
        }
    }
    return false;
}

void SpawnerTimelineManager::stop()
{
    _current = nullptr;
    _entry_index = 0;
    _frame = 0;
    _active = false;
}

void SpawnerTimelineManager::update()
{
    if(_active && _frame < 0x7fffffff) ++_frame;
}

bool SpawnerTimelineManager::pop_due(SpawnerTimelineEntry& entry)
{
    if(!_active || !_current || !_current->entries) return false;
    if(_entry_index >= _current->entries_count)
    {
        _active = false;
        return false;
    }
    const SpawnerTimelineEntry& candidate = _current->entries[_entry_index];
    if(candidate.frame > _frame) return false;
    entry = candidate;
    ++_entry_index;
    return true;
}
