/**
 * {{PROJECT_NAME}} - GBA Game
 * Author: {{AUTHOR}}
 * Version: {{VERSION}}
 * 
 * Built with GBA Studio engine for Butano
 */

#include "event_wait.h"

#include "bn_log.h"
#include "bn_core.h"
#include "bn_string.h"
#include "bn_fixed.h"

#include "utils.h"

Wait wait;

bool run_wait(const void* args) {
    if (wait.active) {
        if (wait.type == WaitType::TIME) {
            // decrementa tempo
            wait.countFixed += bn::fixed(1) / 60; // supondo 60 fps
            // BN_LOG("runWait Secounds: ", wait.countFixed);
            BN_LOG("runWait Time: ", wait.countFixed);

            if(wait.countFixed >= wait.time) {
                wait.countFixed = 0;
                wait.active = false;
                return true;
            }
        } else if (wait.type == WaitType::FRAMES) {
            wait.countInt++;
            BN_LOG("runWait Frames: ", wait.countInt);
             
            if(wait.countInt >= wait.frames) { 
                wait.countInt = 0;
                wait.active = false;
                return true;
            }
        }
    } else {
        const void* const* strArgs = static_cast<const void* const*>(args);

        const float* time = static_cast<const float*>(strArgs[0]);
        const int* frames = static_cast<const int*>(strArgs[1]);

        wait.time = bn::fixed(*time);
        wait.frames = *frames;
        bn::string<64> units = static_cast<const char*>(strArgs[2]);
        
        wait.active = true;

        if (units == "time") {
            wait.countInt = 0;
            wait.type = WaitType::TIME;
        } else if (units == "frames") {
            wait.countFixed = bn::fixed(0);
            wait.type = WaitType::FRAMES;
        }
    }

     return false;
    
}