#ifndef NUMERIC_VALUES_H
#define NUMERIC_VALUES_H
#include <cstdint>
#include <cstddef>
#include <climits>

enum class NumericOperation : uint8_t {
    op_number, op_variable, op_property, op_engine,
    op_add, op_subtract, op_multiply, op_divide, op_modulo, op_min, op_max, op_abs, op_atan2, op_sqrt, op_random,
    op_and, op_or, op_not, op_equal, op_notEqual, op_greater, op_greaterEqual, op_less, op_lessEqual,
    op_shiftLeft, op_shiftRight, op_bitAnd, op_bitOr, op_bitXor, op_bitNot
};
struct NumericInstruction { NumericOperation operation; int value; const char* reference; int argument; };
struct NumericProgram { const NumericInstruction* instructions; int count; };
struct NumericEventField { std::size_t offset; const NumericProgram* program; int minimum; int maximum; };
struct NumericEventValues { const NumericEventField* fields; int count; std::size_t payload_size; };
struct NumericRuntimeHooks {
    int (*variable)(const char*) = nullptr;
    int (*property)(const char*, int) = nullptr;
    int (*engine)(int) = nullptr;
};
inline NumericRuntimeHooks numeric_runtime_hooks;
inline uint32_t numeric_random_state = 0x9e3779b9;
inline uint32_t numeric_frame_count = 0;

inline int numeric_saturate(int64_t value) { return value < INT_MIN ? INT_MIN : value > INT_MAX ? INT_MAX : int(value); }
inline int numeric_sqrt(int value) {
    if(value <= 0) return 0;
    uint32_t remainder = uint32_t(value), root = 0, bit = 1u << 30;
    while(bit > remainder) bit >>= 2;
    while(bit) {
        if(remainder >= root + bit) { remainder -= root + bit; root = (root >> 1) + bit; }
        else root >>= 1;
        bit >>= 2;
    }
    return int(root);
}
/** Integer CORDIC angle in degrees; no floating-point library on the GBA. */
inline int numeric_atan2(int y_value, int x_value) {
    if(y_value == 0) return x_value < 0 ? 180 : 0;
    if(x_value == 0) return y_value > 0 ? 90 : -90;
    static constexpr int angles[] = { 47185920, 27855475, 14718068, 7471121, 3750058, 1876857, 938658, 469357, 234682, 117342, 58671, 29335, 14668, 7334, 3667, 1833, 917, 458, 229, 115, 57, 29, 14, 7 };
    int64_t x = int64_t(x_value) * 65536, y = int64_t(y_value) * 65536, angle = 0;
    if(x < 0) { x = -x; y = -y; angle = (y_value >= 0 ? 180LL : -180LL) * 1048576; }
    for(int index = 0; index < 24 && y; ++index) {
        const int64_t old_x = x;
        if(y > 0) { x += y >> index; y -= old_x >> index; angle += angles[index]; }
        else { x -= y >> index; y += old_x >> index; angle -= angles[index]; }
    }
    return int(angle / 1048576);
}
/** Bounded postfix evaluation: no recursive native calls or dynamic allocation. */
inline int evaluate_numeric_program(const NumericProgram& program) {
    if(!program.instructions || program.count < 1 || program.count > 127) return 0;
    int stack[16]{};
    int size = 0;
    for(int index = 0; index < program.count; ++index) {
        const auto& instruction = program.instructions[index];
        const auto operation = instruction.operation;
        int result = 0;
        if(operation == NumericOperation::op_number) result = instruction.value;
        else if(operation == NumericOperation::op_variable) result = numeric_runtime_hooks.variable ? numeric_runtime_hooks.variable(instruction.reference) : 0;
        else if(operation == NumericOperation::op_property) result = numeric_runtime_hooks.property ? numeric_runtime_hooks.property(instruction.reference, instruction.argument) : 0;
        else if(operation == NumericOperation::op_engine) result = numeric_runtime_hooks.engine ? numeric_runtime_hooks.engine(instruction.argument) : 0;
        else {
            const bool unary = operation == NumericOperation::op_abs || operation == NumericOperation::op_sqrt || operation == NumericOperation::op_not || operation == NumericOperation::op_bitNot;
            if(size < (unary ? 1 : 2)) return 0;
            const int b = unary ? 0 : stack[--size], a = stack[--size];
            switch(operation) {
                case NumericOperation::op_add: result = numeric_saturate(int64_t(a) + b); break;
                case NumericOperation::op_subtract: result = numeric_saturate(int64_t(a) - b); break;
                case NumericOperation::op_multiply: result = numeric_saturate(int64_t(a) * b); break;
                case NumericOperation::op_divide: result = b ? numeric_saturate(int64_t(a) / b) : 0; break;
                case NumericOperation::op_modulo: result = b ? int(int64_t(a) % b) : 0; break;
                case NumericOperation::op_min: result = a < b ? a : b; break;
                case NumericOperation::op_max: result = a > b ? a : b; break;
                case NumericOperation::op_abs: result = numeric_saturate(a < 0 ? -int64_t(a) : a); break;
                case NumericOperation::op_sqrt: result = numeric_sqrt(a); break;
                case NumericOperation::op_atan2: result = numeric_atan2(a, b); break;
                case NumericOperation::op_random: {
                    numeric_random_state ^= numeric_random_state << 13;
                    numeric_random_state ^= numeric_random_state >> 17;
                    numeric_random_state ^= numeric_random_state << 5;
                    const int low = a < b ? a : b, high = a > b ? a : b;
                    result = int(int64_t(low) + uint64_t(numeric_random_state) % (uint64_t(int64_t(high) - low) + 1));
                    break;
                }
                case NumericOperation::op_and: result = a && b; break;
                case NumericOperation::op_or: result = a || b; break;
                case NumericOperation::op_not: result = !a; break;
                case NumericOperation::op_equal: result = a == b; break;
                case NumericOperation::op_notEqual: result = a != b; break;
                case NumericOperation::op_greater: result = a > b; break;
                case NumericOperation::op_greaterEqual: result = a >= b; break;
                case NumericOperation::op_less: result = a < b; break;
                case NumericOperation::op_lessEqual: result = a <= b; break;
                case NumericOperation::op_shiftLeft: result = int(uint32_t(a) << (uint32_t(b) & 31)); break;
                case NumericOperation::op_shiftRight: result = a >> (uint32_t(b) & 31); break;
                case NumericOperation::op_bitAnd: result = a & b; break;
                case NumericOperation::op_bitOr: result = a | b; break;
                case NumericOperation::op_bitXor: result = a ^ b; break;
                case NumericOperation::op_bitNot: result = ~a; break;
                default: return 0;
            }
        }
        if(size >= 16) return 0;
        stack[size++] = result;
    }
    return size == 1 ? stack[0] : 0;
}

