const FRAMES_MAX = 64
const STACK_MAX = 256

export class CallFrame {
    closure: ObjClosure = new ObjClosure(new ObjFunction())
    // pointer for bytecode in the chunk in the function
    // doesnt reference anything in the vm
    ip: u32 = 0 // not a pointer like cLox
    // How can we only have u8 for ip, when jumps are sometimes 2 bytes??
    // ANS: We get the u8 type when we dereference the pointer to the code array. ip can be any size

    // points into the VMs value stack. We are going to treat this as an array
    // but which index??
    // slots: Value = new Value

    // Instead of a c pointer (slots) which points into the correct start index of the VMs value stack, (relative)
    // we are just going to store the (absolute) start index
    // VM is global anyway so we can always access vm.stack
    // for start of the callframes slot window we do vm.stack[frame.slotsIndex]
    // and to offset from there, we do vm.stack[frame.slotsIndex + offset]
    // TODO: create functioons for these
    // slots are relative to this but it doesnt get incremented
    slotsIndex: i32 = 0
}

export class VM {
    // each slot in the array references the same single CallFrame object
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
    openUpvalues: ObjUpvalue | null = null // 1st in linked list of open upvalues
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
    IS_OBJ,
    NIL_VAL,
    NUMBER_VAL,
    OBJ_VAL,
    printValueToString,
    valToString,
    Value,
    valuesEqual,
    ValueType,
} from './value'
import { compile, printTokens } from './compiler'
import { AS_STRING, IS_STRING, OBJ_TYPE, Obj, ObjFunction, ObjString, takeString, ObjType, AS_FUNCTION, NativeFn, AS_NATIVE, copyString, ObjNative, ObjClosure, AS_CLOSURE, ObjUpvalue, newUpvalue, ObjClass, ObjInstance, AS_INSTANCE, IS_INSTANCE, AS_CLASS } from './object'
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

function printValueStack(): void {
    let outstr = '==== value stack ====\n'
    for (let i = 0; i < vm.stack.length; i++) {
        if (vm.stack[i].type !== ValueType.VAL_NIL) {
            outstr = outstr + printValueToString(vm.stack[i]) + '\n'
            // if closure object, print upvalues
            if (vm.stack[i].type === ValueType.VAL_OBJ && OBJ_TYPE(vm.stack[i]) === ObjType.OBJ_CLOSURE) {
                const myClosure: ObjClosure = AS_CLOSURE(vm.stack[i])
                if (myClosure.upvalueCount > 0) outstr = outstr + printClosureUpvalues(myClosure)
            }
        }
    }
    console.log(outstr)
}

function printClosureUpvalues(myClosure: ObjClosure): string {
    let cslStr = '--- closure ---\n'
    for (let i: u32 = 0; i < myClosure.upvalueCount; i++) {
        cslStr = cslStr + `upVal ${i.toString()}. ${valToString(myClosure.upvalues[i].locationValue)} [${myClosure.upvalues[i].locationIndex.toString()}]\n`
    }
    return cslStr
}

function resetStack(): void {
    vm.stackTop = 0

    // TODO: keep??
    vm.objects = null
    vm.frameCount = 0
    vm.openUpvalues = null
}

function runtimeError(format: string): void {
    let errorStr = ''
    errorStr = errorStr + format + '\n'

    for (let i = vm.frameCount - 1; i >= 0; i--) {
        const frame: CallFrame = vm.frames[i];
        const myfunction: ObjFunction = frame.closure.func;
        // no pointer artithmatic needed unlike cLox, because we already have the index
        const instructionIndex: u32 = frame.ip - 1;
        const line: u16 = myfunction.chunk.lines[instructionIndex]

        errorStr = errorStr + `[line ${line}] in `
        let fnName  = ''
        if (myfunction.name.chars == '') fnName = 'script\n'
        else fnName = myfunction.name.chars + '\n'
        errorStr = errorStr + fnName
    }

    console.log(errorStr)
    resetStack()
}

