#pragma once
#include <map>
#include <string>
#include "resource_types.h"

// Test double for the scheduler boundary, not a second scheduler implementation.
// execute() returns false until the configured number of frame visits, then true.
// Completed instances retain their slot until restart(), as in the real scheduler.
class ScriptCommand {
public:
    struct Record { int visits = 0; int completions = 0; int starts = 0; int progress = 0; bool occupied = false; };
    std::map<const ScriptCommandData*, Record> records;
    std::map<const ScriptCommandData*, int> durations;
    int cancellations = 0;
    std::string cancelled_scene;
    static ScriptCommand& instance() { static ScriptCommand value; return value; }
    bool execute(const bn::string<64>&, const ScriptCommandData* program, int) {
        auto& record = records[program];
        if(!record.occupied) { record.occupied = true; ++record.starts; }
        ++record.visits;
        const int duration = durations.count(program) ? durations[program] : 3;
        if(record.progress < duration && ++record.progress == duration) ++record.completions;
        return record.progress >= duration;
    }
    void restart(const bn::string<64>&, const ScriptCommandData* program) {
        auto& record = records[program];
        record.progress = 0;
        record.occupied = false;
    }
    void cancel_scene(const bn::string<64>& scene) {
        ++cancellations;
        cancelled_scene = scene;
        for(auto& entry : records) { entry.second.progress = 0; entry.second.occupied = false; }
    }
};
