// The entry file of your WebAssembly module.
import { Chunk, OpCode } from './chunk'
import { disassembleChunk } from './debug'
import { interpret, freeVM, initVM } from './vm'

export function main(code: string): void {
    console.log(`code: ${code}`)
    initVM()
    const chunk: Chunk = new Chunk()

    let constant: i32 = chunk.addConstant(1.2)
    chunk.writeChunk(<u8>OpCode.OP_CONSTANT, 123)
    chunk.writeChunk(<u8>constant, 123)

    constant = chunk.addConstant(3.4)
    chunk.writeChunk(<u8>OpCode.OP_CONSTANT, 123)
    chunk.writeChunk(<u8>constant, 123)

    chunk.writeChunk(<u8>OpCode.OP_ADD, 123)

    constant = chunk.addConstant(5.6)
    chunk.writeChunk(<u8>OpCode.OP_CONSTANT, 123)
    chunk.writeChunk(<u8>constant, 123)

    chunk.writeChunk(<u8>OpCode.OP_DIVIDE, 123)
    chunk.writeChunk(<u8>OpCode.OP_NEGATE, 123)

    chunk.writeChunk(<u8>OpCode.OP_RETURN, 123)

    disassembleChunk(chunk, 'test chunk')

    console.log()
    console.log()
    console.log(`== interpreting chunk thorugh VM ==`)
    interpret(chunk)
    freeVM()
    chunk.freeChunk()
}
