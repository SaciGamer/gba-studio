#ifndef SCRIPT_COMMAND_GAME_H
#define SCRIPT_COMMAND_GAME_H

#include <string>
#include "bn_string.h"
#include "bn_vector.h"
#include "bn_array.h"
#include "event_wait.h"
#include "event_fade.h"

#include "resource_types.h"

/**
 * ScriptCommand Manager for {{PROJECT_NAME}}
 * Scripts state and logic
 */
class ScriptCommand {
private:
    struct ScriptInstance {
        bn::string<64> scene_id;
        const ScriptCommandData* root_data = nullptr;
        const ScriptCommandData* active_data = nullptr;
        int active_count = 0;
        int current_index = 0;
        Wait wait_state{};
        Fade fade_state{};
        struct Continuation { const ScriptCommandData* data; int count; int index; };
        bn::vector<Continuation, 8> continuations;
        bool occupied = false;
        bool completed = false;
        int stop_index = -1;
        int structured_loop_remaining[16];

        ScriptInstance() {
            for(int& value : structured_loop_remaining) value = -1;
        }
    };
    struct ButtonBinding {
        bn::string<64> scene_id;
        const ScriptCommandData* data = nullptr;
        int count = 0;
        int branch_index = -1;
        int continuation_index = -1;
        const char* const* buttons = nullptr;
        int buttons_count = 0;
        bool override_button = false;
        ScriptInstance* running_instance = nullptr;
        bool occupied = false;
    };
    bn::array<ScriptInstance, 8> instances;
    bn::array<ButtonBinding, 16> button_bindings;

    ScriptInstance* find_or_create(const bn::string<64>& scene_id,
                                   const ScriptCommandData* data);
    void execute_instance(ScriptInstance& instance);
    void attach_button(const bn::string<64>& scene_id, const ScriptCommandData* data, int count, int branch_index, int continuation_index, const ButtonWaitEventData& event);
public:
    // ScriptCommand(const ScriptCommandData& data);
    static ScriptCommand& instance() {
        static ScriptCommand sc;
        return sc;
    }

    ScriptCommand();
    ~ScriptCommand();

    /**
     * Execute script command data
     */
    bool execute(bn::string<64> scene_id, const ScriptCommandData* data, int count);  // executa o comando
    void restart(bn::string<64> scene_id, const ScriptCommandData* data);
    void resetIndex();
    void cancel_scene(const bn::string<64>& scene_id);
    void update_button_bindings(const bn::string<64>& scene_id);
};

#endif // SCRIPT_COMMAND_GAME_H
