#ifndef AUDIO_MANAGER_H
#define AUDIO_MANAGER_H

#include "bn_string.h"
#include "bn_music.h"
#include "bn_sound.h"

class AudioManager {
    bn::string<64> current_music;
    int music_volume = 100;
    bool playing = false;
public:
    static AudioManager& instance();
    bool play_music(const bn::string<64>& music_id, int volume = 100);
    bool play_sound(const bn::string<64>& sound_id, int volume = 100);
    void stop_music();
    void set_volume(int volume);
    const bn::string<64>& current_music_id() const { return current_music; }
    bool is_playing() const { return playing; }
};

#endif
