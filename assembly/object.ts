import { Table, initTable, tableFindString, tableSet } from './table'
import { AS_OBJ, IS_OBJ, NIL_VAL, Value } from './value'
import { vm } from './vm'
import { Chunk } from './chunk'
import { debugLog } from '.'

export enum ObjType {
    OBJ_BOUND_METHOD,
    OBJ_CLASS,
    OBJ_CLOSURE,
    OBJ_FUNCTION,
    OBJ_INSTANCE,
    OBJ_NATIVE,
    OBJ_STRING,
    OBJ_UPVALUE
}

export class Obj {
    type: ObjType = ObjType.OBJ_STRING
    nextObj: Obj | null = null // make this an intrusive linked list to keep track of all Objs
}

export class ObjFunction extends Obj {
    arity: u8 = 0
    upvalueCount: u8 = 0
    chunk: Chunk = new Chunk()
    name: ObjString = new ObjString()

    constructor () {
        super()
        this.type = ObjType.OBJ_FUNCTION
    }
}

export type NativeFn = (args: Array<Value>) => Value

export class ObjNative extends Obj {
    natFunction: NativeFn = () => new Value()

    constructor(nativefn: NativeFn) {
        super()
        this.natFunction = nativefn
        this.type = ObjType.OBJ_NATIVE
    }
}

export class ObjString extends Obj {
    length: i32 = 0
    // do not store hash, we dont build our own hashtable
    chars: string = ''
}

export class ObjUpvalue extends Obj {
    // field that points to the closed-over variable.
    // Note that this is a pointer to a Value, not a Value itself.
    // It’s a reference to a variable, not a value.
    // This is important because it means that when we assign to the variable the upvalue captures,
    // we’re assigning to the actual variable, not a copy.
    /////////////////////////////////////
    // BUG: 
    locationValue: Value = new Value()
    // store index as well so we can compare indexes like pointers
    // index here will match slots in the vm's value stack
    locationIndex: i32 = -1
    // closed stores acutal value (not pointer to stack) once the value moves from stack to heap
    closed: Value | null = null
    nextUpvalue: ObjUpvalue | null = null
    constructor(t: bool, s: bool) { // put random paramaters so we dont call this constructor accidentally
        super()
        this.type = ObjType.OBJ_UPVALUE
    }
}

export class ObjClosure extends Obj {
    func: ObjFunction
    // indexes in the array match slots in the callframe
    upvalues: Array<ObjUpvalue> = new Array<ObjUpvalue>()
    upvalueCount: u32 = 0

    constructor(myFunc: ObjFunction) {
        super()
        this.func = myFunc
        this.type = ObjType.OBJ_CLOSURE

        // no ALLOCATE but may need for grabage collection
        this.upvalues = new Array<ObjUpvalue>(myFunc.upvalueCount)
        for (let i: u8 = 0; i < myFunc.upvalueCount; i++) {
            this.upvalues[i] = new ObjUpvalue(true, false) // ok one more here
        }
        this.upvalueCount = myFunc.upvalueCount
    }
}

export class ObjClass extends Obj{
    name: string = '';
    methods: Table

    constructor(name: ObjString) {
        super();
        this.type = ObjType.OBJ_CLASS
        this.name = name.chars
        this.methods = initTable()
    }
};

export class ObjInstance extends Obj {
    klass: ObjClass
    fields: Table

    constructor(myKlass: ObjClass) {
        super()
        this.type = ObjType.OBJ_INSTANCE
        this.klass = myKlass
        this.fields = initTable()
    }
};

export class ObjBoundMethod extends Obj{
    receiver: Value
    method: ObjClosure;

    constructor(receiver: Value, method: ObjClosure) {
        super()
        this.type = ObjType.OBJ_BOUND_METHOD
        this.receiver = receiver
        this.method = method
    }
} ;

// returns the type of object from the value
export function OBJ_TYPE(value: Value): ObjType {
    return AS_OBJ(value).type
}

export function IS_BOUND_METHOD(value: Value): bool {
    return isObjectType(value, ObjType.OBJ_BOUND_METHOD)
}

export function IS_CLASS(value: Value): bool {
    return isObjectType(value, ObjType.OBJ_CLASS)
}

export function IS_CLOSURE(value: Value): bool {
    return isObjectType(value, ObjType.OBJ_CLOSURE)
}

export function IS_FUNCTION(value: Value): bool {
    return isObjectType(value, ObjType.OBJ_FUNCTION)
}

export function IS_INSTANCE(value: Value): bool {
    return isObjectType(value, ObjType.OBJ_INSTANCE)
}

export function IS_NATIVE(value: Value): bool {
    return isObjectType(value, ObjType.OBJ_NATIVE)
}

export function IS_STRING(value: Value): bool {
    return isObjectType(value, ObjType.OBJ_STRING)
}

// returns ObjBoundMethod
export function AS_BOUND_METHOD(value: Value): ObjBoundMethod {
    return <ObjBoundMethod>AS_OBJ(value)
}

// returns ObjClass
export function AS_CLASS(value: Value): ObjClass {
    return <ObjClass>AS_OBJ(value)
}

// returns ObjClosure
export function AS_CLOSURE(value: Value): ObjClosure {
    return <ObjClosure>AS_OBJ(value)
}

// returns ObjFunction
export function AS_FUNCTION(value: Value): ObjFunction {
    return <ObjFunction>AS_OBJ(value)
}

// returns ObjInstance
export function AS_INSTANCE(value: Value): ObjInstance {
    return <ObjInstance>AS_OBJ(value)
}

// returns ObjFunction
export function AS_NATIVE(value: Value): NativeFn {
    return (<ObjNative>AS_OBJ(value)).natFunction
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
        debugLog('return interned string for copy')
        return interned
    }

    const copy: string = myString.slice(0)
    return allocateString(copy)
}

// takes a value and stores it in the upvalues location pointer
export function newUpvalue(slot: Value, vmSlotIndex: i32): ObjUpvalue {
    const upvalue: ObjUpvalue = <ObjUpvalue>ALLOCATE_OBJ(ObjType.OBJ_UPVALUE);
    upvalue.closed = null
    // BUG: stores a reference to the value on the stack.
    // but if we change it, it will change this reference, not the stack memory location
    // TODO: check how this works in java
    upvalue.locationValue = slot;
    upvalue.locationIndex = vmSlotIndex
    return upvalue;
}

export function printFunction(myFunction: ObjFunction): string {
    if (myFunction.name.chars == '') { // clox tests for function.name == null, we test for name.chars is empty string
        return '<script>'
    }
    return `<fn ${myFunction.name.chars}>`
}

// takes ownership of the original string
// does not copy it
export function takeString(myString: string): ObjString {
    // check if we already store it
    const interned: ObjString | null = tableFindString(vm.strings, myString)
    if (interned !== null) {
        debugLog('return interned string for take')
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
        case ObjType.OBJ_UPVALUE:
            obj = new ObjUpvalue(true, false) // no where else should new up an upvalue object
            break
    }

    // update linked list of all objects stored in vm
    obj.nextObj = vm.objects
    vm.objects = obj

    // debugLog(`== allocated object ==`)
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
                debugLog(fnStr)
                break
            case ObjType.OBJ_STRING:
                const myStringObj = <ObjString>next
                debugLog(`string: ${myStringObj.chars}`)
                break
            case ObjType.OBJ_UPVALUE:
                debugLog("upvalue");
                break;
              
            default:
                debugLog('object not recognised')
        }
        next = next.nextObj
    }
}
