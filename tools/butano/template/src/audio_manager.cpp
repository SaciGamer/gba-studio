#include "audio_manager.h"
#include "audio_registry.h"

AudioManager& AudioManager::instance()
{
    static AudioManager manager;
    return manager;
}

bool AudioManager::play_music(const bn::string<64>& music_id, int volume, bool loop)
{
    if(music_id.empty() || volume < 0 || volume > 100) return false;
    const auto item = resolve_music_item(music_id);
    if(!item.has_value()) return false;
    current_music = music_id;
    music_volume = volume;
    playing = true;
    paused = false;
    item->play(bn::fixed(volume) / 100, loop);
    return true;
}

bool AudioManager::play_sound(const bn::string<64>& sound_id, int volume, int speed, int panning, int priority, const bn::string<32>& group)
{
    if(sound_id.empty() || volume < 0 || volume > 100 || speed < 25 || speed > 400 || panning < -100 || panning > 100 || priority < -32767 || priority > 32767) return false;
    const auto item = resolve_sound_item(sound_id);
    if(!item.has_value()) return false;
    bn::sound_handle handle = item->play_with_priority(priority, bn::fixed(volume) / 100, bn::fixed(speed) / 100, bn::fixed(panning) / 100);
    if(!group.empty())
    {
        int free_index = -1;
        for(int index = 0; index < sound_groups.size(); ++index)
        {
            if(sound_groups[index].id == group)
            {
                sound_groups[index].handle = handle;
                return true;
            }
            if(free_index < 0 && sound_groups[index].id.empty()) free_index = index;
        }
        if(free_index < 0) return false;
        sound_groups[free_index].id = group;
        sound_groups[free_index].handle = handle;
    }
    return true;
}

bool AudioManager::stop_sound_group(const bn::string<32>& group)
{
    if(group.empty())
    {
        bn::sound::stop_all();
        for(auto& sound_group : sound_groups)
        {
            sound_group.handle.reset();
            sound_group.id.clear();
        }
        return true;
    }
    for(auto& sound_group : sound_groups)
    {
        if(sound_group.id == group)
        {
            if(sound_group.handle.has_value() && sound_group.handle->active()) sound_group.handle->stop();
            sound_group.handle.reset();
            sound_group.id.clear();
            return true;
        }
    }
    return false;
}

void AudioManager::stop_music()
{
    bn::music::stop();
    playing = false;
    paused = false;
    fade_frames = 0;
}

bool AudioManager::pause_music()
{
    if(!playing || paused) return false;
    bn::music::pause();
    paused = true;
    return true;
}

bool AudioManager::resume_music()
{
    if(!playing || !paused) return false;
    bn::music::resume();
    paused = false;
    return true;
}

void AudioManager::fade_music(int target_volume, int duration_frames)
{
    fade_target = target_volume < 0 ? 0 : (target_volume > 100 ? 100 : target_volume);
    fade_frames = duration_frames > 0 ? duration_frames : 0;
    if(!fade_frames) set_volume(fade_target);
}

void AudioManager::update()
{
    if(!playing || fade_frames <= 0) return;
    const int delta = fade_target - music_volume;
    const int step = delta / fade_frames;
    set_volume(music_volume + (step == 0 ? (delta > 0 ? 1 : -1) : step));
    --fade_frames;
    if(fade_frames == 0) set_volume(fade_target);
}

void AudioManager::set_volume(int volume)
{
    music_volume = volume < 0 ? 0 : (volume > 100 ? 100 : volume);
    if(playing) bn::music::set_volume(bn::fixed(music_volume) / 100);
}
