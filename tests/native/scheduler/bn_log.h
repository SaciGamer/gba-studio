#pragma once
#include <string>
#include <sstream>
#include <vector>
inline std::vector<std::string> scheduler_logs;
template<class... Args>
void scheduler_log(const Args&... args)
{
    std::ostringstream message;
    (message << ... << args);
    scheduler_logs.push_back(message.str());
}
#define BN_LOG(...) scheduler_log(__VA_ARGS__)
