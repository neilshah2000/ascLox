import { Chunk, OpCode } from './chunk'
import { disassembleInstruction } from './debug'
import { AS_BOOL, AS_NUMBER, BOOL_VAL, IS_BOOL, IS_NIL, IS_NUMBER, NIL_VAL, NUMBER_VAL, printValueToString, Value, valuesEqual, ValueType } from './value'
import { compile, printTokens } from './compiler'

export enum InterpretResult {
    INTERPRET_OK,
    INTERPRET_COMPILE_ERROR,
    INTERPRET_RUNTIME_ERROR,
}

const STACK_MAX = 256

export class VM {
    chunk: Chunk = new Chunk()
    //// different from clox. we dont have pointers so we just store and use the index
    //// instead of dereference the pointer (*ip), we use the ip array index (this.chunk.code[ip])
    ip: u16 = 0 // location of instruction currently being executed
    stack: StaticArray<Value> = new StaticArray<Value>(STACK_MAX).fill(new Value())
    stackTop: i32 = 0 // points to the next empty slot in the stack
}

function resetStack(): void {
    vm.stackTop = 0
}

function runtimeError(format: string): void {
    let errorStr = ''
    errorStr = errorStr + format

    const instruction: u16 = vm.ip - 1
    const line: u16 = vm.chunk.lines[instruction]
    errorStr = errorStr + `[line ${line}] in script`
    console.log(errorStr)
    resetStack()
}

export function initVM(): void {
    // vm.stack = new StaticArray<Value>(STACK_MAX).fill(1.0)
    resetStack()
    // for (let i = 0; i < vm.stack.length; ++i) {
    //     vm.stack[i] = 0.0
    // }
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

function peek(distance: i32): Value {
    return vm.stack[vm.stackTop - 1 - distance]
}

function isFalsey(value: Value): bool {
    return IS_NIL(value) || (IS_BOOL(value) && !AS_BOOL(value))
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

    const BINARY_BOOL_OP = (operatorFn: (a: f64, b: f64) => bool): InterpretResult => {
        if (!IS_NUMBER(peek(0)) || !IS_NUMBER(peek(1))) {
            runtimeError('Operands must be numbers.')
            return InterpretResult.INTERPRET_RUNTIME_ERROR
        }
        const b: f64 = AS_NUMBER(pop())
        const a: f64 = AS_NUMBER(pop())

        push(BOOL_VAL(operatorFn(a, b)))
        return InterpretResult.INTERPRET_OK
    }

    const BINARY_NUM_OP = (operatorFn: (a: f64, b: f64) => f64): InterpretResult => {
        if (!IS_NUMBER(peek(0)) || !IS_NUMBER(peek(1))) {
            runtimeError('Operands must be numbers.')
            return InterpretResult.INTERPRET_RUNTIME_ERROR
        }
        const b: f64 = AS_NUMBER(pop())
        const a: f64 = AS_NUMBER(pop())

        push(NUMBER_VAL(operatorFn(a, b)))
        return InterpretResult.INTERPRET_OK
    }

    console.log()
    console.log(`== executing bytecode in VM ==`)
    while (true) {
        ////////////////// debugging chunks at runtime
        // DEBUG_TRACE_EXECUTION
        let stackPrint = '\t\t\t  stack->\t'
        for (let slot = 0; slot < vm.stackTop; slot++) {
            const valStr: string = printValueToString(vm.stack[slot])
            stackPrint = stackPrint + `[${valStr}]`
        }
        console.log(stackPrint)
        disassembleInstruction(vm.chunk, vm.ip)
        // END DEBUG_TRACE_EXECUTION

        let instruction: u8 = READ_BYTE()
        switch (instruction) {
            case OpCode.OP_CONSTANT:
                const constant: Value = READ_CONSTANT()
                push(constant)
                // push(constant)
                break
            case OpCode.OP_NIL:
                push(NIL_VAL())
                break
            case OpCode.OP_TRUE:
                push(BOOL_VAL(true))
                break
            case OpCode.OP_FALSE:
                push(BOOL_VAL(false))
                break
            case OpCode.OP_EQUAL:
                const b: Value = pop()
                const a: Value = pop()
                push(BOOL_VAL(valuesEqual(a, b)))
                break
            case OpCode.OP_GREATER: {
                const status = BINARY_BOOL_OP((a, b) => a > b)
                if (status == InterpretResult.INTERPRET_COMPILE_ERROR) {
                    return status
                } // else, do nothing carry on looping
                break
            }
            case OpCode.OP_LESS: {
                const status = BINARY_BOOL_OP((a, b) => a < b)
                if (status == InterpretResult.INTERPRET_COMPILE_ERROR) {
                    return status
                } // else, do nothing carry on looping
                break
            }
            case OpCode.OP_ADD: {
                const status = BINARY_NUM_OP((a, b) => a + b)
                if (status == InterpretResult.INTERPRET_COMPILE_ERROR) {
                    return status
                } // else, do nothing carry on looping
                break
            }
            case OpCode.OP_SUBTRACT: {
                const status = BINARY_NUM_OP((a, b) => a - b)
                if (status == InterpretResult.INTERPRET_COMPILE_ERROR) {
                    return status
                } // else, do nothing carry on looping
                break
            }
            case OpCode.OP_MULTIPLY: {
                const status = BINARY_NUM_OP((a, b) => a * b)
                if (status == InterpretResult.INTERPRET_COMPILE_ERROR) {
                    return status
                } // else, do nothing carry on looping
                break
            }
            case OpCode.OP_DIVIDE: {
                const status = BINARY_NUM_OP((a, b) => a / b)
                if (status == InterpretResult.INTERPRET_COMPILE_ERROR) {
                    return status
                } // else, do nothing carry on looping
                break
            }
            case OpCode.OP_NOT:
                push(BOOL_VAL(isFalsey(pop())))
                break
            case OpCode.OP_NEGATE:
                if (!IS_NUMBER(peek(0))) {
                    runtimeError('Operand must be a number.')
                    return InterpretResult.INTERPRET_RUNTIME_ERROR
                }
                push(NUMBER_VAL(-AS_NUMBER(pop())))
                break
            case OpCode.OP_RETURN:
                console.log(`return ${printValueToString(pop())}`)
                return InterpretResult.INTERPRET_OK
        }
    }
}

// removed chunk as argument
export function interpret(source: string): InterpretResult {
    printTokens(source) // testing the scanner

    const chunk: Chunk = new Chunk()

    if (!compile(source, chunk)) {
        // free chunk
        return InterpretResult.INTERPRET_COMPILE_ERROR
    }

    vm.chunk = chunk
    vm.ip = 0

    const result: InterpretResult = run()

    // free chunk
    return result
}

// global variable. TODO: use @global decorator??
export let vm: VM = new VM()
