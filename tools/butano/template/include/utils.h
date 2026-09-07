#ifndef UTILS_H
#define UTILS_H

#include "bn_log.h"
#include "bn_core.h"
#include "bn_string.h"

namespace utils_functions {

    inline int to_int(const char* str) {
        int result = 0;
        while(*str) {
            if(*str >= '0' && *str <= '9') {
                result = result * 10 + (*str - '0');
            }
            ++str;
        }
        return result;
    }

    inline bn::fixed to_fixed(const char* str) {
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

#endif
