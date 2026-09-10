#ifndef SCRIPT_EVENT_HANDLERS_H
#define SCRIPT_EVENT_HANDLERS_H

#include "bn_string.h"
#include "resource_types.h"

class IfEventHandler
{
public:
    static bool evaluate(const ScriptConditionData& condition);
};

class FadeEventHandler
{
public:
    static bool execute(const bn::string<64>& command, const void* args);
};

class WaitEventHandler
{
public:
    static bool execute(const void* args);
};

class ChangeSceneEventHandler
{
public:
    static bool execute(const void* args);
};

class ChangeLayerEventHandler
{
public:
    static bool execute(const void* args, const bn::string<64>& sceneId);
};

class VariableEventHandler
{
public:
    static bool execute(const bn::string<64>& command, const void* args);
};

#endif // SCRIPT_EVENT_HANDLERS_H