#ifndef AUDIO_MANAGER_H
#define AUDIO_MANAGER_H

#include "bn_string.h"
#include "bn_array.h"
#include "bn_optional.h"
#include "bn_sound_handle.h"
#include "bn_music.h"
#include "bn_sound.h"

class AudioManager {
    struct SoundGroup {
        bn::string<32> id;
        bn::optional<bn::sound_handle> handle;
    };
    bn::array<SoundGroup, 8> sound_groups;
    bn::string<64> current_music;
    int music_volume = 100;
    int fade_target = 100;
    int fade_frames = 0;
    bool playing = false;
    bool paused = false;
public:
    static AudioManager& instance();
    bool play_music(const bn::string<64>& music_id, int volume = 100, bool loop = true);
    bool play_sound(const bn::string<64>& sound_id, int volume = 100, int speed = 100, int panning = 0, int priority = 0, const bn::string<32>& group = {});
    bool stop_sound_group(const bn::string<32>& group);
    void stop_music();
    bool pause_music();
    bool resume_music();
    void fade_music(int target_volume, int duration_frames);
    void update();
    void set_volume(int volume);
    const bn::string<64>& current_music_id() const { return current_music; }
    bool is_playing() const { return playing && !paused; }
};

#endif