// A blocking command retains the values computed on its first execution frame.
// This prevents Random/actor properties from moving its destination each frame.
struct NumericEventCache {
    const void* command = nullptr;
    int values[16]{};
    bool ready = false;
    void reset() { command = nullptr; ready = false; }
};
inline bool resolve_numeric_event(const NumericEventValues& event, const void* command, const void* source,
                                  void* destination, std::size_t capacity, NumericEventCache& cache) {
    if(!source || !event.fields || event.count < 1 || event.count > 16 || event.payload_size > capacity) return false;
    if(cache.command != command) { cache.command = command; cache.ready = false; }
    auto* bytes = static_cast<unsigned char*>(destination);
    const auto* original = static_cast<const unsigned char*>(source);
    for(std::size_t index = 0; index < event.payload_size; ++index) bytes[index] = original[index];
    for(int index = 0; index < event.count; ++index) {
        const auto& field = event.fields[index];
        if(!field.program || field.offset + sizeof(int) > event.payload_size) return false;
        if(!cache.ready) {
            int value = evaluate_numeric_program(*field.program);
            cache.values[index] = value < field.minimum ? field.minimum : value > field.maximum ? field.maximum : value;
        }
        const auto* value_bytes = reinterpret_cast<const unsigned char*>(&cache.values[index]);
        for(std::size_t byte = 0; byte < sizeof(int); ++byte) bytes[field.offset + byte] = value_bytes[byte];
    }
    cache.ready = true;
    return true;
}
void configure_numeric_runtime();
#endif
