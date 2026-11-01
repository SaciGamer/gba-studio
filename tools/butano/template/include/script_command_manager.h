#ifndef SCRIPT_COMMAND_GAME_H
#define SCRIPT_COMMAND_GAME_H

#include <string>
#include <cstdint>
#include <cstdint>
#include "bn_string.h"
#include "bn_vector.h"
#include "bn_array.h"
#include "gba_studio_features.h"
#if GBA_STUDIO_FEATURE_WAIT
#include "event_wait.h"
#endif
#if GBA_STUDIO_FEATURE_WAIT_INPUT
#include "event_wait_input.h"
#endif
#if GBA_STUDIO_FEATURE_WAIT_SIGNAL
#include "event_wait_signal.h"
#endif
#include "event_fade.h"
#include "event_motion.h"

#include "resource_types.h"
#if GBA_STUDIO_FEATURE_VARIABLES || GBA_STUDIO_FEATURE_SCRIPT_INPUTS
#include "variable_manager.h"
#endif

/**
 * ScriptCommand Manager for {{PROJECT_NAME}}
 * Scripts state and logic
 */
class ScriptCommand {
private:
    struct ScriptInstance {
        const char* button_source = nullptr;
        uint16_t button_action_path = 0;
        bn::string<64> scene_id;
        bn::string<64> self_actor_id;
        uint32_t local_owner = 0;
        const ScriptCommandData* root_data = nullptr;
        const ScriptCommandData* active_data = nullptr;
        int active_count = 0;
        int current_index = 0;
#if GBA_STUDIO_FEATURE_WAIT
        Wait wait_state{};
#endif
#if GBA_STUDIO_FEATURE_WAIT_INPUT
        WaitInput wait_input_state{};
#endif
#if GBA_STUDIO_FEATURE_WAIT_SIGNAL
        WaitSignal wait_signal_state{};
#endif
        Fade fade_state{};
#if GBA_STUDIO_FEATURE_NUMERIC
        NumericEventCache numeric_cache{};
#endif
        MotionEventState motion_state{};
#if GBA_STUDIO_FEATURE_SCRIPT_INPUTS
        VariableManager::Scope parameter_scope{};
#endif
        using LoopStates = bn::array<int8_t, 16>;
        struct Continuation {
            const ScriptCommandData* data;
            int count;
            int index;
            LoopStates loop_states;
            bn::string<64> self_actor_id{};
#if GBA_STUDIO_FEATURE_SCRIPT_INPUTS
            int parameter_start = 0;
            int parameter_used = 0;
#endif
        };
        bn::vector<Continuation, 8> continuations;
        bool occupied = false;
        bool completed = false;
        bool detached = false;
        int stop_index = -1;
        const ScriptCommandData* stop_data = nullptr;
        LoopStates structured_loop_remaining;

        ScriptInstance() {
            for(int8_t& value : structured_loop_remaining) value = -1;
        }
    };
    struct ButtonBinding {
        bn::string<64> scene_id;
        bn::string<64> self_actor_id;
        uint32_t local_owner = 0;
        const ScriptCommandData* data = nullptr;
        int count = 0;
        int branch_index = -1;
        int continuation_index = -1;
        const char* const* buttons = nullptr;
        int buttons_count = 0;
        bool override_button = false;
        bn::array<const char*, 32> removed_buttons;
        int removed_buttons_count = 0;
        ScriptInstance* running_instance = nullptr;
        uint16_t held_latched_buttons = 0;
        bool occupied = false;
    };
    bn::array<ScriptInstance, 8> instances;
    bn::array<ButtonBinding, 16> button_bindings;
    uint16_t requested_button_actions = 0;
    uint16_t requested_button_paths[10] = {};
    const char* requested_button_sources[10] = {};
    uint32_t cancellation_serial = 0;

    ScriptInstance* find_or_create(const bn::string<64>& scene_id,
                                   const ScriptCommandData* data, const char* self_actor_id, const char* trigger_owner_id = nullptr);
    void execute_instance(ScriptInstance& instance);
    bool queue_button_action(ScriptInstance& instance, const ButtonActionEventData& action);
    void attach_button(const bn::string<64>& scene_id, const ScriptCommandData* data, int count, int branch_index, int continuation_index, const ButtonWaitEventData& event, const char* self_actor_id = nullptr, uint32_t local_owner = 0);
    void remove_button_script(const bn::string<64>& scene_id, const ButtonScriptRemoveEventData& event);
public:
    // ScriptCommand(const ScriptCommandData& data);
    static ScriptCommand& instance();

    ScriptCommand();
    ~ScriptCommand();

    /**
     * Execute script command data
     */
    bool execute(bn::string<64> scene_id, const ScriptCommandData* data, int count, const char* self_actor_id = nullptr, const char* trigger_owner_id = nullptr);  // executa o comando
    void restart(bn::string<64> scene_id, const ScriptCommandData* data, const char* self_actor_id = nullptr, const char* trigger_owner_id = nullptr);
    void resetIndex();
    void update_detached_scripts();
    void cancel_actor(const bn::string<64>& scene_id, const char* actor_id);
    void cancel_scene(const bn::string<64>& scene_id);
    void update_button_bindings(const bn::string<64>& scene_id, bool allow_new_bindings = true);
    bool button_scene_transition_running(const bn::string<64>& scene_id) const;
};

#endif // SCRIPT_COMMAND_GAME_H
