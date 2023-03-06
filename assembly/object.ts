import { AS_OBJ, IS_OBJ, Value } from './value'
import { vm } from './vm'

export enum ObjType {
    OBJ_STRING,
}

export class Obj {
    type: ObjType = ObjType.OBJ_STRING
    next: Obj | null = null // make this an intrusive linked list to keep track of all Objs
}

export class ObjString extends Obj {
    length: i32 = 0
    chars: string = ''
}

// returns the type of object from the value
export function OBJ_TYPE(value: Value): ObjType {
    return AS_OBJ(value).type
}

export function IS_STRING(value: Value): bool {
    return isObjectType(value, ObjType.OBJ_STRING)
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
    const copy: string = myString.slice(0)
    return allocateString(copy)
}

// takes ownership of the original string
// does not copy it
export function takeString(myString: string): ObjString {
    return allocateString(myString)
}

function allocateString(myString: string): ObjString {
    const allocatedString: ObjString = <ObjString>ALLOCATE_OBJ(ObjType.OBJ_STRING)
    allocatedString.chars = myString
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
    return obj
}
