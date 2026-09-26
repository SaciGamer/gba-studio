#include "audio_manager.h"
#include "audio_registry.h"

AudioManager& AudioManager::instance()
{
    static AudioManager manager;
    return manager;
}

bool AudioManager::play_music(const bn::string<64>& music_id, int volume)
{
    if(music_id.empty() || volume < 0 || volume > 100) return false;
    const auto item = resolve_music_item(music_id);
    if(!item.has_value()) return false;
    current_music = music_id;
    music_volume = volume;
    playing = true;
    item->play(bn::fixed(volume) / 100, true);
    return true;
}

bool AudioManager::play_sound(const bn::string<64>& sound_id, int volume)
{
    if(sound_id.empty() || volume < 0 || volume > 100) return false;
    const auto item = resolve_sound_item(sound_id);
    if(!item.has_value()) return false;
    item->play(bn::fixed(volume) / 100);
    return true;
}

void AudioManager::stop_music()
{
    bn::music::stop();
    playing = false;
}

void AudioManager::set_volume(int volume)
{
    music_volume = volume < 0 ? 0 : (volume > 100 ? 100 : volume);
    if(playing) bn::music::set_volume(bn::fixed(music_volume) / 100);
}
