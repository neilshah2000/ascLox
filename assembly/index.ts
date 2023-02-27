// The entry file of your WebAssembly module.
import { Chunk, OpCode } from './chunk'
import { disassembleChunk } from './debug'
import { interpret, freeVM, initVM, InterpretResult } from './vm'
import { storeCodeString } from './memory'

export function main(code: string): void {
    // store this in linear memory and use pointers to reference it
    console.log()
    console.log()
    console.log(`== source code ==`)
    console.log(code)

    initVM()

    const result: InterpretResult = interpret(code)

    freeVM()
}
