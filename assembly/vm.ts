import { Chunk, OpCode } from './chunk'
import { disassembleInstruction } from './debug'
import { printValueToString, Value } from './value'

enum InterpretResult {
    INTERPRET_OK,
    INTERPRET_COMPILE_ERROR,
    INTERPRET_RUNTIME_ERROR,
}

const STACK_MAX = 256

export class VM {
    chunk: Chunk = new Chunk()
    //// different from clox. we dont have pointers so we just store and use the index
    //// instead of dereference the pointer (*ip), we use the ip array index (this.chunk.code[ip])
    ip: u8 = 0 // location of instruction currently being executed
    stack: StaticArray<Value> = new StaticArray<Value>(STACK_MAX).fill(1.0)
    stackTop: i32 = 0 // points to the next empty slot in the stack
}

function resetStack(): void {
    vm.stackTop = 0
}

export function initVM(): void {
    vm.stack = new StaticArray<Value>(STACK_MAX).fill(1.0)
    resetStack()
    for (let i = 0; i < vm.stack.length; ++i) {
        vm.stack[i] = 0.0
    }
}

export function freeVM(): void {}

export function push(value: Value): void {
    // console.log(`push value ${printValueToString(value)}`)
    vm.stack[vm.stackTop] = value // TODO: no assignment here
    // vm.stack.push(value)
    vm.stackTop++
    // console.log(`stack top value: ${printValueToString(vm.stack[vm.stackTop - 1])}`)
}

export function pop(): Value {
    vm.stackTop--
    return vm.stack[vm.stackTop]
}

export function run(): InterpretResult {
    const READ_BYTE = (): u8 => {
        return vm.chunk.code[vm.ip++]
    }

    const READ_CONSTANT = (): Value => {
        const constant = vm.chunk.constants.values[READ_BYTE()]
        // console.log(`read constant ${constant}`)
        return constant
    }

    const BINARY_OP = (operatorFn: (a: f64, b: f64) => f64): void => {
        const b: f64 = pop()
        const a: f64 = pop()
        push(operatorFn(a, b))
    }

    while (true) {
        ////////////////// debugging chunks at runtime
        // DEBUG_TRACE_EXECUTION
        let stackPrint = '\t\t\t\t'
        for (let slot = 0; slot < vm.stackTop; slot++) {
            const valStr: string = printValueToString(vm.stack[slot])
            stackPrint = stackPrint + `[${valStr}]`
        }
        console.log(stackPrint)
        disassembleInstruction(vm.chunk, vm.ip)
        // END DEBUG_TRACE_EXECUTION

        let instruction: u8 = READ_BYTE()
        switch (instruction) {
            case OpCode.OP_CONSTANT: {
                const constant: Value = READ_CONSTANT()
                push(constant)
                // push(constant)
                break
            }
            case OpCode.OP_ADD: {
                BINARY_OP((a, b) => a + b)
                break
            }
            case OpCode.OP_SUBTRACT: {
                BINARY_OP((a, b) => a - b)
                break
            }
            case OpCode.OP_MULTIPLY: {
                BINARY_OP((a, b) => a * b)
                break
            }
            case OpCode.OP_DIVIDE: {
                BINARY_OP((a, b) => a / b)
                break
            }
            case OpCode.OP_NEGATE: {
                push(-pop())
                break
            }
            case OpCode.OP_RETURN: {
                console.log(`return ${printValueToString(pop())}`)
                return InterpretResult.INTERPRET_OK
            }
        }
    }
}

// removed chunk as argument
export function interpret(chunk: Chunk): InterpretResult {
    vm.chunk = chunk
    // we can not store the pointer like this
    // this.ip = this.chunk.code
    // so our ip is just an index and we reference this.chunk.code directly
    // but set the ip to 0 so it hits the beginning of our chunk of code
    vm.ip = 0
    return run()
}

// global variable. TODO: use @global decorator??
export let vm: VM = new VM()
