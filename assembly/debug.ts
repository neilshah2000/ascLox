import { Chunk, OpCode } from './chunk'
import { AS_FUNCTION, Obj, ObjFunction, ObjString, ObjType } from './object'
import { printValueToString } from './value'

const simpleInstruction = (name: string, offset: u32): u32 => {
    console.log(`${name}`)
    return offset + 1
}

const byteInstruction = (name: string, chunk: Chunk, offset: u32): u32 => {
    const slot: u8 = chunk.code[offset + 1]
    console.log(`${name} ${slot}`)
    return offset + 2
}

const jumpInstruction = (name: string, sign: i32, chunk: Chunk, offset: u32): u32 => {
    let jump: u16 = <u16>(chunk.code[offset + 1] << 8)
    jump |= chunk.code[offset + 2]
    // console.log(`>>>> reading jump = ${jump}`)
    console.log(`${name} ${offset} -> ${offset + 3 + sign * jump}`)
    return offset + 3
}

const constantInstruction = (name: string, chunk: Chunk, offset: u32): u32 => {
    const constant: u8 = chunk.code[offset + 1]
    const valueToString: string = printValueToString(chunk.constants.values[constant])
    console.log(`${name} \t\t\t\t\t${constant} \t\t\t\t\t'${valueToString}'`)
    return offset + 2
}

export const disassembleInstruction = (chunk: Chunk, offset: u32): u32 => {
    // offset of the instruction - number of bytes from the beginning of the chunk
    // line number, or | if the line number is same as previous
    // console.log(`>>>> capacity = ${chunk.capacity.toString()}`)
    // console.log(`>>>> offset = ${offset.toString()}`)
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
        case OpCode.OP_NIL: {
            return simpleInstruction(`${info} OP_NIL`, offset)
        }
        case OpCode.OP_TRUE: {
            return simpleInstruction(`${info} OP_TRUE`, offset)
        }
        case OpCode.OP_FALSE: {
            return simpleInstruction(`${info} OP_FALSE`, offset)
        }
        case OpCode.OP_POP: {
            return simpleInstruction(`${info} OP_POP`, offset)
        }
        case OpCode.OP_GET_LOCAL: {
            return byteInstruction(`${info} OP_GET_LOCAL`, chunk, offset)
        }
        case OpCode.OP_SET_LOCAL: {
            return byteInstruction(`${info} OP_SET_LOCAL`, chunk, offset)
        }
        case OpCode.OP_GET_GLOBAL: {
            return constantInstruction(`${info} OP_GET_GLOBAL`, chunk, offset)
        }
        case OpCode.OP_DEFINE_GLOBAL: {
            return constantInstruction(`${info} OP_DEFINE_GLOBAL`, chunk, offset)
        }
        case OpCode.OP_SET_GLOBAL: {
            return constantInstruction(`${info} OP_SET_GLOBAL`, chunk, offset)
        }
        case OpCode.OP_GET_UPVALUE: {
            return byteInstruction(`${info} OP_GET_UPVALUE`, chunk, offset);
        }
        case OpCode.OP_SET_UPVALUE: {
            return byteInstruction(`${info} OP_SET_UPVALUE`, chunk, offset);
        }
        case OpCode.OP_EQUAL: {
            return simpleInstruction(`${info} OP_EQUAL`, offset)
        }
        case OpCode.OP_GREATER: {
            return simpleInstruction(`${info} OP_GREATER`, offset)
        }
        case OpCode.OP_LESS: {
            return simpleInstruction(`${info} OP_LESS`, offset)
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
        case OpCode.OP_NOT: {
            return simpleInstruction(`${info} OP_NOT`, offset)
        }
        case OpCode.OP_NEGATE: {
            return simpleInstruction(`${info} OP_NEGATE`, offset)
        }
        case OpCode.OP_PRINT: {
            return simpleInstruction(`${info} OP_PRINT`, offset)
        }
        case OpCode.OP_JUMP: {
            return jumpInstruction(`${info} OP_JUMP`, 1, chunk, offset)
        }
        case OpCode.OP_JUMP_IF_FALSE: {
            return jumpInstruction(`${info} OP_JUMP_IF_FALSE`, 1, chunk, offset)
        }
        case OpCode.OP_LOOP: {
            return jumpInstruction(`${info} OP_LOOP`, -1, chunk, offset)
        }
        case OpCode.OP_CALL: {
            return byteInstruction(`${info} OP_CALL`, chunk, offset)
        }
        case OpCode.OP_CLOSURE: {
            offset++;
            const constant: u8 = chunk.code[offset++];
            const myStr = `${info} OP_CLOSURE \t${constant} \t\t\t${printValueToString(chunk.constants.values[constant])}`
            console.log(myStr)

            
            const myfunction: ObjFunction = AS_FUNCTION(chunk.constants.values[constant]);
            for (let j: u8 = 0; j < myfunction.upvalueCount; j++) {
                // upvalues
                let upStr = ''
                const isLocalConst = chunk.code[offset++];
                // console.log('is local num ' + isLocalConst.toString())
                // console.log('offset: ' + offset.toString())
                const isLocal: bool = <bool>isLocalConst
                const index: i32 = chunk.code[offset++];
                upStr = upStr + `${offset - 2}\t\t\t\t\t\t|\t\t\t${isLocal ? "local" : "upvalue"} ${index}`
                console.log(upStr)
            }
            

            return offset;
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

// traverse linked list of objects
// print each one in the list
export function traverseAndPrintObjects(start: Obj | null): void {
    let next = start
    while (next !== null) {
        const type = next.type
        switch (type) {
            case ObjType.OBJ_STRING:
                const myStringObj = <ObjString>next
                console.log(myStringObj.chars)
                break
            default:
                console.log('object not recognised')
        }
        next = next.next
    }
}
