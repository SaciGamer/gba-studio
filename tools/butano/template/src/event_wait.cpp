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

Wait wait;

namespace wait_functions {
    int to_int(const char* str) {
        int result = 0;
        while(*str) {
            if(*str >= '0' && *str <= '9') {
                result = result * 10 + (*str - '0');
            }
            ++str;
        }
        return result;
    }

    bn::fixed to_fixed(const char* str) {
        int integerPart = 0;
        int fractionalPart = 0;
        int divisor = 1;
        bool afterDecimal = false;

        while (*str) {
            if (*str == '.') {
                afterDecimal = true;
            } else if (*str >= '0' && *str <= '9') {
                if (!afterDecimal) {
                    integerPart = integerPart * 10 + (*str - '0');
                } else {
                    fractionalPart = fractionalPart * 10 + (*str - '0');
                    divisor *= 10;
                }
            }
            ++str;
        }

        float result = integerPart + (divisor > 1 ? (float)fractionalPart / divisor : 0.0f);
        return bn::fixed(result);
    }
}

bool runWait(const void* args) {
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
        const char* const* strArgs = static_cast<const char* const*>(args);

        wait.time = wait_functions::to_fixed(strArgs[0]);  // "5.5" → 5.5
        wait.frames = wait_functions::to_int(strArgs[1]);  // "45"  → 45
        bn::string<64> units = strArgs[2];                 // secounds(time) or frames
        
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