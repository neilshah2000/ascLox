import { ValueArray, Value } from './value'
import { GROW_CAPACITY, GROW_UINT8_ARRAY, GROW_UINT16_ARRAY } from './memory'

export enum OpCode {
    OP_CONSTANT,
    OP_NIL,
    OP_TRUE,
    OP_FALSE,
    OP_POP,
    OP_GET_LOCAL,
    OP_SET_LOCAL,
    OP_GET_GLOBAL,
    OP_DEFINE_GLOBAL,
    OP_SET_GLOBAL,
    OP_GET_UPVALUE,
    OP_SET_UPVALUE,
    OP_GET_PROPERTY,
    OP_SET_PROPERTY,
    OP_EQUAL,
    OP_GREATER,
    OP_LESS,
    OP_ADD,
    OP_SUBTRACT,
    OP_MULTIPLY,
    OP_DIVIDE,
    OP_NOT,
    OP_NEGATE,
    OP_PRINT,
    OP_JUMP,
    OP_JUMP_IF_FALSE,
    OP_LOOP,
    OP_CALL,
    OP_CLOSURE,
    OP_CLOSE_UPVALUE,
    OP_RETURN,
    OP_CLASS,
}

export class Chunk {
    count: i32
    capacity: i32 // do we needs this?? is it maintained by the Uint8Array by itself
    code: Uint8Array /* Bytecode is a series of instructions. This is a dynamic array. Each instruction has a 1-byte opcode, most have another 1-byte constants index */
    lines: Uint16Array
    constants: ValueArray

    // same as initChunk()
    constructor() {
        this.count = 0
        this.capacity = 0
        this.code = new Uint8Array(0)
        this.lines = new Uint16Array(0)
        this.constants = new ValueArray()
    }

    writeChunk(byte: i32, line: u16): void {
        if (this.capacity < this.count + 1) {
            const oldCapacity: i32 = this.capacity
            this.capacity = GROW_CAPACITY(oldCapacity)
            this.code = GROW_UINT8_ARRAY(this.code, oldCapacity, this.capacity * 2)
            this.lines = GROW_UINT16_ARRAY(this.lines, oldCapacity, this.capacity * 2)
        }

        // argument is i32 to accept enums, but we only store u8
        this.code[this.count] = <u8>byte
        this.lines[this.count] = line
        this.count++
    }

    // bytecode chunks are u8, so max index they can reference in the value array is 256
    addConstant(value: Value): u8 {
        this.constants.writeValueArray(value)
        return <u8>this.constants.count - 1 // shouldn't get more that 256 constants because compiler.makeConstant() limites it at runtime
    }

    freeChunk(): void {
        // FREE_CODE_ARRAY

        // FREE_VALUE_ARRAY

        // initChunk()
        this.count = 0
        this.capacity = 0
        this.code = new Uint8Array(0)
        this.lines = new Uint16Array(0)
        this.constants = new ValueArray()
    }
}
