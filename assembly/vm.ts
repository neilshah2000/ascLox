const FRAMES_MAX = 64
const STACK_MAX = 256

export class CallFrame {
    function: ObjFunction = new ObjFunction()
    ip: u8 = 0 // not a pointer like cLox

    // points into the VMs value stack. We are going to treat this as an array
    // but which index??
    // slots: Value = new Value

    // Instead of a c pointer (slots) which points into the correct start index of the VMs value stack, (relative)
    // we are just going to store the (absolute) start index
    // VM is global anyway so we can always access vm.stack
    // for start of the callframes slot window we do vm.stack[frame.slotsIndex]
    // and to offset from there, we do vm.stack[frame.slotsIndex + offset]
    slotsIndex: i32 = 0
}

export class VM {

    frames: StaticArray<CallFrame> = new StaticArray<CallFrame>(FRAMES_MAX).fill(new CallFrame())
    frameCount: i32 = 0

    // chunk: Chunk = new Chunk()
    // //// different from clox. we dont have pointers so we just store and use the index
    // //// instead of dereference the pointer (*ip), we use the ip array index (this.chunk.code[ip])
    // ip: u16 = 0 // location of instruction currently being executed


    stack: StaticArray<Value> = new StaticArray<Value>(STACK_MAX).fill(new Value())
    stackTop: i32 = 0 // points to the next empty slot in the stack
    globals: Table = new Map<ObjString, Value>()
    strings: Table = new Map<ObjString, Value>()
    objects: Obj | null = null
}

// global variable. TODO: use @global decorator??
export let vm: VM = new VM()

//////// declare vm early ////////////////////

import { Chunk, OpCode } from './chunk'
import { disassembleInstruction, traverseAndPrintObjects } from './debug'
import {
    AS_BOOL,
    AS_NUMBER,
    BOOL_VAL,
    IS_BOOL,
    IS_NIL,
    IS_NUMBER,
    NIL_VAL,
    NUMBER_VAL,
    OBJ_VAL,
    printValueToString,
    Value,
    valuesEqual,
    ValueType,
} from './value'
import { compile, printTokens } from './compiler'
import { AS_STRING, IS_STRING, Obj, ObjFunction, ObjString, takeString } from './object'
import { freeObjects } from './memory'
import { freeTable, initTable, Table, tableDelete, tableGet, tableSet } from './table'

export enum InterpretResult {
    INTERPRET_OK,
    INTERPRET_COMPILE_ERROR,
    INTERPRET_RUNTIME_ERROR,
}

function printObjects(): void {
    console.log()
    console.log(`== objects ==`)
    traverseAndPrintObjects(vm.objects)
    console.log()
}

function resetStack(): void {
    vm.stackTop = 0

    // TODO: keep??
    vm.objects = null
    vm.frameCount = 0
}

function runtimeError(format: string): void {
    let errorStr = ''
    errorStr = errorStr + format

    // const instruction: u16 = vm.ip - 1
    // const line: u16 = vm.chunk.lines[instruction]

    const frame: CallFrame = vm.frames[vm.frameCount - 1]
    const instruction: u16 = frame.ip - 1
    const line: u16 = frame.function.chunk.lines[instruction]

    errorStr = errorStr + `[line ${line}] in script`
    console.log(errorStr)
    resetStack()
}

export function initVM(): void {
    resetStack()

    vm.globals = initTable()
    vm.strings = initTable()
}

export function freeVM(): void {
    vm.strings = freeTable()
    vm.strings = freeTable()
    freeObjects()
}

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

function concatenate(): void {
    const b: ObjString = AS_STRING(pop())
    const a: ObjString = AS_STRING(pop())
    // in c need to allocate array and copy 2 strings in
    const chars: string = a.chars.concat(b.chars)
    const result: ObjString = takeString(chars)
    push(OBJ_VAL(result))
}