function defineNative(name: string, myfunction: NativeFn): void {
    push(OBJ_VAL(copyString(name)));
    push(OBJ_VAL(new ObjNative(myfunction)));
    tableSet(vm.globals, AS_STRING(vm.stack[0]), vm.stack[1]);
    pop();
    pop();
  }

export function initVM(): void {
    vm = new VM()

    resetStack()

    vm.globals = initTable()
    vm.strings = initTable()

    defineNative("clock", clockNative);
}

// getting timer function
// https://dr.lib.iastate.edu/server/api/core/bitstreams/cfd12617-3042-4724-b98c-2b6a65d22279/content
function clockNative(args: Array<Value>): Value {
    // return NUMBER_VAL(0)
    return NUMBER_VAL(<f64>(Date.now()));
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
    // console.log(`push so stack top index: ${vm.stackTop}`)
    // console.log(`stack top value: ${printValueToString(vm.stack[vm.stackTop - 1])}`)
}

export function pop(): Value {
    vm.stackTop--
    // console.log(`pop so stack top index: ${vm.stackTop}`)
    return vm.stack[vm.stackTop]
}

function peek(distance: i32): Value {
    return vm.stack[vm.stackTop - 1 - distance]
}

function call(closure: ObjClosure, argCount: u8): bool {
    if (argCount != closure.func.arity) {
        runtimeError(`Expected ${closure.func.arity} arguments but got ${argCount}.`);
        return false;
    }
    if (vm.frameCount == FRAMES_MAX) {
        runtimeError("Stack overflow.");
        return false;
    }

    // create new CallFrames
    const frame: CallFrame = new CallFrame()
    vm.frames[vm.frameCount] = frame
    vm.frameCount++

    frame.closure = closure
    // This simply initializes the next CallFrame on the stack.
    // It stores a pointer to the function being called
    // and points the frame’s ip to the beginning of the function’s bytecode.
    // Finally, it sets up the slots pointer to give the frame its window into the stack.
    // The arithmetic there ensures that the arguments already on the stack
    // line up with the function’s parameters:
    frame.ip = 0 // not myFunction.chunk.code;
    frame.slotsIndex = vm.stackTop - argCount - 1;
    return true;
  }

function callValue(callee: Value, argCount: u8): bool {
    if (IS_OBJ(callee)) {
        switch (OBJ_TYPE(callee)) {
            case ObjType.OBJ_CLASS: {
                const klass: ObjClass = AS_CLASS(callee);
                // TODO: check this slot is correct when translating from c to assemblyscript
                vm.stack[vm.stackTop - argCount - 1] = OBJ_VAL(new ObjInstance(klass));
                return true;
            }
            case ObjType.OBJ_CLOSURE:
                return call(AS_CLOSURE(callee), argCount);
            case ObjType.OBJ_NATIVE: {
                const native: NativeFn = AS_NATIVE(callee);
                const result: Value = native(vm.stack.slice(vm.stackTop - argCount, vm.stackTop - 1));
                vm.stackTop -= argCount + 1; // ??
                push(result);
                return true;
                }
            default:
                break; // Non-callable object type.
        }
    }
    runtimeError("Can only call functions and classes.");
    return false;
}

// compare local index with vm upvalue location index to simulate pointer arithmetic
function captureUpvalue(local: Value, vmLocalIndex: i32): ObjUpvalue {
    // check for existing upvalue before creating new one
    let prevUpvalue: ObjUpvalue | null = null
    let upvalue: ObjUpvalue | null = vm.openUpvalues;
    // TODO: location is a pointer so pointer arithmetic going on here
    // reasons to exit
    // We found an upvalue whose local slot is below the one we’re looking for.
    // Since the list is sorted, that means we’ve gone past the slot we are closing over,
    // and thus there must not be an existing upvalue for it.
    while (upvalue !== null && upvalue.locationIndex > vmLocalIndex) {
        prevUpvalue = upvalue;
        upvalue = upvalue.nextUpvalue;
    }

    // TODO: location is a pointer so pointer arithmetic going on here
    if (upvalue !== null && upvalue.locationIndex === vmLocalIndex) {
        console.log('capture upvalue found existing upvalue')
        return upvalue;
    }

    console.log('capture upvalue creating new upvalue')
    const createdUpvalue: ObjUpvalue = newUpvalue(local, vmLocalIndex);
    createdUpvalue.nextUpvalue = upvalue;

    if (prevUpvalue === null) {
        vm.openUpvalues = createdUpvalue;
    } else {
        prevUpvalue.nextUpvalue = createdUpvalue;
    }

    return createdUpvalue;
}

