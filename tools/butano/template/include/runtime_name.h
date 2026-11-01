#ifndef RUNTIME_NAME_H
#define RUNTIME_NAME_H

// ROM names can be compared in place. Avoid constructing fixed-capacity strings
// or depending on libc string routines in Butano's freestanding runtime.
inline bool runtime_name_equal(const char* left, const char* right)
{
    if(left == right) return true;
    if(!left) return !right || !*right;
    if(!right) return !*left;
    while(*left == *right) {
        if(!*left) return true;
        ++left;
        ++right;
    }
    return false;
}

#endif
