import { Chunk, OpCode } from './chunk'
import { printValueToString } from './value'

const simpleInstruction = (name: string, offset: u32): u32 => {
    console.log(`${name}`)
    return offset + 1
}

const constantInstruction = (name: string, chunk: Chunk, offset: u32): u32 => {
    const constant: u8 = chunk.code[offset + 1]
    const valueToString = printValueToString(chunk.constants.values[constant])
    console.log(`${name} \t\t\t\t\t${constant} \t\t\t\t\t'${valueToString}'`)
    return offset + 2
}

export const disassembleInstruction = (chunk: Chunk, offset: u32): u32 => {
    // offset of the instruction - number of bytes from the beginning of the chunk
    // line number, or | if the line number is same as previous
    let info = ''
    if (offset > 0 && chunk.lines[offset] == chunk.lines[offset - 1]) {
        info = `${offset}  \t\t\t|  \t\t\t`
    } else {
        info = `${offset}  \t\t\t${chunk.lines[offset]}\t\t\t`
    }

    const instruction: u8 = chunk.code[offset]
    switch (instruction) {
        case OpCode.OP_CONSTANT: {
            return constantInstruction(`${info} OP_CONSTANT`, chunk, offset)
        }
        case OpCode.OP_ADD: {
            return simpleInstruction(`${info} OP_ADD`, offset)
        }
        case OpCode.OP_SUBTRACT: {
            return simpleInstruction(`${info} OP_SUBTRACT`, offset)
        }
        case OpCode.OP_MULTIPLY: {
            return simpleInstruction(`${info} OP_MULTIPLY`, offset)
        }
        case OpCode.OP_DIVIDE: {
            return simpleInstruction(`${info} OP_DIVIDE`, offset)
        }
        case OpCode.OP_NEGATE: {
            return simpleInstruction(`${info} OP_NEGATE`, offset)
        }
        case OpCode.OP_RETURN: {
            return simpleInstruction(`${info} OP_RETURN`, offset)
        }
        default: {
            console.log(`${offset} Unknown opcode ${instruction}`)
            return offset + 1
        }
    }
}

export const disassembleChunk = (chunk: Chunk, name: string): void => {
    console.log()
    console.log(`== ${name} ==`)
    console.log('offset  \tline no.  \t bytecode instruction name  \tconstant index  \tconstant value')
    for (let offset = 0; offset < chunk.count; ) {
        // disassembleInstruction increments the offset because instructions can have different sizes
        offset = disassembleInstruction(chunk, offset)
    }
}
