#pragma once
#include <cassert>
#include <vector>
namespace bn {
template<class T, int N> class vector {
    std::vector<T> values;
public:
    bool empty() const { return values.empty(); }
    int size() const { return int(values.size()); }
    constexpr int max_size() const { return N; }
    void push_back(const T& value) { assert(size() < N); values.push_back(value); }
    void pop_back() { assert(!empty()); values.pop_back(); }
    T& back() { assert(!empty()); return values.back(); }
};
}
