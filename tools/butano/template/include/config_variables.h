#ifndef CONFIG_VARIABLES_H
#define CONFIG_VARIABLES_H

#include "resource_types.h"

class ConfigVariables
{
public:
    static ConfigVariables& instance();

    bool configure(const void* args);
    bool reset_all();

private:
    ConfigVariables() = default;
};

bool run_config_variables(const void* args);
bool run_config_variables_reset_all();

#endif // CONFIG_VARIABLES_H