// TODO: pointer arithmetic going on in c here
// needs a pointer to a value either from the vm object or the call frame object
// we are going to use index here instead of pointer like in cLox
function closeUpvalues(last: i32): void {
    // TODO: pointer arithmetic
    // we only need the index to do the comparison
    while (vm.openUpvalues !== null && (<ObjUpvalue>vm.openUpvalues).locationIndex >= last) {
        const upvalue: ObjUpvalue = <ObjUpvalue>vm.openUpvalues;

        // We do not need the value in the vm stack slot,
        // because we are only moving things around internally within the upvalue

        // dereference location pointer and store value directly in upvalue closed field
        // ie move off the value stack and onto the heap
        upvalue.closed = upvalue.locationValue;

        // OP_GET_UPVALUE and OP_SET_UPVALUE instructions already look for the value
        // by dereferecning the location pointer
        // so we keep that and make that pointer point to the upvalues own internal closed field
        upvalue.locationValue = <Value>upvalue.closed;
        vm.openUpvalues = upvalue.nextUpvalue;
    }
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
    /////////
    // for (let i = 0; i < vm.frameCount; i++) {
    //     const frame: CallFrame = vm.frames[i]
    //     console.log(`frame ${i}: fn name:${frame.function.name.chars} ip: ${frame.ip}`)
    // }
    /////////


    let frame: CallFrame = vm.frames[vm.frameCount - 1] // no closures!!!

    const READ_BYTE = (myFrame: CallFrame): u8 => {
        // console.log(`reading byte from frame at ip ${myFrame.ip}`)
        return myFrame.closure.func.chunk.code[myFrame.ip++]
    }

    const READ_CONSTANT = (myFrame: CallFrame): Value => {
        const valueIndex = READ_BYTE(myFrame)
        // console.log(`read constant index ${valueIndex} from frame ${vm.frameCount - 1}`)
        const constant = myFrame.closure.func.chunk.constants.values[valueIndex]
        // console.log(`read constant ${constant}`)
        return constant
    }

    // takes next 2 bytes from the chunk and builds a 16-bit integer from them
    const READ_SHORT = (myFrame: CallFrame): u16 => {
        myFrame.ip += 2;
        const short: u16 = <u16>((myFrame.closure.func.chunk.code[myFrame.ip - 2] << 8) | myFrame.closure.func.chunk.code[myFrame.ip - 1])
        return short
    }

    const READ_STRING = (myFrame: CallFrame): ObjString => {
        return AS_STRING(READ_CONSTANT(myFrame))
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
        disassembleInstruction(frame.closure.func.chunk, frame.ip)
        // END DEBUG_TRACE_EXECUTION

        let instruction: u8 = READ_BYTE(frame)
        switch (instruction) {
            case OpCode.OP_CONSTANT:
                const constant: Value = READ_CONSTANT(frame)
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
                console.log('---- before local ----')
                printValueStack()
                const slot: u8 = READ_BYTE(frame);

                // BUG HERE??
                // value in the closure upvalue is 'assigned'
                // but this is getting 'before' from the value stack
                // the closure upvalue needs to point to the value stack item
                // (or is it the value stack? no its the main stack)
                // needs to be the same memory reference, so maybe that setup is wrong

                // push(frame.slots[slot])
                push(vm.stack[frame.slotsIndex + slot])
                console.log('---- after local ----')
                printValueStack()
                break
            }
            case OpCode.OP_SET_LOCAL: {
                const slot: u8 = READ_BYTE(frame)
                // vm.stack[slot] = peek(0)
                // frame.slots[slot] = peek(0)
                vm.stack[frame.slotsIndex + slot] = peek(0)
                break
            }
            case OpCode.OP_GET_GLOBAL: {
                const name: ObjString = READ_STRING(frame)
                const value: Value | null = tableGet(vm.globals, name)
                if (value === null) {
                    runtimeError(`Undefined variable get ${name.chars}.`)
                    return InterpretResult.INTERPRET_RUNTIME_ERROR
                }
                push(value)
                break
            }
            case OpCode.OP_DEFINE_GLOBAL: {
                const name: ObjString = READ_STRING(frame)
                tableSet(vm.globals, name, peek(0))
                pop()
                break
            }
            case OpCode.OP_SET_GLOBAL: {
                const name: ObjString = READ_STRING(frame)
                if (tableSet(vm.globals, name, peek(0))) {
                    tableDelete(vm.globals, name)
                    runtimeError(`Undefined variable set ${name.chars}.`)
                    return InterpretResult.INTERPRET_RUNTIME_ERROR
                }
                break
            }
            case OpCode.OP_GET_UPVALUE: {
                const slot: u8 = READ_BYTE(frame); // index of slot in call frame
                const vmSlotIndex = frame.slotsIndex + slot
                // TODO: slot or vmSlotIndex to get correct upvalue??
                // maybe dont need it because we are getting not setting
                const myValue = frame.closure.upvalues[slot].locationValue
                console.log('getting upvalue: ' + printValueToString(myValue) + ' from slot ' + slot.toString())
                console.log(`frame.slotsIndex: ${frame.slotsIndex}`)
                console.log(`vmSlotIndex: ${vmSlotIndex}`)
                printValueStack()
                push(myValue);
                break;
            }
            case OpCode.OP_SET_UPVALUE: {
                const slot: u8 = READ_BYTE(frame);
                const vmSlotIndex = frame.slotsIndex + slot
                const myValue = peek(0);
                printValueStack()
                console.log('setting upvalue: ' + printValueToString(myValue) + ' from slot ' + slot.toString() + ' with old value ' + printValueToString(frame.closure.upvalues[slot].locationValue))
                console.log(`frame.slotsIndex: ${frame.slotsIndex}`)
                console.log(`vmSlotIndex: ${vmSlotIndex}`)

                /////// IMPORTANT ////////////
                // vmSlotIndex is the slot index of the new value
                // NOT the slot index of the old value we are trying to replace
                // THAT index should not change. But the value should
                const slotIndexToChange = frame.closure.upvalues[slot].locationIndex
                // will change the value stored in upvalue, but not affect the stack
                // have to change it to keep upvalue in sync with stack
                frame.closure.upvalues[slot].locationValue = myValue
                // manually change the stack slot because our reference is not a pointer
                vm.stack[slotIndexToChange] = myValue

                printValueStack()
                break;
            }
            case OpCode.OP_GET_PROPERTY: {
                if (!IS_INSTANCE(peek(0))) {
                    runtimeError("Only instances have properties.");
                    return InterpretResult.INTERPRET_RUNTIME_ERROR;
                }

                const instance: ObjInstance = AS_INSTANCE(peek(0));
                const name: ObjString = READ_STRING(frame);
        
                const value: Value | null = tableGet(instance.fields, name);
                if (value !== null) {
                    pop(); // Instance.
                    push(value);
                    break;
                }

                runtimeError(`Undefined property ${name.chars}.`);
                return InterpretResult.INTERPRET_RUNTIME_ERROR;
            }
            case OpCode.OP_SET_PROPERTY: {
                if (!IS_INSTANCE(peek(1))) {
                    runtimeError("Only instances have fields.");
                    return InterpretResult.INTERPRET_RUNTIME_ERROR;
                }

                const instance: ObjInstance = AS_INSTANCE(peek(1));
                tableSet(instance.fields, READ_STRING(frame), peek(0));
                const value: Value = pop();
                pop();
                push(value);
                break;
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
                const offset: u16 = READ_SHORT(frame)
                // vm.ip += offset
                frame.ip += <u8>offset
                break;
            }
            case OpCode.OP_JUMP_IF_FALSE: {
                const offset: u16 = READ_SHORT(frame)
                // if (isFalsey(peek(0))) vm.ip += offset
                if (isFalsey(peek(0))) frame.ip += offset
                break
            }
            case OpCode.OP_LOOP: {
                const offset: u16 = READ_SHORT(frame)
                // vm.ip -= offset
                frame.ip -= offset
                break
            }
            case OpCode.OP_CALL: {
                const argCount: u8 = READ_BYTE(frame)
                if (!callValue(peek(argCount), argCount)) {
                  return InterpretResult.INTERPRET_RUNTIME_ERROR;
                }
                // if call was successful, it will have created a new frame for us
                frame = vm.frames[vm.frameCount - 1]
                break;
            }
            case OpCode.OP_CLOSURE: {
                const myfunction: ObjFunction = AS_FUNCTION(READ_CONSTANT(frame));
                const closure: ObjClosure = new ObjClosure(myfunction);
                push(OBJ_VAL(closure));
                // console.log('we walk through all of the operands after OP_CLOSURE to see what kind of upvalue each slot captures')
                for (let i: u32 = 0; i < closure.upvalueCount; i++) {
                    const isLocal: u8 = READ_BYTE(frame);
                    const index: u8 = READ_BYTE(frame);
                    if (isLocal === 1) {
                        // console.log('closes over local variable in enclosing function')
                        // use our implementation to get the call frame slot
                        const localIndex = frame.slotsIndex + index
                        const ourValue = vm.stack[localIndex]
                        closure.upvalues[i] = captureUpvalue(ourValue, localIndex);
                    } else {
                        // console.log('we capture an upvalue from the surrounding function')
                        closure.upvalues[i] = frame.closure.upvalues[index];
                    }
                }
                break;
            }
            case OpCode.OP_CLOSE_UPVALUE: {
                closeUpvalues(vm.stackTop - 1);
                pop();
                break;
            }
            case OpCode.OP_RETURN: {
                const result: Value = pop();
                // vm for frame index?? maybe vm
                // This is the reason closeUpvalues() accepts a pointer to a stack slot.
                // When a function returns, we call that same helper and pass in the first stack slot owned by the function.
                // By passing the first slot in the function’s stack window,
                // we close every remaining open upvalue owned by the returning function
                closeUpvalues(frame.slotsIndex);
                vm.frameCount--;
                if (vm.frameCount == 0) {
                    pop();
                    return InterpretResult.INTERPRET_OK;
                }
                // else, we discard all of the slots the callee was using for its parameters and local variables
                vm.stackTop = frame.slotsIndex;
                push(result);
                frame = vm.frames[vm.frameCount - 1];
                break;
            }
            case OpCode.OP_CLASS: {
                push(OBJ_VAL(new ObjClass(READ_STRING(frame))));
                break;
            }
        }
    }
}

// removed chunk as argument
export function interpret(source: string): InterpretResult {
    printTokens(source) // testing the scanner

    console.log(process.platform)

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

    push(OBJ_VAL(myfunction)) // should be a value with function type
    const closure: ObjClosure = new ObjClosure(myfunction)
    pop()
    push(OBJ_VAL(closure));

    // // vm. frames array is already filled with new initialized CallFrame objects
    // // increment frameCount before giving out the first frame to the program,
    // // so the compiler can implicityly claim the first stack slot for the VMs own internal use
    // const frame: CallFrame = vm.frames[vm.frameCount++]
    // frame.function = myfunction
    // // frame.ip already initliaized
    // // frame.slotIndex already initialized 0

    call(closure, 0);

    return run()

    // TODO: no more object printing
    // printObjects()
}
