import { ValueArray, Value } from './value'
import { GROW_CAPACITY, GROW_UINT8_ARRAY, GROW_UINT16_ARRAY } from './memory'

export enum OpCode {
    OP_CONSTANT,
    OP_ADD,
    OP_SUBTRACT,
    OP_MULTIPLY,
    OP_DIVIDE,
    OP_NEGATE,
    OP_RETURN,
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

    writeChunk(byte: u8, line: i16): void {
        if (this.capacity < this.count + 1) {
            const oldCapacity: i32 = this.capacity
            this.capacity = GROW_CAPACITY(oldCapacity)
            this.code = GROW_UINT8_ARRAY(this.code, oldCapacity, this.capacity)
            this.lines = GROW_UINT16_ARRAY(this.lines, oldCapacity, this.capacity)
        }

        this.code[this.count] = byte
        this.lines[this.count] = line
        this.count++
    }

    addConstant(value: Value): i32 {
        this.constants.writeValueArray(value)
        return this.constants.count - 1
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
