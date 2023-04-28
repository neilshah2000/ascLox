import { tableFindString, tableSet } from './table'
import { AS_OBJ, IS_OBJ, NIL_VAL, Value } from './value'
import { vm } from './vm'
import { Chunk } from './chunk'

export enum ObjType {
    OBJ_FUNCTION,
    OBJ_STRING,
}

export class Obj {
    type: ObjType = ObjType.OBJ_STRING
    next: Obj | null = null // make this an intrusive linked list to keep track of all Objs
}

export class ObjFunction extends Obj {
    obj: Obj = new Obj()
    arity: u8 = 0
    chunk: Chunk = new Chunk()
    name: ObjString = new ObjString()
}

export class ObjString extends Obj {
    length: i32 = 0
    // do not store hash, we dont build our own hashtable
    chars: string = ''
}

// returns the type of object from the value
export function OBJ_TYPE(value: Value): ObjType {
    return AS_OBJ(value).type
}

export function IS_FUNCTION(value: Value): bool {
    return isObjectType(value, ObjType.OBJ_FUNCTION)
}

export function IS_STRING(value: Value): bool {
    return isObjectType(value, ObjType.OBJ_STRING)
}

// returns ObjFunction
export function AS_FUNCTION(value: Value): ObjFunction {
    return <ObjFunction>AS_OBJ(value)
}

// returns ObjString
export function AS_STRING(value: Value): ObjString {
    return <ObjString>AS_OBJ(value)
}

// returns native string
export function AS_AS_STRING(value: Value): string {
    return (<ObjString>AS_OBJ(value)).chars
}

// checks if the value is a certain type
function isObjectType(value: Value, type: ObjType): bool {
    return IS_OBJ(value) && AS_OBJ(value).type === type
}

export function copyString(myString: string): ObjString {
    // bunch of memory stiff happens here in c
    // we need to allcoate the string char array (p347)
    // take a copy of the string so original is left intact

    // check if we already store it
    const interned: ObjString | null = tableFindString(vm.strings, myString)
    if (interned !== null) {
        console.log('return interned string for copy')
        return interned
    }

    const copy: string = myString.slice(0)
    return allocateString(copy)
}

function printFunction(myFunction: ObjFunction): string {
    if (myFunction.name.chars == '') { // clox tests for function.name == null, we test for name.chars is empty string
        return '<script>'
    }
    return `<fn ${myFunction.name.chars}`
}

// takes ownership of the original string
// does not copy it
export function takeString(myString: string): ObjString {
    // check if we already store it
    const interned: ObjString | null = tableFindString(vm.strings, myString)
    if (interned !== null) {
        console.log('return interned string for take')
        // FREE_ARRAY for the original string in cLox
        return interned
    }

    return allocateString(myString)
}

function allocateString(myString: string): ObjString {
    const allocatedString: ObjString = <ObjString>ALLOCATE_OBJ(ObjType.OBJ_STRING)
    allocatedString.chars = myString
    // using table list a hash set here
    tableSet(vm.strings, allocatedString, NIL_VAL())
    return allocatedString
}

function ALLOCATE_OBJ(type: ObjType): Obj {
    // use a switch because we cant generate a general object like in c
    let obj: Obj = new Obj() // must give concrete implementation in switch statement
    switch (type) {
        case ObjType.OBJ_STRING:
            obj = new ObjString()
            break
    }

    // update linked list of all objects stored in vm
    obj.next = vm.objects
    vm.objects = obj

    // console.log(`== allocated object ==`)
    // traversePrintObjects(obj)

    assert(obj !== null)

    return obj
}

// duplicate
export function traversePrintObjects(start: Obj | null): void {
    let next = start
    while (next !== null) {
        const type = next.type
        switch (type) {
            case ObjType.OBJ_FUNCTION:
                const myFunctionObj = <ObjFunction>next
                const fnStr = printFunction(myFunctionObj)
                console.log(fnStr)
                break
            case ObjType.OBJ_STRING:
                const myStringObj = <ObjString>next
                console.log(`string: ${myStringObj.chars}`)
                break
            default:
                console.log('object not recognised')
        }
        next = next.next
    }
}