export function run(): InterpretResult {
    const frame: CallFrame = vm.frames[vm.frameCount - 1] // no closures!!!

    const READ_BYTE = (): u8 => {
        return frame.ip++ //??? 
    }

    const READ_CONSTANT = (): Value => {
        const constant = frame.function.chunk.constants.values[READ_BYTE()]
        // console.log(`read constant ${constant}`)
        return constant
    }

    // takes next 2 bytes from the chunk and builds a 16-bit integer from them
    const READ_SHORT = (): u16 => {
        frame.ip += 2;
        const short: u16 = <u16>((frame.function.chunk.code[frame.ip - 2] << 8) | frame.function.chunk.code[frame.ip - 1])
        return short
    }

    const READ_STRING = (): ObjString => {
        return AS_STRING(READ_CONSTANT())
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
        // disassembleInstruction(vm.chunk, vm.ip)
        // unlike clox, we are using indexes for ip not pointers, so we dont need to 
        // minus start pointer (frame->function->chunk->code) to get the offset
        // we already have the ip as a relative offset from beginning of bytecode
        disassembleInstruction(frame.function.chunk, frame.ip)
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
            case OpCode.OP_POP:
                pop()
                break
            case OpCode.OP_GET_LOCAL: {
                const slot: u8 = READ_BYTE();
                // push(frame.slots[slot])
                push(vm.stack[frame.slotsIndex + slot])
                break
            }
            case OpCode.OP_SET_LOCAL: {
                const slot: u8 = READ_BYTE()
                // vm.stack[slot] = peek(0)
                // frame.slots[slot] = peek(0)
                vm.stack[frame.slotsIndex + slot] = peek(0)
                break
            }
            case OpCode.OP_GET_GLOBAL: {
                const name: ObjString = READ_STRING()
                const value: Value | null = tableGet(vm.globals, name)
                if (value === null) {
                    runtimeError(`Undefined variable get ${name.chars}.`)
                    return InterpretResult.INTERPRET_RUNTIME_ERROR
                }
                push(value)
                break
            }
            case OpCode.OP_DEFINE_GLOBAL: {
                const name: ObjString = READ_STRING()
                tableSet(vm.globals, name, peek(0))
                pop()
                break
            }
            case OpCode.OP_SET_GLOBAL: {
                const name: ObjString = READ_STRING()
                if (tableSet(vm.globals, name, peek(0))) {
                    tableDelete(vm.globals, name)
                    runtimeError(`Undefined variable set ${name.chars}.`)
                    return InterpretResult.INTERPRET_RUNTIME_ERROR
                }
                break
            }
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
                if (IS_STRING(peek(0)) && IS_STRING(peek(1))) {
                    concatenate()
                } else if (IS_NUMBER(peek(0)) && IS_NUMBER(peek(1))) {
                    const b: f64 = AS_NUMBER(pop())
                    const a: f64 = AS_NUMBER(pop())
                    push(NUMBER_VAL(a + b))
                } else {
                    runtimeError('Operands must be two numbers or two strings.')
                    return InterpretResult.INTERPRET_RUNTIME_ERROR
                }
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
            case OpCode.OP_PRINT: {
                console.log(printValueToString(pop()))
                break
            }
            case OpCode.OP_JUMP: {
                const offset: u16 = READ_SHORT()
                // vm.ip += offset
                frame.ip += offset
                break;
            }
            case OpCode.OP_JUMP_IF_FALSE: {
                const offset: u16 = READ_SHORT()
                // if (isFalsey(peek(0))) vm.ip += offset
                if (isFalsey(peek(0))) frame.ip += offset
                break
            }
            case OpCode.OP_LOOP: {
                const offset: u16 = READ_SHORT()
                // vm.ip -= offset
                frame.ip -= offset
                break
            }
            case OpCode.OP_RETURN:
                // console.log(`return ${printValueToString(pop())}`)
                // exit interpreter
                return InterpretResult.INTERPRET_OK
        }
    }
}

// removed chunk as argument
export function interpret(source: string): InterpretResult {
    printTokens(source) // testing the scanner

    /////////////
    // const chunk: Chunk = new Chunk()

    // if (!compile(source, chunk)) {
    //     // free chunk
    //     return InterpretResult.INTERPRET_COMPILE_ERROR
    // }

    // vm.chunk = chunk
    // vm.ip = 0
    //////////////

    const myfunction: ObjFunction | null = compile(source)
    if (myfunction === null) return InterpretResult.INTERPRET_COMPILE_ERROR

    push(OBJ_VAL(myfunction))
    // vm. frames array is already filled with new initialized CallFrame objects

    // increment frameCount before giving out the first frame to the program,
    // so the compiler can implicityly claim the first stack slot for the VMs own internal use
    const frame: CallFrame = vm.frames[vm.frameCount++]
    frame.function = myfunction
    // frame.ip already initliaized
    // frame.slotIndex already initialized 0

    return run()

    // TODO: no more object printing
    // printObjects()
}
